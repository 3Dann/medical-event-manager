"""
מפה פיננסית ומימון המסע — endpoints.

GET  /api/patients/{id}/financial-map          מפה מלאה: עלויות + כיסוי + פער + קרנות
GET  /api/patients/{id}/financial-funds        קרנות: מיושמות + מומלצות
POST /api/patients/{id}/financial-funds        הוספת קרן
PUT  /api/patients/{id}/financial-funds/{aid}  עדכון סטטוס / סכום
DEL  /api/patients/{id}/financial-funds/{aid}  הסרת קרן
GET  /api/financial-funds                      מאגר קרנות גלובלי
POST /api/admin/financial-funds                הוספת קרן (admin)
PUT  /api/admin/financial-funds/{fid}          עריכת קרן (admin)
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger("financial_map")

import models
from database import get_db
import auth as auth_utils

router = APIRouter()

# ── Category labels (same as strategy.py + coverage_advisor.py) ────────────
CATEGORY_LABELS = {
    "second_opinion":   "חוות דעת שנייה",
    "surgery":          "ניתוחים",
    "transplant":       "השתלות",
    "hospitalization":  "אישפוזים",
    "rehabilitation":   "שיקום / טיפולים",
    "advanced_tech":    "טכנולוגיות חדישות",
    "critical_illness": "מחלה קשה",
    "diagnostics":      "בדיקות והדמיה",
}

STAGE_LABELS = {
    10: "גילוי ואבחון",
    20: "תכנון הטיפול",
    30: "שלב הטיפולים",
    40: "החלמה ושיקום",
    50: "מעקב ארוך טווח",
}

FUND_TYPE_LABELS = {
    "aid_fund":           "קרן סיוע",
    "social_entitlement": "זכאות סוציאלית",
    "special_loan":       "הלוואה ייעודית",
    "tax_benefit":        "הטבת מס",
}

STATUS_LABELS = {
    "considering": "שוקלים",
    "applied":     "הוגשה",
    "approved":    "אושרה",
    "rejected":    "נדחתה",
}


# ── Coverage helpers ───────────────────────────────────────────────────────

def _best_coverage_for_node(node: models.Node, patient: models.Patient, db: Session) -> dict:
    """
    Given a node's coverage_categories, find the best insurance coverage
    available for the patient. Returns covered_amount and gap.
    """
    if not node.coverage_categories or not node.estimated_cost:
        return {"covered_amount": 0, "gap": node.estimated_cost or 0, "source_name": None}

    try:
        categories = json.loads(node.coverage_categories)
    except Exception:
        categories = []

    if not categories:
        return {"covered_amount": 0, "gap": node.estimated_cost or 0, "source_name": None}

    best_covered = 0.0
    best_source = None

    for source in patient.insurance_sources:
        if not source.is_active:
            continue
        for category in categories:
            cov = next(
                (c for c in source.coverages if c.category == category),
                None
            )
            if not cov or not cov.is_covered:
                continue
            if cov.coverage_amount:
                amt = min(float(cov.coverage_amount), float(node.estimated_cost))
            elif cov.coverage_percentage:
                amt = float(node.estimated_cost) * float(cov.coverage_percentage) / 100.0
            else:
                amt = float(node.estimated_cost) * 0.5  # assume 50% if marked covered
            if amt > best_covered:
                best_covered = amt
                sname = source.company_name or source.hmo_name or source.source_type
                best_source = sname

    gap = max(0.0, float(node.estimated_cost) - best_covered)
    return {
        "covered_amount": round(best_covered, 2),
        "gap": round(gap, 2),
        "source_name": best_source,
    }


# ── Serializers ────────────────────────────────────────────────────────────

def _fund_dict(fund: models.FinancialFund) -> dict:
    try:
        conds = json.loads(fund.eligible_conditions) if fund.eligible_conditions else []
    except Exception:
        conds = []
    return {
        "id":                 fund.id,
        "name":               fund.name,
        "fund_type":          fund.fund_type,
        "fund_type_label":    FUND_TYPE_LABELS.get(fund.fund_type, fund.fund_type),
        "organization":       fund.organization,
        "description":        fund.description,
        "max_amount":         fund.max_amount,
        "eligible_conditions": conds,
        "eligible_ages_min":  fund.eligible_ages_min,
        "eligible_ages_max":  fund.eligible_ages_max,
        "application_url":    fund.application_url,
        "contact_phone":      fund.contact_phone,
        "notes":              fund.notes,
        "is_active":          fund.is_active,
    }


def _application_dict(app: models.PatientFundApplication) -> dict:
    return {
        "id":              app.id,
        "fund_id":         app.fund_id,
        "fund":            _fund_dict(app.fund) if app.fund else None,
        "custom_name":     app.custom_name,
        "display_name":    app.fund.name if app.fund else app.custom_name,
        "fund_type":       app.fund.fund_type if app.fund else "aid_fund",
        "fund_type_label": FUND_TYPE_LABELS.get(
                               app.fund.fund_type if app.fund else "aid_fund", ""
                           ),
        "status":          app.status,
        "status_label":    STATUS_LABELS.get(app.status, app.status),
        "expected_amount": app.expected_amount,
        "approved_amount": app.approved_amount,
        "effective_amount": app.approved_amount if app.status == "approved"
                            else (app.expected_amount if app.status == "applied" else 0),
        "notes":           app.notes,
        "applied_at":      app.applied_at.isoformat() if app.applied_at else None,
        "resolved_at":     app.resolved_at.isoformat() if app.resolved_at else None,
        "created_at":      app.created_at.isoformat() if app.created_at else None,
    }


# ── GET /api/patients/{id}/financial-map ──────────────────────────────────

@router.get("/api/patients/{patient_id}/financial-map")
def get_financial_map(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)

    # ── 1. Journey nodes with cost ─────────────────────────────────────────
    journey_nodes = db.query(models.Node).filter(
        models.Node.patient_id == patient_id,
        models.Node.node_type != "stage",
    ).order_by(models.Node.stage_order.nullslast()).all()

    # Group by stage bucket (10,20,30,40,50)
    stage_buckets: dict[int, list] = {}
    optional_nodes = []  # overlay_global nodes

    for node in journey_nodes:
        cov = _best_coverage_for_node(node, patient, db)
        node_data = {
            "id":                  node.id,
            "description":         node.description,
            "node_type":           node.node_type,
            "stage_order":         node.stage_order,
            "estimated_cost":      node.estimated_cost,
            "covered_amount":      cov["covered_amount"],
            "gap":                 cov["gap"],
            "coverage_pct":        round(cov["covered_amount"] / node.estimated_cost * 100, 1)
                                   if node.estimated_cost and node.estimated_cost > 0 else 0,
            "best_source":         cov["source_name"],
            "overlay_global":      node.overlay_global,
            "coverage_categories": json.loads(node.coverage_categories)
                                   if node.coverage_categories else [],
            "source_template_key": node.source_template_key,
        }

        if node.overlay_global:
            optional_nodes.append(node_data)
            continue

        # Determine stage bucket
        so = node.stage_order or 99
        if so < 20:
            bucket = 10
        elif so < 30:
            bucket = 20
        elif so < 40:
            bucket = 30
        elif so < 50:
            bucket = 40
        else:
            bucket = 50

        stage_buckets.setdefault(bucket, []).append(node_data)

    # Build by_stage list
    by_stage = []
    for bucket in sorted(stage_buckets):
        nodes_in = stage_buckets[bucket]
        stage_cost    = sum(n["estimated_cost"] or 0 for n in nodes_in)
        stage_covered = sum(n["covered_amount"] for n in nodes_in)
        by_stage.append({
            "stage_order":  bucket,
            "stage_label":  STAGE_LABELS.get(bucket, f"שלב {bucket}"),
            "nodes":        nodes_in,
            "total_cost":     round(stage_cost, 2),
            "total_covered":  round(stage_covered, 2),
            "total_gap":      round(max(0, stage_cost - stage_covered), 2),
        })

    # ── 2. Totals ──────────────────────────────────────────────────────────
    all_nodes = [n for nodes in stage_buckets.values() for n in nodes]
    total_cost     = sum(n["estimated_cost"] or 0 for n in all_nodes)
    total_covered  = sum(n["covered_amount"] for n in all_nodes)
    insurance_gap  = max(0.0, total_cost - total_covered)

    # ── 3. Fund applications ───────────────────────────────────────────────
    applications = db.query(models.PatientFundApplication).filter(
        models.PatientFundApplication.patient_id == patient_id
    ).all()

    ext_approved = sum(
        (a.approved_amount or 0) for a in applications if a.status == "approved"
    )
    ext_expected = sum(
        (a.expected_amount or 0) for a in applications if a.status == "applied"
    )
    remaining_gap = max(0.0, insurance_gap - ext_approved - ext_expected)

    coverage_pct = round(total_covered / total_cost * 100, 1) if total_cost > 0 else 0
    funded_pct   = round((total_covered + ext_approved + ext_expected) / total_cost * 100, 1) \
                   if total_cost > 0 else 0

    # ── 4. Recommended funds ───────────────────────────────────────────────
    applied_ids = {a.fund_id for a in applications if a.fund_id}
    try:
        patient_tags = json.loads(patient.condition_tags) if patient.condition_tags else []
    except Exception:
        patient_tags = []

    all_funds = db.query(models.FinancialFund).filter(
        models.FinancialFund.is_active == True
    ).all()

    recommended = []
    for fund in all_funds:
        if fund.id in applied_ids:
            continue
        try:
            fund_conds = json.loads(fund.eligible_conditions) if fund.eligible_conditions else []
        except Exception:
            fund_conds = []
        # Age check
        age = None
        if patient.birth_date:
            try:
                from datetime import date
                bday = datetime.strptime(patient.birth_date, "%Y-%m-%d").date()
                age = (date.today() - bday).days // 365
            except Exception:
                pass
        if fund.eligible_ages_min and age and age < fund.eligible_ages_min:
            continue
        if fund.eligible_ages_max and age and age > fund.eligible_ages_max:
            continue
        # Condition match (empty eligible_conditions = matches all)
        if fund_conds and not any(tag in fund_conds for tag in patient_tags):
            continue
        recommended.append(_fund_dict(fund))

    # ── 5. Action items ────────────────────────────────────────────────────
    action_items = []
    if not applications:
        action_items.append("לא הוגדרו עדיין מקורות מימון חוץ-ביטוחיים — הוסף לפחות מקור אחד.")
    if recommended:
        action_items.append(f"{len(recommended)} קרנות מומלצות — טרם הוגשה בקשה לאף אחת.")
    if insurance_gap > 0 and total_cost > 0:
        pct = round(insurance_gap / total_cost * 100)
        action_items.append(f"פער ביטוחי של {pct}% ({insurance_gap:,.0f} ₪) — בחן מקורות מימון נוספים.")

    # Check for age-based entitlements
    if age and age >= 65 and not any(
        a.fund and "סיעוד" in a.fund.name for a in applications
    ):
        action_items.append("גיל המטופל מעל 65 — בדוק זכאות לגמלת סיעוד מביטוח לאומי.")

    if optional_nodes:
        unapplied_overlays = [
            n["description"] for n in optional_nodes
            if n["id"] not in {a.fund_id for a in applications}
        ]
        if unapplied_overlays:
            action_items.append(
                f"שקול להוסיף: {', '.join(unapplied_overlays)} — עלות אופציונלית שלרוב מכוסה בביטוח."
            )

    return {
        "summary": {
            "total_cost":                round(total_cost, 2),
            "insurance_covered":         round(total_covered, 2),
            "insurance_gap":             round(insurance_gap, 2),
            "external_funding_approved": round(ext_approved, 2),
            "external_funding_expected": round(ext_expected, 2),
            "remaining_gap":             round(remaining_gap, 2),
            "coverage_pct":              coverage_pct,
            "funded_pct":                funded_pct,
        },
        "by_stage":         by_stage,
        "optional_nodes":   optional_nodes,
        "fund_applications": [_application_dict(a) for a in applications],
        "recommended_funds": recommended[:8],  # cap at 8
        "action_items":      action_items,
    }


# ── GET /api/patients/{id}/financial-funds ────────────────────────────────

@router.get("/api/patients/{patient_id}/financial-funds")
def list_patient_funds(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    apps = db.query(models.PatientFundApplication).filter(
        models.PatientFundApplication.patient_id == patient_id
    ).all()
    return [_application_dict(a) for a in apps]


# ── POST /api/patients/{id}/financial-funds ───────────────────────────────

class AddFundBody(BaseModel):
    fund_id: Optional[int] = None
    custom_name: Optional[str] = None
    expected_amount: Optional[float] = None
    notes: Optional[str] = None

@router.post("/api/patients/{patient_id}/financial-funds")
def add_patient_fund(
    patient_id: int,
    body: AddFundBody,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    if not body.fund_id and not body.custom_name:
        raise HTTPException(400, "יש לספק fund_id או custom_name")
    app = models.PatientFundApplication(
        patient_id=patient_id,
        fund_id=body.fund_id,
        custom_name=body.custom_name,
        status="considering",
        expected_amount=body.expected_amount,
        notes=body.notes,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return _application_dict(app)


# ── PUT /api/patients/{id}/financial-funds/{aid} ──────────────────────────

class UpdateFundBody(BaseModel):
    status: Optional[str] = None
    expected_amount: Optional[float] = None
    approved_amount: Optional[float] = None
    notes: Optional[str] = None
    applied_at: Optional[str] = None
    resolved_at: Optional[str] = None

@router.put("/api/patients/{patient_id}/financial-funds/{application_id}")
def update_patient_fund(
    patient_id: int,
    application_id: int,
    body: UpdateFundBody,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    app = db.query(models.PatientFundApplication).filter(
        models.PatientFundApplication.id == application_id,
        models.PatientFundApplication.patient_id == patient_id,
    ).first()
    if not app:
        raise HTTPException(404, "לא נמצא")
    if body.status is not None:
        app.status = body.status
    if body.expected_amount is not None:
        app.expected_amount = body.expected_amount
    if body.approved_amount is not None:
        app.approved_amount = body.approved_amount
    if body.notes is not None:
        app.notes = body.notes
    if body.applied_at is not None:
        try:
            app.applied_at = datetime.fromisoformat(body.applied_at)
        except Exception:
            pass
    if body.resolved_at is not None:
        try:
            app.resolved_at = datetime.fromisoformat(body.resolved_at)
        except Exception:
            pass
    db.commit()
    db.refresh(app)
    return _application_dict(app)


# ── DELETE /api/patients/{id}/financial-funds/{aid} ──────────────────────

@router.delete("/api/patients/{patient_id}/financial-funds/{application_id}")
def remove_patient_fund(
    patient_id: int,
    application_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    app = db.query(models.PatientFundApplication).filter(
        models.PatientFundApplication.id == application_id,
        models.PatientFundApplication.patient_id == patient_id,
    ).first()
    if not app:
        raise HTTPException(404, "לא נמצא")
    db.delete(app)
    db.commit()
    return {"ok": True}


# ── GET /api/financial-funds (global registry) ───────────────────────────

@router.get("/api/financial-funds")
def list_all_funds(
    fund_type: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    q = db.query(models.FinancialFund)
    if active_only:
        q = q.filter(models.FinancialFund.is_active == True)
    if fund_type:
        q = q.filter(models.FinancialFund.fund_type == fund_type)
    return [_fund_dict(f) for f in q.order_by(models.FinancialFund.fund_type, models.FinancialFund.name).all()]


# ── Admin endpoints ────────────────────────────────────────────────────────

class FundBody(BaseModel):
    name: str
    fund_type: str
    organization: Optional[str] = None
    description: Optional[str] = None
    max_amount: Optional[float] = None
    eligible_conditions: Optional[list] = None
    eligible_ages_min: Optional[int] = None
    eligible_ages_max: Optional[int] = None
    application_url: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True

@router.post("/api/admin/financial-funds")
def admin_create_fund(
    body: FundBody,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_admin),
):
    fund = models.FinancialFund(
        name=body.name,
        fund_type=body.fund_type,
        organization=body.organization,
        description=body.description,
        max_amount=body.max_amount,
        eligible_conditions=json.dumps(body.eligible_conditions or []),
        eligible_ages_min=body.eligible_ages_min,
        eligible_ages_max=body.eligible_ages_max,
        application_url=body.application_url,
        contact_phone=body.contact_phone,
        notes=body.notes,
        is_active=body.is_active,
    )
    db.add(fund)
    db.commit()
    db.refresh(fund)
    return _fund_dict(fund)

@router.put("/api/admin/financial-funds/{fund_id}")
def admin_update_fund(
    fund_id: int,
    body: FundBody,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_admin),
):
    fund = db.query(models.FinancialFund).filter(models.FinancialFund.id == fund_id).first()
    if not fund:
        raise HTTPException(404, "קרן לא נמצאה")
    fund.name               = body.name
    fund.fund_type          = body.fund_type
    fund.organization       = body.organization
    fund.description        = body.description
    fund.max_amount         = body.max_amount
    fund.eligible_conditions = json.dumps(body.eligible_conditions or [])
    fund.eligible_ages_min  = body.eligible_ages_min
    fund.eligible_ages_max  = body.eligible_ages_max
    fund.application_url    = body.application_url
    fund.contact_phone      = body.contact_phone
    fund.notes              = body.notes
    fund.is_active          = body.is_active
    db.commit()
    db.refresh(fund)
    return _fund_dict(fund)

@router.get("/api/patients/{patient_id}/insurance-gaps")
def get_insurance_gaps(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    """
    ניתוח פערים ביטוחיים מובנה — מחזיר עלות כוללת, כיסוי, פער, חומרה, קטגוריות לא מכוסות, והמלצות.
    """
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)

    nodes = db.query(models.Node).filter(
        models.Node.patient_id == patient_id,
        models.Node.node_type != "stage",
        models.Node.overlay_global.is_(False),
    ).all()

    total_cost = 0.0
    total_covered = 0.0
    uncovered_categories: set = set()

    for node in nodes:
        if not node.estimated_cost:
            continue
        cost = float(node.estimated_cost)
        total_cost += cost
        cov = _best_coverage_for_node(node, patient, db)
        total_covered += cov["covered_amount"]
        # If node is not covered (or partially covered) — collect its categories
        if cov["covered_amount"] < cost * 0.5 and node.coverage_categories:
            try:
                cats = json.loads(node.coverage_categories)
                for c in cats:
                    uncovered_categories.add(c)
            except Exception:
                pass

    gap = max(0.0, total_cost - total_covered)
    gap_pct = round(gap / total_cost * 100, 1) if total_cost > 0 else 0

    if gap_pct == 0:
        severity = "none"
    elif gap_pct < 20:
        severity = "low"
    elif gap_pct < 40:
        severity = "medium"
    else:
        severity = "high"

    # Human-readable category labels
    uncovered_labels = [CATEGORY_LABELS.get(c, c) for c in uncovered_categories]

    recommendations = []
    if severity == "high":
        recommendations.append("פער ביטוחי גבוה — מומלץ לבחון רכישת ביטוח משלים או ביטוח פרטי נוסף.")
    if severity in ("high", "medium"):
        recommendations.append("בדוק זכאות לקרנות סיוע — ייתכן שחלק מהפער מכוסה על ידי קרנות ציבוריות.")
    if "surgery" in uncovered_categories or "ניתוחים" in uncovered_categories:
        recommendations.append("כיסוי ניתוחים חסר — ודא שיש כיסוי ניתוח בחו\"ל אם הניתוח מתוכנן מחוץ לישראל.")
    if "rehabilitation" in uncovered_categories:
        recommendations.append("שיקום אינו מכוסה — ברר זכאות לשיקום דרך קופת החולים או ביטוח לאומי.")
    if not recommendations:
        recommendations.append("המצב הביטוחי תקין — המשך לעדכן את פרטי הכיסויים באופן שוטף.")

    return {
        "total_cost":           round(total_cost, 2),
        "total_covered":        round(total_covered, 2),
        "gap":                  round(gap, 2),
        "gap_pct":              gap_pct,
        "severity":             severity,
        "uncovered_categories": uncovered_labels,
        "recommendations":      recommendations,
    }


@router.get("/api/admin/financial-funds")
def admin_list_funds(
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_admin),
):
    funds = db.query(models.FinancialFund).order_by(
        models.FinancialFund.fund_type, models.FinancialFund.name
    ).all()
    return [_fund_dict(f) for f in funds]
