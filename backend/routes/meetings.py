"""פגישות — דף מעקב פגישה דיגיטלי."""
import json
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

import models
from database import get_db
import auth as auth_utils
from routes.question_templates import _template_dict

router = APIRouter()

MEETING_TYPE_LABELS = {
    "oncologist":      "אונקולוג",
    "insurance_agent": "סוכן ביטוח",
    "social_worker":   "עו״ס / מתאמת",
    "pain_doctor":     "רופא כאב",
    "hmo":             "קופת חולים",
    "other":           "אחר",
}

REIMBURSE_LABELS = {
    "kupat_holim": "קופת חולים",
    "private":     "ביטוח פרטי",
    "both":        "שניהם",
}

def _meeting_dict(m: models.PatientMeeting) -> dict:
    try:
        action_items = json.loads(m.action_items) if m.action_items else []
    except Exception:
        action_items = []
    try:
        question_responses = json.loads(m.question_responses) if m.question_responses else []
    except Exception:
        question_responses = []

    template_data = None
    if m.question_template:
        template_data = _template_dict(m.question_template)

    return {
        "id":                     m.id,
        "patient_id":             m.patient_id,
        "meeting_type":           m.meeting_type,
        "meeting_type_label":     MEETING_TYPE_LABELS.get(m.meeting_type, m.meeting_type),
        "meeting_date":           m.meeting_date,
        "professional_name":      m.professional_name,
        "status_summary":         m.status_summary,
        "action_items":           action_items,
        "has_visit_summary":      m.has_visit_summary,
        "has_referrals":          m.has_referrals,
        "has_prescriptions":      m.has_prescriptions,
        "has_lab_results":        m.has_lab_results,
        "has_insurance_approval": m.has_insurance_approval,
        "meeting_cost":           m.meeting_cost,
        "reimbursement_entity":   m.reimbursement_entity,
        "reimbursement_label":    REIMBURSE_LABELS.get(m.reimbursement_entity or "", ""),
        "receipt_received":       m.receipt_received,
        "reimbursement_submitted":m.reimbursement_submitted,
        "caregiver_notes":        m.caregiver_notes,
        "question_template_id":   m.question_template_id,
        "question_template":      template_data,
        "question_responses":     question_responses,
        "created_at":             m.created_at.isoformat() if m.created_at else None,
    }

class ActionItem(BaseModel):
    task: str
    responsible: Optional[str] = ""
    done: bool = False

class MeetingBody(BaseModel):
    meeting_type: str
    meeting_date: Optional[str] = None
    professional_name: Optional[str] = None
    status_summary: Optional[str] = None
    action_items: Optional[List[ActionItem]] = None
    has_visit_summary: bool = False
    has_referrals: bool = False
    has_prescriptions: bool = False
    has_lab_results: bool = False
    has_insurance_approval: bool = False
    meeting_cost: Optional[float] = None
    reimbursement_entity: Optional[str] = None
    receipt_received: bool = False
    reimbursement_submitted: bool = False
    caregiver_notes: Optional[str] = None
    question_template_id: Optional[int] = None
    question_responses: Optional[str] = None   # JSON string

@router.get("/api/patients/{patient_id}/meetings")
def list_meetings(patient_id: int, db: Session = Depends(get_db),
                  current_user=Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    meetings = db.query(models.PatientMeeting).options(
        selectinload(models.PatientMeeting.question_template).selectinload(models.QuestionTemplate.items)
    ).filter(
        models.PatientMeeting.patient_id == patient_id
    ).order_by(models.PatientMeeting.meeting_date.desc().nullslast(),
               models.PatientMeeting.created_at.desc()).all()
    return [_meeting_dict(m) for m in meetings]

@router.post("/api/patients/{patient_id}/meetings")
def create_meeting(patient_id: int, body: MeetingBody,
                   db: Session = Depends(get_db),
                   current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    if body.question_template_id is not None:
        if not db.query(models.QuestionTemplate).filter_by(id=body.question_template_id).first():
            raise HTTPException(404, "תבנית שאלות לא נמצאה")
    data = body.model_dump()
    action_items = data.pop("action_items") or []
    m = models.PatientMeeting(
        patient_id=patient_id,
        action_items=json.dumps([a if isinstance(a, dict) else a.model_dump() for a in action_items]),
        **data,
    )
    db.add(m); db.commit(); db.refresh(m)
    return _meeting_dict(m)

@router.put("/api/patients/{patient_id}/meetings/{meeting_id}")
def update_meeting(patient_id: int, meeting_id: int, body: MeetingBody,
                   db: Session = Depends(get_db),
                   current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    if body.question_template_id is not None:
        if not db.query(models.QuestionTemplate).filter_by(id=body.question_template_id).first():
            raise HTTPException(404, "תבנית שאלות לא נמצאה")
    m = db.query(models.PatientMeeting).filter(
        models.PatientMeeting.id == meeting_id,
        models.PatientMeeting.patient_id == patient_id,
    ).first()
    if not m: raise HTTPException(404, "לא נמצא")
    data = body.model_dump()
    action_items = data.pop("action_items") or []
    m.action_items = json.dumps([a if isinstance(a, dict) else a.model_dump() for a in action_items])
    # Never overwrite stored question_responses when the client omits the field (None default)
    if data.get("question_responses") is None:
        data.pop("question_responses", None)
    for k, v in data.items():
        setattr(m, k, v)
    db.commit(); db.refresh(m)
    return _meeting_dict(m)

@router.delete("/api/patients/{patient_id}/meetings/{meeting_id}")
def delete_meeting(patient_id: int, meeting_id: int,
                   db: Session = Depends(get_db),
                   current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    m = db.query(models.PatientMeeting).filter(
        models.PatientMeeting.id == meeting_id,
        models.PatientMeeting.patient_id == patient_id,
    ).first()
    if not m: raise HTTPException(404, "לא נמצא")
    db.delete(m); db.commit()
    return {"ok": True}
