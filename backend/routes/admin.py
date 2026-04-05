import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/admin", tags=["admin"])


def user_to_dict(u: models.User) -> dict:
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "is_admin": u.is_admin,
        "preserve_data": u.preserve_data,
        "created_at": str(u.created_at) if u.created_at else None,
    }


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    users = db.query(models.User).order_by(models.User.id).all()
    return [user_to_dict(u) for u in users]


class UpdateRoleRequest(BaseModel):
    role: str
    is_admin: Optional[bool] = None


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    data: UpdateRoleRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לשנות הרשאות של עצמך")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if data.role not in ["manager", "patient"]:
        raise HTTPException(status_code=400, detail="תפקיד לא חוקי")
    user.role = data.role
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.post("/users/{user_id}/reset")
def reset_user_account(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Reset user password. Data is deleted only if preserve_data=False."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לאפס את החשבון שלך")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    temp_password = secrets.token_urlsafe(8)
    user.hashed_password = auth_utils.get_password_hash(temp_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {
        "message": "הסיסמה אופסה בהצלחה",
        "temp_password": temp_password,
        "preserve_data": user.preserve_data,
    }


@router.post("/users/{user_id}/delete-data")
def delete_user_data(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Delete user data only if preserve_data is False."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if user.preserve_data:
        raise HTTPException(status_code=403, detail="המשתמש ביקש לשמור את המידע שלו — לא ניתן למחוק")
    patients = db.query(models.Patient).filter(models.Patient.manager_id == user_id).all()
    for p in patients:
        db.delete(p)
    db.commit()
    return {"message": f"נמחקו {len(patients)} תיקים"}


@router.put("/users/{user_id}/preserve-data")
def toggle_preserve_data(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    user.preserve_data = not user.preserve_data
    db.commit()
    return user_to_dict(user)


# ── Patient permission management ────────────────────────────────────────────

@router.get("/patients")
def list_all_patients(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """List all patients (admin only) — for the permissions management UI."""
    patients = db.query(models.Patient).order_by(models.Patient.id).all()
    return [
        {
            "id": p.id,
            "full_name": p.full_name,
            "manager_id": p.manager_id,
            "manager_name": p.manager.full_name if p.manager else None,
        }
        for p in patients
    ]


@router.get("/patients/{patient_id}/permissions")
def get_patient_permissions(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """List all managers who have been explicitly granted access to a patient."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="תיק לא נמצא")
    perms = db.query(models.PatientPermission).filter(
        models.PatientPermission.patient_id == patient_id
    ).all()
    result = []
    for perm in perms:
        manager = db.query(models.User).filter(models.User.id == perm.manager_id).first()
        granter = db.query(models.User).filter(models.User.id == perm.granted_by).first()
        result.append({
            "id": perm.id,
            "manager_id": perm.manager_id,
            "manager_name": manager.full_name if manager else str(perm.manager_id),
            "manager_email": manager.email if manager else "",
            "granted_by_name": granter.full_name if granter else str(perm.granted_by),
            "created_at": perm.created_at.isoformat() if perm.created_at else None,
        })
    return result


class GrantPermissionRequest(BaseModel):
    manager_id: int


@router.post("/patients/{patient_id}/permissions")
def grant_patient_permission(
    patient_id: int,
    data: GrantPermissionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Grant a manager access to a patient they don't own."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="תיק לא נמצא")
    manager = db.query(models.User).filter(models.User.id == data.manager_id).first()
    if not manager:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if manager.role != models.UserRole.manager:
        raise HTTPException(status_code=400, detail="המשתמש אינו מנהל אירוע")
    if patient.manager_id == data.manager_id:
        raise HTTPException(status_code=400, detail="מנהל זה הוא הבעלים של התיק")
    existing = db.query(models.PatientPermission).filter(
        models.PatientPermission.patient_id == patient_id,
        models.PatientPermission.manager_id == data.manager_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="הרשאה כבר קיימת")
    perm = models.PatientPermission(
        patient_id=patient_id,
        manager_id=data.manager_id,
        granted_by=current_user.id,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return {"id": perm.id, "manager_id": perm.manager_id, "manager_name": manager.full_name}


@router.delete("/patients/{patient_id}/permissions/{manager_id}")
def revoke_patient_permission(
    patient_id: int,
    manager_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Revoke a manager's access to a patient."""
    perm = db.query(models.PatientPermission).filter(
        models.PatientPermission.patient_id == patient_id,
        models.PatientPermission.manager_id == manager_id,
    ).first()
    if not perm:
        raise HTTPException(status_code=404, detail="הרשאה לא נמצאה")
    db.delete(perm)
    db.commit()
    return {"ok": True}
