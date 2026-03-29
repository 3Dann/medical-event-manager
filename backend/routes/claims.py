from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
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


def claim_to_dict(c, db):
    source = db.query(models.InsuranceSource).filter(models.InsuranceSource.id == c.insurance_source_id).first()
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
        "created_at": str(c.created_at) if c.created_at else None,
    }


@router.get("")
def list_claims(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    claims = db.query(models.Claim).filter(models.Claim.patient_id == patient_id).order_by(models.Claim.priority_order).all()
    return [claim_to_dict(c, db) for c in claims]


@router.post("")
def create_claim(patient_id: int, data: ClaimCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    claim = models.Claim(**data.model_dump(), patient_id=patient_id)
    db.add(claim)
    db.commit()
    db.refresh(claim)
    return claim_to_dict(claim, db)


@router.put("/{claim_id}")
def update_claim(patient_id: int, claim_id: int, data: ClaimUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    claim = db.query(models.Claim).filter(models.Claim.id == claim_id, models.Claim.patient_id == patient_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(claim, field, value)
    db.commit()
    db.refresh(claim)
    return claim_to_dict(claim, db)


@router.delete("/{claim_id}")
def delete_claim(patient_id: int, claim_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    claim = db.query(models.Claim).filter(models.Claim.id == claim_id, models.Claim.patient_id == patient_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    db.delete(claim)
    db.commit()
    return {"message": "Claim deleted"}
