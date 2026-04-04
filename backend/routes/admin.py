import secrets
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db, engine, SQLALCHEMY_DATABASE_URL
import models
import auth as auth_utils

router = APIRouter(prefix="/api/admin", tags=["admin"])

_DB_UPLOAD_SECRET = "d96e8b558f3a81f1d15e84b9329062f2258b010393a1ef49f2c03929689f73c8"
_DB_UPLOAD_DONE = False

@router.post("/restore-db")
async def restore_db(
    file: UploadFile = File(...),
    x_restore_secret: str = Header(...),
):
    global _DB_UPLOAD_DONE
    if _DB_UPLOAD_DONE:
        raise HTTPException(status_code=410, detail="Already used")
    if not secrets.compare_digest(x_restore_secret, _DB_UPLOAD_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Resolve DB path from connection URL
    db_url = SQLALCHEMY_DATABASE_URL
    if db_url.startswith("sqlite:////"):
        db_path = db_url[len("sqlite:///"):]
    elif db_url.startswith("sqlite:///"):
        db_path = db_url[len("sqlite:///"):]
        if not os.path.isabs(db_path):
            db_path = os.path.join(os.path.dirname(__file__), "..", db_path)
    else:
        raise HTTPException(status_code=400, detail="Not a SQLite DB")

    db_path = os.path.normpath(db_path)
    backup_path = db_path + ".bak"

    content = await file.read()
    if content[:16] != b"SQLite format 3\x00":
        raise HTTPException(status_code=400, detail="Not a valid SQLite file")

    # Dispose all connections before replacing
    engine.dispose()

    if os.path.exists(db_path):
        shutil.copy2(db_path, backup_path)

    with open(db_path, "wb") as f:
        f.write(content)

    _DB_UPLOAD_DONE = True
    return {"ok": True, "path": db_path, "size": len(content)}


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
