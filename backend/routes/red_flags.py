"""נורות אדומות — התראות רפואיות, פיננסיות ושחיקת מטפל."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
import auth as auth_utils

router = APIRouter()

TYPE_LABELS   = {"medical": "רפואי", "financial": "פיננסי", "caregiver": "שחיקת מטפל"}
SEV_LABELS    = {"warning": "אזהרה", "critical": "קריטי"}
TYPE_COLORS   = {"medical": "red", "financial": "amber", "caregiver": "purple"}

def _flag_dict(f: models.PatientRedFlag) -> dict:
    return {
        "id":          f.id,
        "patient_id":  f.patient_id,
        "flag_type":   f.flag_type,
        "type_label":  TYPE_LABELS.get(f.flag_type, f.flag_type),
        "color":       TYPE_COLORS.get(f.flag_type, "slate"),
        "severity":    f.severity,
        "sev_label":   SEV_LABELS.get(f.severity, f.severity),
        "title":       f.title,
        "description": f.description,
        "is_active":   f.is_active,
        "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
        "created_at":  f.created_at.isoformat() if f.created_at else None,
    }

@router.get("/api/patients/{patient_id}/red-flags")
def list_flags(patient_id: int, active_only: bool = False,
               db: Session = Depends(get_db),
               current_user=Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    q = db.query(models.PatientRedFlag).filter(
        models.PatientRedFlag.patient_id == patient_id)
    if active_only:
        q = q.filter(models.PatientRedFlag.is_active == True)
    flags = q.order_by(
        models.PatientRedFlag.is_active.desc(),
        models.PatientRedFlag.severity.desc(),
        models.PatientRedFlag.created_at.desc(),
    ).all()
    return [_flag_dict(f) for f in flags]

VALID_FLAG_TYPES = {"medical", "financial", "caregiver"}
VALID_SEVERITIES = {"low", "medium", "high", "critical"}

class FlagBody(BaseModel):
    flag_type: str
    severity: str = "warning"
    title: str
    description: Optional[str] = None

@router.post("/api/patients/{patient_id}/red-flags")
def create_flag(patient_id: int, body: FlagBody,
                db: Session = Depends(get_db),
                current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    if body.flag_type not in VALID_FLAG_TYPES:
        raise HTTPException(status_code=400, detail=f"סוג דגל לא חוקי: {body.flag_type}")
    if body.severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"חומרה לא חוקית: {body.severity}")
    f = models.PatientRedFlag(patient_id=patient_id, **body.model_dump())
    db.add(f); db.commit(); db.refresh(f)
    return _flag_dict(f)

@router.put("/api/patients/{patient_id}/red-flags/{flag_id}/resolve")
def resolve_flag(patient_id: int, flag_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    f = db.query(models.PatientRedFlag).filter(
        models.PatientRedFlag.id == flag_id,
        models.PatientRedFlag.patient_id == patient_id,
    ).first()
    if not f: raise HTTPException(404, "לא נמצא")
    f.is_active   = False
    f.resolved_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(f)
    return _flag_dict(f)

@router.delete("/api/patients/{patient_id}/red-flags/{flag_id}")
def delete_flag(patient_id: int, flag_id: int,
                db: Session = Depends(get_db),
                current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    f = db.query(models.PatientRedFlag).filter(
        models.PatientRedFlag.id == flag_id,
        models.PatientRedFlag.patient_id == patient_id,
    ).first()
    if not f: raise HTTPException(404, "לא נמצא")
    db.delete(f); db.commit()
    return {"ok": True}
