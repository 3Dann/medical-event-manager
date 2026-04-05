from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/patients/{patient_id}/strategy", tags=["strategy"])

CATEGORY_LABELS = {
    "second_opinion": "חוות דעת",
    "surgery": "ניתוחים",
    "transplant": "השתלות",
    "hospitalization": "אישפוזים",
    "rehabilitation": "שיקום / טיפולים",
    "advanced_tech": "טכנולוגיות חדישות",
    "critical_illness": "תגמול חד פעמי — מחלות קשות",
    "diagnostics": "בדיקות והדמיה",
}

SOURCE_PRIORITY = {
    "sal_habriut": 1,
    "bituch_leumi": 2,
    "kupat_holim": 3,
    "har_habitua": 4,
    "private": 5,
}


def get_responsiveness(company_name: str, source_type: str, db: Session):
    score = db.query(models.ResponsivenessScore).filter(
        models.ResponsivenessScore.company_name == company_name
    ).first()
    if score:
        return score.overall_score
    # Default scores by type
    defaults = {
        "sal_habriut": 8.0,
        "bituch_leumi": 5.5,
        "kupat_holim": 7.0,
        "har_habitua": 6.0,
        "private": 7.5,
    }
    return defaults.get(source_type, 6.0)


@router.get("")
def get_strategy(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    sources = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient_id,
        models.InsuranceSource.is_active == True
    ).all()

    if not sources:
        return {"recommendations": [], "summary": {"total_covered": 0, "out_of_pocket": 0, "gaps": []}}

    # Build coverage matrix
    coverage_matrix = {}
    for source in sources:
        for coverage in source.coverages:
            if coverage.category not in coverage_matrix:
                coverage_matrix[coverage.category] = []
            responsiveness = get_responsiveness(
                source.company_name or source.hmo_name or source.source_type,
                source.source_type, db
            )
            coverage_matrix[coverage.category].append({
                "source_id": source.id,
                "source_type": source.source_type,
                "source_label": _source_label(source),
                "is_covered": coverage.is_covered,
                "amount": coverage.coverage_amount,
                "percentage": coverage.coverage_percentage,
                "copay": coverage.copay,
                "annual_limit": coverage.annual_limit,
                "conditions": coverage.conditions,
                "abroad": coverage.abroad_covered,
                "responsiveness": responsiveness,
                "base_priority": SOURCE_PRIORITY.get(source.source_type, 9),
            })

    # Sort each category by: base_priority first, then responsiveness (descending)
    recommendations = []
    total_estimated_coverage = 0
    gaps = []

    for category, coverages in coverage_matrix.items():
        covered = [c for c in coverages if c["is_covered"]]
        if not covered:
            gaps.append(CATEGORY_LABELS.get(category, category))
            continue

        # Sort: lower base_priority first, higher responsiveness first
        sorted_coverages = sorted(covered, key=lambda x: (x["base_priority"], -x["responsiveness"]))

        claim_sequence = []
        for i, c in enumerate(sorted_coverages):
            reason = _build_reason(c, i)
            claim_sequence.append({
                "order": i + 1,
                "source_id": c["source_id"],
                "source_label": c["source_label"],
                "amount": c["amount"],
                "percentage": c["percentage"],
                "copay": c["copay"],
                "responsiveness_score": round(c["responsiveness"], 1),
                "reason": reason,
            })
            if c["amount"]:
                total_estimated_coverage += c["amount"]

        recommendations.append({
            "category": category,
            "category_label": CATEGORY_LABELS.get(category, category),
            "claim_sequence": claim_sequence,
            "total_sources": len(claim_sequence),
        })

    # Add sal_habriut as base if not in coverages
    sal_exists = any(s.source_type == "sal_habriut" for s in sources)
    if not sal_exists:
        recommendations.insert(0, {
            "category": "sal_habriut_base",
            "category_label": "סל הבריאות — בסיס",
            "claim_sequence": [{
                "order": 1,
                "source_label": "סל הבריאות",
                "amount": None,
                "percentage": None,
                "copay": None,
                "responsiveness_score": 8.0,
                "reason": "תמיד יש לבדוק זכאות בסל הבריאות לפני כל מקור אחר",
            }],
            "total_sources": 1,
        })

    return {
        "recommendations": recommendations,
        "summary": {
            "total_sources": len(sources),
            "categories_covered": len(coverage_matrix),
            "gaps": gaps,
            "estimated_total_coverage": total_estimated_coverage,
        }
    }


@router.get("/matrix")
def get_coverage_matrix(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    sources = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient_id
    ).all()

    all_categories = list(CATEGORY_LABELS.keys())
    matrix = []

    for category in all_categories:
        row = {
            "category": category,
            "category_label": CATEGORY_LABELS[category],
            "sources": []
        }
        for source in sources:
            coverage = next((c for c in source.coverages if c.category == category), None)
            row["sources"].append({
                "source_id": source.id,
                "source_label": _source_label(source),
                "source_type": source.source_type,
                "is_covered": coverage.is_covered if coverage else False,
                "amount": coverage.coverage_amount if coverage else None,
                "percentage": coverage.coverage_percentage if coverage else None,
                "copay": coverage.copay if coverage else None,
                "conditions": coverage.conditions if coverage else None,
                "abroad": coverage.abroad_covered if coverage else False,
            })
        matrix.append(row)
    return {"matrix": matrix, "sources": [{"id": s.id, "label": _source_label(s), "type": s.source_type} for s in sources]}


def _source_label(source):
    if source.source_type == "sal_habriut":
        return "סל הבריאות"
    elif source.source_type == "kupat_holim":
        levels = {"basic": "בסיס", "mushlam": "משלים", "premium": "פרמיום", "zahav": "זהב"}
        hmos = {"clalit": "כללית", "maccabi": "מכבי", "meuhedet": "מאוחדת", "leumit": "לאומית"}
        return f"קופ\"ח {hmos.get(source.hmo_name, source.hmo_name or '')} — {levels.get(source.hmo_level, source.hmo_level or '')}"
    elif source.source_type == "har_habitua":
        return f"הר הביטוח — {source.company_name or ''}"
    elif source.source_type == "private":
        ptype = "אובדן כושר עבודה" if source.policy_type == "disability" else "ביטוח רפואי"
        return f"{source.company_name or 'פרטי'} ({ptype})"
    elif source.source_type == "bituch_leumi":
        return "ביטוח לאומי"
    return source.source_type


def _build_reason(coverage, index):
    reasons = []
    if index == 0:
        if coverage["source_type"] == "sal_habriut":
            reasons.append("סל הבריאות — כיסוי בסיסי חובה, ללא עלות")
        elif coverage["source_type"] == "bituch_leumi":
            reasons.append("ביטוח לאומי — זכאות ממשלתית, יש לממש ראשון")
        else:
            reasons.append("מקור ראשון מומלץ לפי עדיפות ורספונסיביות")
    else:
        reasons.append(f"מקור משלים — ציון רספונסיביות: {round(coverage['responsiveness'], 1)}/10")
    if coverage.get("copay"):
        reasons.append(f"השתתפות עצמית: ₪{coverage['copay']:,.0f}")
    if coverage.get("abroad"):
        reasons.append("כולל כיסוי בחו\"ל")
    return " | ".join(reasons)
