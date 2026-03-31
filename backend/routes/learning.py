from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/learning", tags=["learning"])

CATEGORY_LABELS = {
    "second_opinion": "חוות דעת",
    "surgery": "ניתוחים",
    "transplant": "השתלות",
    "hospitalization": "אישפוזים",
    "rehabilitation": "שיקום / טיפולים",
    "advanced_tech": "טכנולוגיות חדישות",
    "critical_illness": "מחלות קשות",
    "diagnostics": "בדיקות והדמיה",
}

ALL_CATEGORIES = list(CATEGORY_LABELS.keys())


def _get_company_key(source: models.InsuranceSource) -> str:
    if source.source_type == "sal_habriut":
        return "סל הבריאות"
    elif source.source_type == "kupat_holim":
        hmos = {"clalit": "כללית", "maccabi": "מכבי", "meuhedet": "מאוחדת", "leumit": "לאומית"}
        return f"קופ\"ח {hmos.get(source.hmo_name, source.hmo_name or '')}"
    elif source.source_type == "bituch_leumi":
        return "ביטוח לאומי"
    elif source.source_type in ["har_habitua", "private"]:
        return source.company_name or source.source_type
    return source.source_type


def _compute_approval_rates(db: Session):
    resolved_statuses = ["approved", "partial", "rejected"]
    claims = db.query(models.Claim).filter(models.Claim.status.in_(resolved_statuses)).all()

    company_stats = {}
    for claim in claims:
        source = db.query(models.InsuranceSource).filter(
            models.InsuranceSource.id == claim.insurance_source_id
        ).first()
        if not source:
            continue
        key = _get_company_key(source)
        if key not in company_stats:
            company_stats[key] = {
                "total": 0, "approved": 0, "partial": 0, "rejected": 0,
                "total_requested": 0.0, "total_approved": 0.0,
            }
        company_stats[key]["total"] += 1
        company_stats[key][claim.status] += 1
        if claim.amount_requested:
            company_stats[key]["total_requested"] += claim.amount_requested
        if claim.amount_approved:
            company_stats[key]["total_approved"] += claim.amount_approved

    result = []
    for key, stats in company_stats.items():
        rate = round(
            (stats["approved"] + stats["partial"] * 0.5) / stats["total"] * 100, 1
        ) if stats["total"] > 0 else 0.0
        avg_pct = round(
            stats["total_approved"] / stats["total_requested"] * 100, 1
        ) if stats["total_requested"] > 0 else None
        result.append({
            "company_name": key,
            "total_claims": stats["total"],
            "approved": stats["approved"],
            "partial": stats["partial"],
            "rejected": stats["rejected"],
            "approval_rate": rate,
            "avg_approval_pct": avg_pct,
        })

    return sorted(result, key=lambda x: x["approval_rate"], reverse=True)


@router.get("/insights")
def get_global_insights(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    approval_rates = _compute_approval_rates(db)

    # Most rejected categories
    resolved_statuses = ["approved", "partial", "rejected"]
    all_resolved = db.query(models.Claim).filter(models.Claim.status.in_(resolved_statuses)).all()

    category_stats = {}
    for claim in all_resolved:
        cat = claim.category
        if cat not in category_stats:
            category_stats[cat] = {"total": 0, "rejected": 0}
        category_stats[cat]["total"] += 1
        if claim.status == "rejected":
            category_stats[cat]["rejected"] += 1

    common_gaps = sorted(
        [
            {
                "category": k,
                "category_label": CATEGORY_LABELS.get(k, k),
                "rejections": v["rejected"],
                "total": v["total"],
                "rejection_rate": round(v["rejected"] / v["total"] * 100, 1) if v["total"] else 0,
            }
            for k, v in category_stats.items()
            if v["rejected"] > 0
        ],
        key=lambda x: x["rejections"],
        reverse=True,
    )[:5]

    total_claims = db.query(models.Claim).count()
    total_resolved = len(all_resolved)
    total_patients = db.query(models.Patient).count()

    return {
        "approval_rates": approval_rates,
        "common_gaps": common_gaps,
        "total_claims_analyzed": total_resolved,
        "total_claims": total_claims,
        "total_patients": total_patients,
    }


@router.get("/patients/{patient_id}/insights")
def get_patient_insights(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Global approval rates
    global_rates = _compute_approval_rates(db)

    # Similar patients by HMO
    similar_patients = []
    if patient.hmo_name:
        similar_patients = db.query(models.Patient).filter(
            models.Patient.hmo_name == patient.hmo_name,
            models.Patient.id != patient_id,
        ).all()

    # Gaps among similar patients
    similar_gaps_count = {cat: 0 for cat in ALL_CATEGORIES}
    for sp in similar_patients:
        sp_sources = db.query(models.InsuranceSource).filter(
            models.InsuranceSource.patient_id == sp.id,
            models.InsuranceSource.is_active == True,
        ).all()
        covered = set()
        for src in sp_sources:
            for cov in src.coverages:
                if cov.is_covered:
                    covered.add(cov.category)
        for cat in ALL_CATEGORIES:
            if cat not in covered:
                similar_gaps_count[cat] += 1

    similar_gaps = sorted(
        [
            {
                "category": k,
                "category_label": CATEGORY_LABELS.get(k, k),
                "count": v,
                "pct": round(v / len(similar_patients) * 100) if similar_patients else 0,
            }
            for k, v in similar_gaps_count.items()
            if v > 0
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:4]

    # This patient's own claim outcomes per company
    patient_claims = db.query(models.Claim).filter(models.Claim.patient_id == patient_id).all()
    confidence_map = {}
    for claim in patient_claims:
        if claim.status not in ["approved", "partial", "rejected"]:
            continue
        src = db.query(models.InsuranceSource).filter(
            models.InsuranceSource.id == claim.insurance_source_id
        ).first()
        if not src:
            continue
        key = _get_company_key(src)
        if key not in confidence_map:
            confidence_map[key] = {"total": 0, "approved": 0}
        confidence_map[key]["total"] += 1
        if claim.status in ["approved", "partial"]:
            confidence_map[key]["approved"] += 1

    patient_confidence = {
        k: round(v["approved"] / v["total"] * 100) if v["total"] > 0 else None
        for k, v in confidence_map.items()
    }

    return {
        "similar_patients_count": len(similar_patients),
        "hmo_name": patient.hmo_name,
        "similar_gaps": similar_gaps,
        "company_approval_rates": global_rates,
        "patient_confidence": patient_confidence,
    }


class ScoreFeedback(BaseModel):
    company_name: str
    outcome: str  # approved / partial / rejected


@router.post("/feedback")
def submit_feedback(
    data: ScoreFeedback,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    score = db.query(models.ResponsivenessScore).filter(
        models.ResponsivenessScore.company_name == data.company_name
    ).first()

    if not score:
        return {"message": "חברה לא נמצאה", "updated": False}

    delta = {"approved": 0.3, "partial": 0.1, "rejected": -0.3}.get(data.outcome, 0)

    score.response_speed = round(max(1.0, min(10.0, score.response_speed + delta)), 1)
    score.bureaucracy_level = round(max(1.0, min(10.0, score.bureaucracy_level + delta * 0.5)), 1)
    score.overall_score = round((score.response_speed + score.bureaucracy_level) / 2, 1)
    score.is_default = False

    db.commit()
    db.refresh(score)

    return {
        "message": f"ציון {data.company_name} עודכן ל-{score.overall_score}/10",
        "updated": True,
        "new_score": score.overall_score,
    }
