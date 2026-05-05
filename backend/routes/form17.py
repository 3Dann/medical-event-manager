"""מעקב טופס 17 — התחייבויות קופת חולים."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
import auth as auth_utils

router = APIRouter()

STATUS_LABELS = {
    "pending":   "טרם הוגש",
    "requested": "הוגשה בקשה",
    "approved":  "אושר",
    "denied":    "נדחה",
}

def _form17_dict(f: models.PatientForm17) -> dict:
    return {
        "id":                  f.id,
        "patient_id":          f.patient_id,
        "procedure_name":      f.procedure_name,
        "insurance_source_id": f.insurance_source_id,
        "insurance_source":    f.insurance_source.hmo_name or f.insurance_source.company_name
                               if f.insurance_source else None,
        "status":              f.status,
        "status_label":        STATUS_LABELS.get(f.status, f.status),
        "requested_date":      f.requested_date,
        "approved_date":       f.approved_date,
        "amount_approved":     f.amount_approved,
        "notes":               f.notes,
        "created_at":          f.created_at.isoformat() if f.created_at else None,
    }

@router.get("/api/patients/{patient_id}/form17")
def list_form17(patient_id: int, db: Session = Depends(get_db),
                current_user=Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    entries = db.query(models.PatientForm17).filter(
        models.PatientForm17.patient_id == patient_id
    ).order_by(models.PatientForm17.created_at.desc()).all()
    return [_form17_dict(e) for e in entries]

class Form17Body(BaseModel):
    procedure_name: str
    insurance_source_id: Optional[int] = None
    status: str = "pending"
    requested_date: Optional[str] = None
    approved_date: Optional[str] = None
    amount_approved: Optional[float] = None
    notes: Optional[str] = None

@router.post("/api/patients/{patient_id}/form17")
def create_form17(patient_id: int, body: Form17Body,
                  db: Session = Depends(get_db),
                  current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    e = models.PatientForm17(patient_id=patient_id, **body.model_dump())
    db.add(e); db.commit(); db.refresh(e)
    return _form17_dict(e)

@router.put("/api/patients/{patient_id}/form17/{entry_id}")
def update_form17(patient_id: int, entry_id: int, body: Form17Body,
                  db: Session = Depends(get_db),
                  current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    e = db.query(models.PatientForm17).filter(
        models.PatientForm17.id == entry_id,
        models.PatientForm17.patient_id == patient_id,
    ).first()
    if not e: raise HTTPException(404, "לא נמצא")
    for k, v in body.model_dump().items():
        setattr(e, k, v)
    db.commit(); db.refresh(e)
    return _form17_dict(e)

@router.delete("/api/patients/{patient_id}/form17/{entry_id}")
def delete_form17(patient_id: int, entry_id: int,
                  db: Session = Depends(get_db),
                  current_user=Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    e = db.query(models.PatientForm17).filter(
        models.PatientForm17.id == entry_id,
        models.PatientForm17.patient_id == patient_id,
    ).first()
    if not e: raise HTTPException(404, "לא נמצא")
    db.delete(e); db.commit()
    return {"ok": True}
