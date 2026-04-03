from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
import secrets
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: str = "manager"


class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    full_name: str
    role: str
    is_admin: bool = False


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/register", response_model=Token)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=auth_utils.get_password_hash(user_data.password),
        role=user_data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth_utils.create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role, is_admin=user.is_admin)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth_utils.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth_utils.create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role, is_admin=user.is_admin)


@router.get("/me")
def get_me(current_user: models.User = Depends(auth_utils.get_current_user)):
    return {"id": current_user.id, "full_name": current_user.full_name, "email": current_user.email, "role": current_user.role, "is_admin": current_user.is_admin}


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="אימייל לא נמצא במערכת")
    token = secrets.token_hex(3).upper()  # 6 chars
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    return {"message": "קוד איפוס נוצר", "reset_token": token}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or user.reset_token != data.token:
        raise HTTPException(status_code=400, detail="קוד איפוס שגוי")
    if not user.reset_token_expires or datetime.utcnow() > user.reset_token_expires.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="קוד האיפוס פג תוקף")
    user.hashed_password = auth_utils.get_password_hash(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"message": "הסיסמה עודכנה בהצלחה"}


@router.put("/profile/password")
def change_own_password(data: ChangePasswordRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    if not auth_utils.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")
    current_user.hashed_password = auth_utils.get_password_hash(data.new_password)
    db.commit()
    return {"message": "הסיסמה עודכנה בהצלחה"}
