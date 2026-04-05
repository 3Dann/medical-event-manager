from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models

SECRET_KEY = "medical-event-manager-secret-key-poc-2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, expires_minutes: int = None):
    to_encode = data.copy()
    mins = expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=mins))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def require_manager(current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.UserRole.manager:
        raise HTTPException(status_code=403, detail="Manager access required")
    return current_user


def require_admin(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def get_patient_with_access(patient_id: int, user: models.User, db: Session) -> models.Patient:
    """Fetch patient and verify the user has access. Raises 404/403 as appropriate.

    Access is granted when:
    - user is admin (is_admin=True)
    - user owns the patient (manager_id == user.id)
    - admin has explicitly granted user access via PatientPermission
    - user is the patient's linked patient-role user
    """
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="תיק לא נמצא")
    if user.is_admin:
        return patient
    if user.role == models.UserRole.manager:
        if patient.manager_id == user.id:
            return patient
        perm = db.query(models.PatientPermission).filter(
            models.PatientPermission.patient_id == patient_id,
            models.PatientPermission.manager_id == user.id,
        ).first()
        if perm:
            return patient
        raise HTTPException(status_code=403, detail="אין לך גישה לתיק זה")
    if user.role == models.UserRole.patient and patient.patient_user_id == user.id:
        return patient
    raise HTTPException(status_code=403, detail="אין לך גישה לתיק זה")
