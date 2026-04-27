"""
ניתוח AI של פוליסות ביטוח + מפה פיננסית + ניתוח כיסוי לצומת.
מממש את המיזוג בין policy-analyzer לבין medical-event-manager.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import json

from database import get_db
import models
import auth as auth_utils
from document_parser import parse_document
from ai_analyzer import analyze_policy, analyze_event_coverage

router = APIRouter(tags=["policy-ai"])


# ── Coverage category labels (shared) ────────────────────────────────────────
COVERAGE_LABELS = {
    "surgery": "ניתוחים",
    "hospitalization": "אשפוז",
    "second_opinion": "חוות דעת שנייה",
    "transplant": "השתלות",
    "rehabilitation": "שיקום",
    "advanced_tech": "טיפולים בטכנולוגיות מתקדמות",
    "critical_illness": "מחלות קשות",
    "diagnostics": "בדיקות ואבחון",
    "specialist": "ביקור מומחה",
    "medications": "תרופות מחוץ לסל",
    "nursing_care": "סיעוד",
    "disability_monthly": "אובדן כושר עבודה (חודשי)",
    "death_benefit": "פטירה",
    "loss_of_work_capacity": "אובדן כושר עבודה",
}


def _source_label(s: models.InsuranceSource) -> str:
    if s.source_type == "kupat_holim":
        return f"קופ\"ח {s.hmo_name or ''} — {s.hmo_level or ''}"
    if s.source_type == "sal_habriut":
        return "סל הבריאות"
    if s.source_type == "har_habitua":
        return f"הר הביטוח — {s.company_name or ''}"
    if s.source_type == "bituch_leumi":
        return "ביטוח לאומי"
    return f"{s.company_name or 'פרטי'} — {s.policy_number or ''}"


def _responsiveness(db: Session, company: str) -> Optional[float]:
    score = db.query(models.ResponsivenessScore).filter(
        models.ResponsivenessScore.company_name == company
    ).first()
    return score.overall_score if score else None


# ═══════════════════════════════════════════════════════════════════════
# 1.  ניתוח AI של PDF פוליסה (מחליף private_import)
# ═══════════════════════════════════════════════════════════════════════

@router.post("/api/patients/{patient_id}/insurance/analyze-ai")
async def analyze_insurance_pdf_ai(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    """קבל PDF / Excel של פוליסה → נתח עם Claude → צור/עדכן InsuranceSource + כיסויים."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="מטופל לא נמצא")

    content = await file.read()
    text = parse_document(file.filename, content)
    if not text.strip():
        raise HTTPException(status_code=422, detail="לא ניתן לחלץ טקסט מהקובץ")

    # ── AI analysis ───────────────────────────────────────────────────
    result = await analyze_policy(text)

    # ── Map AI result → InsuranceSource ──────────────────────────────
    insurer = result.get("insurer", "")
    policy_number = result.get("policy_number", "")
    monthly_premium = result.get("monthly_premium")
    policy_type = result.get("policy_type", "health")

    # בדוק כפילות
    existing = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient_id,
        models.InsuranceSource.policy_number == policy_number,
        models.InsuranceSource.company_name == insurer,
    ).first() if policy_number else None

    if existing:
        src = existing
    else:
        src = models.InsuranceSource(
            patient_id=patient_id,
            source_type="private",
            company_name=insurer or "לא זוהה",
            policy_number=policy_number or None,
            policy_type=policy_type,
            notes=f"נותח ע\"י AI | confidence: {result.get('confidence', 0):.0%}",
        )
        db.add(src)
        db.flush()

    # ── Map AI coverages → InsuranceCoverage ─────────────────────────
    ai_coverages = result.get("coverages", {})

    # מיפוי: שמות AI → קטגוריות של המערכת
    MAPPING = {
        "surgery": "surgery",
        "hospitalization": "hospitalization",
        "specialist": "second_opinion",
        "fast_diagnosis": "diagnostics",
        "advanced_treatments": "advanced_tech",
        "medications": "medications",
        "nursing_care": "nursing_care",
        "critical_illness_lumpsum": "critical_illness",
        "disability_monthly": "disability_monthly",
        "death_benefit": "death_benefit",
        "loss_of_work_capacity": "loss_of_work_capacity",
    }

    for ai_key, our_key in MAPPING.items():
        cov_data = ai_coverages.get(ai_key, {})
        if not isinstance(cov_data, dict):
            continue
        is_covered = cov_data.get("covered", False)
        amount_str = cov_data.get("amount", "") or ""
        notes = cov_data.get("notes", "") or cov_data.get("waiting_period", "") or ""

        # try to parse amount as float
        import re as _re
        amount_val = None
        m = _re.search(r"[\d,]+(?:\.\d+)?", amount_str.replace(",", ""))
        if m:
            try:
                amount_val = float(m.group().replace(",", ""))
            except Exception:
                pass

        existing_cov = db.query(models.Coverage).filter(
            models.Coverage.insurance_source_id == src.id,
            models.Coverage.category == our_key,
        ).first()

        if existing_cov:
            existing_cov.is_covered = is_covered
            existing_cov.coverage_amount = amount_val
            existing_cov.notes = (amount_str + (" — " + notes if notes else "")).strip(" —")
        else:
            db.add(models.Coverage(
                insurance_source_id=src.id,
                category=our_key,
                is_covered=is_covered,
                coverage_amount=amount_val,
                notes=(amount_str + (" — " + notes if notes else "")).strip(" —") or None,
            ))

    db.commit()
    db.refresh(src)

    return {
        "source_id": src.id,
        "insurer": insurer,
        "policy_number": policy_number,
        "policy_type": policy_type,
        "monthly_premium": monthly_premium,
        "confidence": result.get("confidence", 0),
        "coverages_detected": sum(1 for v in ai_coverages.values()
                                  if isinstance(v, dict) and v.get("covered")),
        "key_exclusions": result.get("key_exclusions", []),
        "raw": result,
    }


