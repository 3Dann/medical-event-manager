import os
import json as _perm_json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt as pyjwt
from jwt import PyJWTError as JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models

SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set — refusing to start")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 2  # 2 hours (down from 8)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, expires_minutes: int = None):
    to_encode = data.copy()
    mins = expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=mins))
    to_encode.update({"exp": expire, "jti": secrets.token_hex(16)})
    return pyjwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def is_token_revoked(jti: str, db: Session) -> bool:
    from datetime import timezone
    entry = db.query(models.RevokedToken).filter(models.RevokedToken.jti == jti).first()
    if not entry:
        return False
    expires = entry.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        db.delete(entry)
        db.commit()
        return False
    return True


def _resolve_token(bearer_token: Optional[str], request) -> Optional[str]:
    """Prefer Authorization header; fall back to HttpOnly cookie."""
    if bearer_token:
        return bearer_token
    return request.cookies.get("access_token")


def get_current_user(
    request: Request,
    bearer: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = _resolve_token(bearer, request)
    if not token:
        raise credentials_exception
    try:
        payload = decode_token(token)
        user_id: int = payload.get("sub")
        jti: str = payload.get("jti")
        if user_id is None:
            raise credentials_exception
        if payload.get("2fa_pending"):
            raise credentials_exception  # temp_token — תקף רק ל-verify-2fa
        if jti and is_token_revoked(jti, db):
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    # Update last_seen on active session (best-effort)
    try:
        from datetime import datetime, timezone as _tz
        now = datetime.now(_tz.utc)
        if jti:
            session = db.query(models.ActiveSession).filter(
                models.ActiveSession.jti == jti,
                models.ActiveSession.is_active == True,
            ).first()
            if session:
                session.last_seen = now
                db.commit()
        user.last_activity = now
        db.commit()
    except Exception:
        pass
    return user


oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db)
) -> Optional[models.User]:
    """מחזיר את המשתמש אם מחובר, None אחרת — ללא שגיאה."""
    if not token:
        return None
    try:
        payload = pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        if payload.get("2fa_pending"):
            return None
        jti = payload.get("jti")
        if jti and is_token_revoked(jti, db):
            return None
    except JWTError:
        return None
    return db.query(models.User).filter(models.User.id == int(user_id)).first()


def get_current_user_from_token(token: str, db: Session) -> models.User:
    """כמו get_current_user אך מקבל token כפרמטר רגיל (לא Depends) — לשימוש ב-query param."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def has_permission(user: models.User, perm: str) -> bool:
    """Check if user has a specific download/export permission."""
    if user.is_admin:
        return True
    try:
        perms = _perm_json.loads(user.permissions or "[]")
        return perm in perms
    except Exception:
        return False


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
