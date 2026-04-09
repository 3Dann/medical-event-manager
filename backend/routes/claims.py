from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/patients/{patient_id}/claims", tags=["claims"])


class ClaimCreate(BaseModel):
    insurance_source_id: int
    category: str
    description: Optional[str] = None
    amount_requested: Optional[float] = None
    status: str = "pending"
    submission_date: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    priority_order: Optional[int] = None


class ClaimUpdate(BaseModel):
    status: Optional[str] = None
    amount_approved: Optional[float] = None
    amount_requested: Optional[float] = None
    submission_date: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    priority_order: Optional[int] = None


def claim_to_dict(c, source=None):
    source_label = ""
    if source:
        if source.source_type == "kupat_holim":
            source_label = f"קופ\"ח {source.hmo_name or ''} — {source.hmo_level or ''}"
        elif source.source_type == "sal_habriut":
            source_label = "סל הבריאות"
        elif source.source_type == "har_habitua":
            source_label = f"הר הביטוח — {source.company_name or ''}"
        elif source.source_type == "private":
            source_label = f"{source.company_name or ''} — {source.policy_number or ''}"
        elif source.source_type == "bituch_leumi":
            source_label = "ביטוח לאומי"
    return {
        "id": c.id,
        "patient_id": c.patient_id,
        "insurance_source_id": c.insurance_source_id,
        "source_label": source_label,
        "category": c.category,
        "description": c.description,
        "amount_requested": c.amount_requested,
        "amount_approved": c.amount_approved,
        "status": c.status,
        "submission_date": c.submission_date,
        "deadline": c.deadline,
        "notes": c.notes,
        "priority_order": c.priority_order,
        "workflow_step_id": c.workflow_step_id,
        "created_at": str(c.created_at) if c.created_at else None,
    }


@router.get("")
def list_claims(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    claims = db.query(models.Claim).filter(models.Claim.patient_id == patient_id).order_by(models.Claim.priority_order).all()
    if not claims:
        return []
    # Batch-load insurance sources to avoid N+1
    source_ids = {c.insurance_source_id for c in claims}
    sources = {s.id: s for s in db.query(models.InsuranceSource).filter(models.InsuranceSource.id.in_(source_ids)).all()}
    return [claim_to_dict(c, sources.get(c.insurance_source_id)) for c in claims]


@router.post("")
def create_claim(patient_id: int, data: ClaimCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    claim = models.Claim(**data.model_dump(), patient_id=patient_id)
    db.add(claim)
    db.commit()
    db.refresh(claim)
    source = db.get(models.InsuranceSource, claim.insurance_source_id)
    return claim_to_dict(claim, source)


@router.put("/{claim_id}")
def update_claim(patient_id: int, claim_id: int, data: ClaimUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    claim = db.query(models.Claim).filter(models.Claim.id == claim_id, models.Claim.patient_id == patient_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(claim, field, value)
    db.commit()
    db.refresh(claim)
    source = db.get(models.InsuranceSource, claim.insurance_source_id)
    return claim_to_dict(claim, source)


@router.post("/{claim_id}/approve")
def approve_claim(patient_id: int, claim_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    """Promote a draft claim to pending (ready for submission)."""
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    claim = db.query(models.Claim).filter(models.Claim.id == claim_id, models.Claim.patient_id == patient_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft claims can be approved")
    claim.status = "pending"
    db.commit()
    db.refresh(claim)
    source = db.get(models.InsuranceSource, claim.insurance_source_id)
    return claim_to_dict(claim, source)


@router.delete("/{claim_id}")
def delete_claim(patient_id: int, claim_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    claim = db.query(models.Claim).filter(models.Claim.id == claim_id, models.Claim.patient_id == patient_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    db.delete(claim)
    db.commit()
    return {"message": "Claim deleted"}