# ═══════════════════════════════════════════════════════════════════════
# 2.  מפה פיננסית
# ═══════════════════════════════════════════════════════════════════════

@router.get("/api/patients/{patient_id}/financial-map")
def financial_map(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="מטופל לא נמצא")

    sources = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient_id
    ).all()

    claims = db.query(models.Claim).filter(
        models.Claim.patient_id == patient_id
    ).all()

    # עלויות מ-workflow steps
    instances = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.patient_id == patient_id,
        models.WorkflowInstance.status.in_(["active", "completed"]),
    ).all()
    step_costs: dict[str, float] = {}
    for inst in instances:
        for step in inst.steps:
            if step.estimated_cost and step.step_key:
                # map step_key → coverage category
                key = step.step_key.split("_")[0] if "_" in step.step_key else step.step_key
                step_costs[key] = step_costs.get(key, 0) + step.estimated_cost

    # ── categories ──────────────────────────────────────────────────
    all_category_keys = set(COVERAGE_LABELS.keys())
    for src in sources:
        for cov in src.coverages:
            all_category_keys.add(cov.category)

    categories = []
    total_estimated = 0.0
    total_covered = 0.0
    total_claimed = 0.0
    total_approved = 0.0

    for cat_key in sorted(all_category_keys):
        label = COVERAGE_LABELS.get(cat_key, cat_key)
        estimated = step_costs.get(cat_key, 0)

        # כיסויים מכל מקורות הביטוח
        source_coverages = []
        best_covered = 0.0
        for src in sources:
            cov = next((c for c in src.coverages if c.category == cat_key), None)
            if cov and cov.is_covered:
                amount = cov.coverage_amount or 0
                resp = _responsiveness(db, src.company_name or "")
                source_coverages.append({
                    "source_id": src.id,
                    "source_label": _source_label(src),
                    "company": src.company_name or "",
                    "amount": amount,
                    "amount_display": f"₪{amount:,.0f}" if amount else cov.notes or "מכוסה",
                    "responsiveness": resp,
                    "notes": cov.notes,
                })
                best_covered = max(best_covered, amount)

        # תביעות קיימות בקטגוריה זו
        cat_claims = [c for c in claims if c.category == cat_key]
        claimed = sum(c.amount_requested or 0 for c in cat_claims)
        approved = sum(c.amount_approved or 0 for c in cat_claims)

        gap = max(0, estimated - best_covered) if estimated else 0

        total_estimated += estimated
        total_covered += best_covered
        total_claimed += claimed
        total_approved += approved

        if source_coverages or estimated or claimed:
            categories.append({
                "key": cat_key,
                "label": label,
                "estimated": estimated,
                "covered": best_covered,
                "gap": gap,
                "claimed": claimed,
                "approved": approved,
                "sources": source_coverages,
            })

    # ── claim priority ───────────────────────────────────────────────
    claim_priority = []
    submitted_keys = {c.category for c in claims if c.status not in ("draft",)}

    for src in sources:
        resp = _responsiveness(db, src.company_name or "") or 5.0
        for cov in src.coverages:
            if not cov.is_covered:
                continue
            if cov.category in submitted_keys:
                continue
            amount = cov.coverage_amount or 0
            score = amount * resp
            reasons = []
            if amount:
                reasons.append(f"כיסוי ₪{amount:,.0f}")
            if resp >= 7:
                reasons.append(f"רספונסיביות גבוהה ({resp:.1f})")
            claim_priority.append({
                "source_id": src.id,
                "source_label": _source_label(src),
                "company": src.company_name or "",
                "category": cov.category,
                "category_label": COVERAGE_LABELS.get(cov.category, cov.category),
                "amount": amount,
                "responsiveness": resp,
                "score": score,
                "reason": " + ".join(reasons) if reasons else "כיסוי קיים",
            })

    claim_priority.sort(key=lambda x: -x["score"])
    for i, item in enumerate(claim_priority, 1):
        item["rank"] = i

    # ── alerts ───────────────────────────────────────────────────────
    alerts = []

    # כיסויים שלא נוצלו
    for src in sources:
        for cov in src.coverages:
            if cov.is_covered and cov.category not in submitted_keys:
                alerts.append({
                    "type": "unutilized",
                    "severity": "info",
                    "text": f"כיסוי {COVERAGE_LABELS.get(cov.category, cov.category)} ב{_source_label(src)} — טרם הוגשה תביעה",
                    "amount": cov.coverage_amount,
                    "source_id": src.id,
                    "category": cov.category,
                })

    # פערים בכיסוי
    for cat in categories:
        if cat["gap"] > 0:
            alerts.append({
                "type": "gap",
                "severity": "warning",
                "text": f"פער בכיסוי {cat['label']}: ₪{cat['gap']:,.0f} לא מכוסה",
                "amount": cat["gap"],
                "category": cat["key"],
            })

    # בדוק אם יש כיסוי סיעוד / אובדן כושר
    has_nursing = any(
        cov.is_covered for src in sources for cov in src.coverages
        if cov.category == "nursing_care"
    )
    has_disability = any(
        cov.is_covered for src in sources for cov in src.coverages
        if cov.category == "disability_monthly"
    )
    if not has_nursing:
        alerts.append({"type": "missing", "severity": "warning",
                       "text": "אין כיסוי סיעוד — שקול ביטוח סיעוד", "category": "nursing_care"})
    if not has_disability:
        alerts.append({"type": "missing", "severity": "info",
                       "text": "אין כיסוי אובדן כושר עבודה", "category": "disability_monthly"})

    return {
        "patient_id": patient_id,
        "summary": {
            "total_estimated": total_estimated,
            "total_covered": total_covered,
            "total_gap": max(0, total_estimated - total_covered),
            "total_claimed": total_claimed,
            "total_approved": total_approved,
            "total_sources": len(sources),
            "monthly_premium": sum(
                float(src.notes.split("פרמיה:")[1].split()[0])
                if src.notes and "פרמיה:" in src.notes else 0
                for src in sources
            ),
        },
        "categories": categories,
        "claim_priority": claim_priority,
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════
# 3.  ניתוח כיסוי לצומת במסע המטופל
# ═══════════════════════════════════════════════════════════════════════

@router.post("/api/patients/{patient_id}/nodes/{node_id}/coverage")
async def analyze_node_coverage(
    patient_id: int,
    node_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    """AI: אילו פוליסות מכסות את הצומת הזה, כמה, ומה לעשות."""
    node = db.query(models.Node).filter(
        models.Node.id == node_id,
        models.Node.patient_id == patient_id,
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="צומת לא נמצא")

    sources = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient_id
    ).all()

    if not sources:
        return {"relevant_policies": [], "total_estimated_benefit": "אין פוליסות",
                "recommendation": "יש להוסיף מקורות ביטוח לתיק המטופל", "urgency": "when_possible"}

    # ── Build policy summary for AI ──────────────────────────────────
    policies_text = ""
    for i, src in enumerate(sources):
        covered = [
            f"{COVERAGE_LABELS.get(c.category, c.category)}: {c.coverage_amount or c.notes or 'מכוסה'}"
            for c in src.coverages if c.is_covered
        ]
        policies_text += f"\nפוליסה {i+1} — {_source_label(src)}:\n"
        if covered:
            policies_text += "\n".join(f"  • {c}" for c in covered)
        else:
            policies_text += "  (אין כיסויים מוגדרים)"
        policies_text += "\n"

    # ── Minimal event-like object for the AI function ────────────────
    class _FakeEvent:
        title = node.description[:80] if node.description else "צומת לא מוגדר"
        description = node.description or ""
        event_type = node.node_type or "medical"

    class _FakePolicy:
        def __init__(self, src, idx):
            self.id = src.id
            self.insurer = _source_label(src)
            self.coverages = {
                c.category: {
                    "covered": c.is_covered,
                    "amount": str(c.coverage_amount) if c.coverage_amount else c.notes or "",
                }
                for c in src.coverages
            }

    fake_policies = [_FakePolicy(s, i) for i, s in enumerate(sources)]

    result = await analyze_event_coverage(_FakeEvent(), fake_policies)

    # ── Enrich with responsiveness ───────────────────────────────────
    for rp in result.get("relevant_policies", []):
        src_id = rp.get("policy_id")
        src = next((s for s in sources if s.id == src_id), None)
        if src:
            rp["responsiveness"] = _responsiveness(db, src.company_name or "")
            rp["source_label"] = _source_label(src)

    # Sort by amount desc
    result.get("relevant_policies", []).sort(
        key=lambda x: float(
            str(x.get("estimated_benefit", "0")).replace("₪", "").replace(",", "").replace(" ", "").split("-")[0] or "0"
        ),
        reverse=True,
    )

    return result
