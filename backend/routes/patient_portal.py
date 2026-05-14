"""
פורטל מטופל — endpoints ייעודיים.

GET  /api/patient/summary                       סיכום מלא למטופל (patient role)
GET  /api/patient/requests                      בקשות שלחתי (patient role)
POST /api/patient/requests                      שלח בקשה למנהל (patient role)
GET  /api/patients/{id}/requests               בקשות מטופל (manager)
PUT  /api/patients/{id}/requests/{req_id}      עדכון סטטוס בקשה (manager)
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
import auth as auth_utils

router = APIRouter()

CATEGORY_LABELS = {
    "general":   "כללי",
    "document":  "בקשת מסמך",
    "meeting":   "בקשת פגישה",
    "question":  "שאלה",
    "financial": "עניין כספי",
}

STATUS_LABELS = {
    "pending":  "ממתינה",
    "read":     "נקראה",
    "resolved": "טופלה",
}


def _req_dict(r: models.PatientRequest) -> dict:
    return {
        "id":           r.id,
        "category":     r.category,
        "category_label": CATEGORY_LABELS.get(r.category, r.category),
        "message":      r.message,
        "status":       r.status,
        "status_label": STATUS_LABELS.get(r.status, r.status),
        "manager_note": r.manager_note,
        "created_at":   r.created_at.isoformat() if r.created_at else None,
        "resolved_at":  r.resolved_at.isoformat() if r.resolved_at else None,
    }


# ── Patient endpoints ──────────────────────────────────────────────────────────

@router.get("/api/patient/summary")
def get_patient_summary(
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    """סיכום מלא — ציר זמן, תביעות, מסמכים, מפה פיננסית בסיסית."""
    if current_user.role != models.UserRole.patient:
        raise HTTPException(403, "נגיש רק למשתמשי מטופל")

    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(404, "לא נמצא תיק מטופל מקושר")

    # Claims (no drafts)
    claims = db.query(models.Claim).filter(
        models.Claim.patient_id == patient.id,
        models.Claim.status != "draft",
    ).order_by(models.Claim.created_at.desc()).all()

    # Documents
    docs = db.query(models.PatientDocument).filter(
        models.PatientDocument.patient_id == patient.id,
    ).order_by(models.PatientDocument.created_at.desc()).all()

    # Workflow instances (journey)
    wf_instances = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.patient_id == patient.id,
    ).order_by(models.WorkflowInstance.id.desc()).all()

    # Batch-load all steps for all instances in a single query to avoid N+1
    instance_ids = [wf.id for wf in wf_instances]
    all_steps = (
        db.query(models.WorkflowStep)
        .filter(models.WorkflowStep.instance_id.in_(instance_ids))
        .order_by(models.WorkflowStep.instance_id, models.WorkflowStep.step_order)
        .all()
        if instance_ids else []
    )
    steps_by_instance: dict = {}
    for s in all_steps:
        steps_by_instance.setdefault(s.instance_id, []).append(s)

    def _wf_dict(wf):
        steps = steps_by_instance.get(wf.id, [])
        total = len(steps)
        done  = sum(1 for s in steps if s.status in ("completed", "skipped"))
        return {
            "id":            wf.id,
            "title":         wf.title,
            "template_name": wf.template.name if wf.template else "",
            "status":        wf.status,
            "progress":      round(done / total * 100) if total else 0,
            "steps": [
                {
                    "name":     s.name,
                    "status":   s.status,
                    "due_date": s.due_date.isoformat() if s.due_date else None,
                    "notes":    s.notes,
                }
                for s in steps
            ],
        }

    # Financial summary (basic)
    import json
    nodes = db.query(models.Node).filter(
        models.Node.patient_id == patient.id,
        models.Node.node_type != "stage",
        models.Node.overlay_global == False,
    ).all()
    total_cost    = sum(n.estimated_cost or 0 for n in nodes)
    total_covered = 0.0
    for n in nodes:
        if not n.coverage_categories or not n.estimated_cost:
            continue
        try:
            cats = json.loads(n.coverage_categories)
        except Exception:
            cats = []
        for source in patient.insurance_sources:
            if not source.is_active:
                continue
            for cat in cats:
                cov = next((c for c in source.coverages if c.category == cat), None)
                if not cov or not cov.is_covered:
                    continue
                if cov.coverage_amount:
                    total_covered += min(float(cov.coverage_amount), float(n.estimated_cost))
                elif cov.coverage_percentage:
                    total_covered += float(n.estimated_cost) * float(cov.coverage_percentage) / 100
                else:
                    total_covered += float(n.estimated_cost) * 0.5
                break  # best coverage per node

    fund_apps = db.query(models.PatientFundApplication).filter(
        models.PatientFundApplication.patient_id == patient.id
    ).all()
    ext_funding = sum(
        (a.approved_amount or a.expected_amount or 0)
        for a in fund_apps if a.status in ("approved", "applied")
    )
    gap = max(0.0, total_cost - total_covered - ext_funding)

    # Manager info
    manager = patient.manager
    manager_info = {
        "name":  manager.full_name if manager else None,
        "email": manager.email    if manager else None,
    }

    return {
        "patient": {
            "id":                patient.id,
            "full_name":         patient.full_name,
            "diagnosis_details": patient.diagnosis_details,
            "hmo_name":          patient.hmo_name,
            "hmo_level":         patient.hmo_level,
        },
        "manager": manager_info,
        "claims": [
            {
                "id":           c.id,
                "source_label": c.source_label,
                "description":  c.description,
                "amount":       c.amount,
                "status":       c.status,
                "created_at":   c.created_at.isoformat() if c.created_at else None,
            }
            for c in claims
        ],
        "documents": [
            {
                "id":            d.id,
                "original_name": d.original_name,
                "category":      d.category,
                "file_size":     d.file_size,
                "created_at":    d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
        "workflows": [_wf_dict(wf) for wf in wf_instances],
        "financial": {
            "total_cost":    round(total_cost, 2),
            "total_covered": round(total_covered, 2),
            "ext_funding":   round(ext_funding, 2),
            "gap":           round(gap, 2),
            "cov_pct":       round(total_covered / total_cost * 100, 1) if total_cost > 0 else 0,
        },
        "red_flags": [
            {
                "id":          f.id,
                "flag_type":   f.flag_type,
                "severity":    f.severity,
                "title":       f.title,
                "description": f.description,
            }
            for f in patient.red_flags if f.is_active
        ],
    }


@router.get("/api/patient/requests")
def list_my_requests(
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    if current_user.role != models.UserRole.patient:
        raise HTTPException(403, "נגיש רק למשתמשי מטופל")
    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(404, "לא נמצא תיק")
    reqs = db.query(models.PatientRequest).filter(
        models.PatientRequest.patient_id == patient.id
    ).order_by(models.PatientRequest.created_at.desc()).all()
    return [_req_dict(r) for r in reqs]


class RequestBody(BaseModel):
    category: str = "general"
    message: str


@router.post("/api/patient/requests")
def send_request(
    body: RequestBody,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    if current_user.role != models.UserRole.patient:
        raise HTTPException(403, "נגיש רק למשתמשי מטופל")
    if not body.message.strip():
        raise HTTPException(400, "יש לכתוב הודעה")
    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(404, "לא נמצא תיק")
    req = models.PatientRequest(
        patient_id=patient.id,
        category=body.category,
        message=body.message.strip(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _req_dict(req)


# ── Manager endpoints ──────────────────────────────────────────────────────────

@router.get("/api/patients/{patient_id}/requests")
def list_patient_requests(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    reqs = db.query(models.PatientRequest).filter(
        models.PatientRequest.patient_id == patient_id
    ).order_by(models.PatientRequest.created_at.desc()).all()
    # Mark pending → read
    for r in reqs:
        if r.status == "pending":
            r.status = "read"
    db.commit()
    return [_req_dict(r) for r in reqs]


class UpdateRequestBody(BaseModel):
    status: Optional[str] = None
    manager_note: Optional[str] = None


@router.put("/api/patients/{patient_id}/requests/{req_id}")
def update_patient_request(
    patient_id: int,
    req_id: int,
    body: UpdateRequestBody,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    req = db.query(models.PatientRequest).filter(
        models.PatientRequest.id == req_id,
        models.PatientRequest.patient_id == patient_id,
    ).first()
    if not req:
        raise HTTPException(404, "לא נמצאה בקשה")
    if body.status:
        req.status = body.status
        if body.status == "resolved" and not req.resolved_at:
            req.resolved_at = datetime.now(timezone.utc)
    if body.manager_note is not None:
        req.manager_note = body.manager_note
    db.commit()
    db.refresh(req)
    return _req_dict(req)
