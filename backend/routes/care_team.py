"""צוות מטפלים — CRUD לכל מטופל."""
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
import auth as auth_utils

router = APIRouter()

ROLE_LABELS = {
    "oncologist":       "אונקולוג",
    "navigator":        "מתאמת שירות / רכזת",
    "pain_doctor":      "רופא כאב / פליאטיבי",
    "nutritionist":     "תזונאית אונקולוגית",
    "psycho_oncologist":"ליווי רגשי / פסיכו-אונקולוגיה",
    "rights_advisor":   "יועץ מיצוי זכויות",
    "social_worker":    "עובד סוציאלי",
    "other":            "אחר",
}

def _member_dict(m: models.PatientCareTeamMember) -> dict:
    return {
        "id":           m.id,
        "patient_id":   m.patient_id,
        "role":         m.role,
        "role_label":   ROLE_LABELS.get(m.role, m.role),
        "name":         m.name,
        "phone":        m.phone,
        "email":        m.email,
        "organization": m.organization,
        "notes":        m.notes,
        "is_primary":   m.is_primary,
        "created_at":   m.created_at.isoformat() if m.created_at else None,
    }

@router.get("/api/patients/{patient_id}/care-team")
def list_care_team(patient_id: int, db: Session = Depends(get_db),
                   current_user=Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    members = db.query(models.PatientCareTeamMember).filter(
        models.PatientCareTeamMember.patient_id == patient_id
    ).order_by(models.PatientCareTeamMember.is_primary.desc(),
               models.PatientCareTeamMember.created_at).all()
    return [_member_dict(m) for m in members]

class MemberBody(BaseModel):
    role: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False

@router.post("/api/patients/{patient_id}/care-team")
def add_member(patient_id: int, body: MemberBody,
               db: Session = Depends(get_db),
               current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    if body.is_primary:
        db.query(models.PatientCareTeamMember).filter(
            models.PatientCareTeamMember.patient_id == patient_id,
            models.PatientCareTeamMember.is_primary == True,
        ).update({"is_primary": False})
    m = models.PatientCareTeamMember(patient_id=patient_id, **body.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return _member_dict(m)

@router.put("/api/patients/{patient_id}/care-team/{member_id}")
def update_member(patient_id: int, member_id: int, body: MemberBody,
                  db: Session = Depends(get_db),
                  current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    m = db.query(models.PatientCareTeamMember).filter(
        models.PatientCareTeamMember.id == member_id,
        models.PatientCareTeamMember.patient_id == patient_id,
    ).first()
    if not m: raise HTTPException(404, "לא נמצא")
    if body.is_primary and not m.is_primary:
        db.query(models.PatientCareTeamMember).filter(
            models.PatientCareTeamMember.patient_id == patient_id,
            models.PatientCareTeamMember.is_primary == True,
        ).update({"is_primary": False})
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    db.commit(); db.refresh(m)
    return _member_dict(m)

@router.delete("/api/patients/{patient_id}/care-team/{member_id}")
def delete_member(patient_id: int, member_id: int,
                  db: Session = Depends(get_db),
                  current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    m = db.query(models.PatientCareTeamMember).filter(
        models.PatientCareTeamMember.id == member_id,
        models.PatientCareTeamMember.patient_id == patient_id,
    ).first()
    if not m: raise HTTPException(404, "לא נמצא")
    db.delete(m); db.commit()
    return {"ok": True}
