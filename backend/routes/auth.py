from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
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
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth_utils.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth_utils.create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role)


@router.get("/me")
def get_me(current_user: models.User = Depends(auth_utils.get_current_user)):
    return {"id": current_user.id, "full_name": current_user.full_name, "email": current_user.email, "role": current_user.role}
