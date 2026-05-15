from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import models
import auth as auth_utils
from database import get_db

router = APIRouter(prefix="/api/broker", tags=["broker"])


def require_broker(current_user: models.User = Depends(auth_utils.get_current_user)):
    if current_user.is_admin:
        return current_user
    if current_user.role != models.UserRole.broker:
        raise HTTPException(403, "גישה מותרת לברוקרים בלבד")
    return current_user


@router.get("/patients")
def broker_patients(
    db: Session = Depends(get_db),
    current_user=Depends(require_broker),
):
    """Patients the broker has been granted access to via PatientPermission."""
    perms = db.query(models.PatientPermission).filter(
        models.PatientPermission.manager_id == current_user.id
    ).all()
    patient_ids = [p.patient_id for p in perms]
    patients = db.query(models.Patient).filter(models.Patient.id.in_(patient_ids)).all()
    return [
        {
            "id": p.id,
            "full_name": p.full_name,
            "diagnosis_status": p.diagnosis_status,
            "hmo_name": p.hmo_name,
            "condition_tags": p.condition_tags,
            "manager_id": p.manager_id,
        }
        for p in patients
    ]


@router.get("/patients/{patient_id}/claims")
def broker_patient_claims(
    patient_id: int,
    offset: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(require_broker),
):
    """Claims summary for a patient the broker has access to."""
    if not current_user.is_admin:
        perm = db.query(models.PatientPermission).filter(
            models.PatientPermission.manager_id == current_user.id,
            models.PatientPermission.patient_id == patient_id,
        ).first()
        if not perm:
            raise HTTPException(403, "אין גישה למטופל זה")
    q = db.query(models.Claim).filter(models.Claim.patient_id == patient_id)
    total = q.count()
    claims = q.order_by(models.Claim.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
        "items": [
            {
                "id": c.id,
                "category": c.category,
                "status": c.status,
                "amount_requested": c.amount_requested,
                "amount_approved": c.amount_approved,
                "description": c.description,
            }
            for c in claims
        ],
    }
