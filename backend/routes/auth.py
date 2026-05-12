from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import os
import secrets
import pyotp
import field_encrypt as fe
import qrcode
import io
import base64
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from database import get_db
import models
import auth as auth_utils
import email_utils
import sms_utils

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

limiter = Limiter(key_func=_get_real_ip)


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="הסיסמה חייבת להכיל לפחות 8 תווים")
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_upper and has_lower and has_digit):
        raise HTTPException(status_code=400, detail="הסיסמה חייבת להכיל אותיות גדולות, קטנות וספרה")


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
    email: str = ""
    role: str
    is_admin: bool = False
    requires_2fa: bool = False
    tfa_required_setup: bool = False
    temp_token: str = None
    tfa_method: str = None
    totp_configured: bool = False   # True = user has TOTP set up, shows Google option


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    tfa_code: str = None  # required if user has 2FA enabled


@router.post("/register", response_model=Token)
@limiter.limit("3/hour")
def register(request: Request, user_data: UserCreate, db: Session = Depends(get_db),
             current_user: Optional[models.User] = Depends(auth_utils.get_optional_current_user)):
    _validate_password(user_data.password)
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    is_first_user = db.query(models.User).count() == 0
    if not is_first_user and (not current_user or not current_user.is_admin):
        raise HTTPException(status_code=403, detail="רישום מוגבל — פנה לאדמין")
    user = models.User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=auth_utils.get_password_hash(user_data.password),
        role=user_data.role,
        is_admin=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth_utils.create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, email=user.email, role=user.role, is_admin=user.is_admin)


_LOCKOUT_ATTEMPTS = 5
_LOCKOUT_MINUTES  = 15

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    from datetime import timezone as tz
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if user and user.locked_until:
        locked_until = user.locked_until.replace(tzinfo=tz.utc) if user.locked_until.tzinfo is None else user.locked_until
        if datetime.now(tz.utc) < locked_until:
            raise HTTPException(status_code=429, detail="חשבון נעול זמנית. נסה שנית בעוד 15 דקות.")

    if not user or not auth_utils.verify_password(form_data.password, user.hashed_password):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= _LOCKOUT_ATTEMPTS:
                user.locked_until = datetime.now(tz.utc) + timedelta(minutes=_LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
            db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(tz.utc)
    db.commit()
    # All managers/admins go through 2FA — email always available, TOTP if configured
    if user.totp_enabled and user.totp_secret:
        temp = auth_utils.create_access_token({"sub": str(user.id), "2fa_pending": True}, expires_minutes=5)
        method = user.totp_method or "totp"
        return Token(access_token="", token_type="bearer", user_id=user.id, full_name=user.full_name,
                     role=user.role, is_admin=user.is_admin, requires_2fa=True, temp_token=temp,
                     tfa_method=method, totp_configured=True)

    if user.is_admin or user.role == "manager":
        # No TOTP configured — email 2FA available by default, no setup required
        temp = auth_utils.create_access_token({"sub": str(user.id), "2fa_pending": True}, expires_minutes=30)
        return Token(access_token="", token_type="bearer", user_id=user.id, full_name=user.full_name,
                     role=user.role, is_admin=user.is_admin, requires_2fa=True,
                     tfa_method="email", totp_configured=False, temp_token=temp)

    token = auth_utils.create_access_token({"sub": str(user.id)})
    is_secure = os.environ.get("RAILWAY_ENVIRONMENT") == "production"
    response = JSONResponse(content={
        "access_token": token, "token_type": "bearer",
        "user_id": user.id, "full_name": user.full_name,
        "email": user.email, "role": user.role,
        "is_admin": user.is_admin,
    })
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, secure=is_secure, samesite="strict",
        max_age=auth_utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )
    return response


class Verify2FARequest(BaseModel):
    temp_token: str
    code: str
    method: Optional[str] = None  # 'email' or 'totp' — chosen by user in UI


@router.post("/verify-2fa", response_model=Token)
@limiter.limit("10/minute")
def verify_2fa(request: Request, data: Verify2FARequest, db: Session = Depends(get_db)):
    from jwt import PyJWTError as JWTError
    try:
        payload = auth_utils.decode_token(data.temp_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="טוקן פג תוקף — התחבר מחדש")
    if not payload.get("2fa_pending"):
        raise HTTPException(status_code=400, detail="טוקן לא תקין")
    user_id = int(payload["sub"])
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="משתמש לא נמצא")
    method = user.totp_method or "totp"

    # Email/SMS code — check first as universal fallback (also works for TOTP users)
    email_code_valid = (
        user.email_2fa_code
        and user.email_2fa_code == data.code
        and user.email_2fa_expires
        and datetime.utcnow() <= user.email_2fa_expires.replace(tzinfo=None)
    )

    if method in ("email", "sms") or email_code_valid:
        if email_code_valid:
            user.email_2fa_code = None
            user.email_2fa_expires = None
            db.commit()
        elif not user.email_2fa_code or user.email_2fa_code != data.code:
            raise HTTPException(status_code=401, detail="קוד שגוי — נסה שוב")
        elif not user.email_2fa_expires or datetime.utcnow() > user.email_2fa_expires.replace(tzinfo=None):
            raise HTTPException(status_code=401, detail="הקוד פג תוקף — בקש קוד חדש")
        else:
            user.email_2fa_code = None
            user.email_2fa_expires = None
            db.commit()
    else:
        if not user.totp_secret:
            raise HTTPException(status_code=400, detail="משתמש לא נמצא")
        totp = pyotp.TOTP(fe.decrypt(user.totp_secret))
        if not totp.verify(data.code, valid_window=2):
            raise HTTPException(status_code=401, detail="קוד שגוי — נסה שוב")
    token = auth_utils.create_access_token({"sub": str(user.id)})
    is_secure = os.environ.get("RAILWAY_ENVIRONMENT") == "production"
    response = JSONResponse(content={
        "access_token": token, "token_type": "bearer",
        "user_id": user.id, "full_name": user.full_name,
        "email": user.email, "role": user.role, "is_admin": user.is_admin,
    })
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, secure=is_secure, samesite="strict",
        max_age=auth_utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )
    return response


class RequestEmailCodeRequest(BaseModel):
    temp_token: str


@router.post("/2fa/request-sms-code")
@limiter.limit("5/minute")
def request_sms_code(request: Request, data: RequestEmailCodeRequest, db: Session = Depends(get_db)):
    """Generate an SMS 2FA code for the login flow."""
    from jwt import PyJWTError as JWTError
    try:
        payload = auth_utils.decode_token(data.temp_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="טוקן פג תוקף — התחבר מחדש")
    if not payload.get("2fa_pending"):
        raise HTTPException(status_code=400, detail="טוקן לא תקין")
    user_id = int(payload["sub"])
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.phone_2fa:
        raise HTTPException(status_code=404, detail="מספר טלפון לא מוגדר")
    code = secrets.token_hex(4).upper()
    user.email_2fa_code = code
    user.email_2fa_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    sent = sms_utils.send_2fa_sms(user.phone_2fa, code)
    masked = user.phone_2fa[-4:] if user.phone_2fa else "****"
    return {
        "message": f"קוד נשלח ל-****{masked}" if sent else "קוד נוצר (מצב פיתוח)",
        "phone_masked": f"****{masked}",
        "code": None if sent else code,
        "sms_configured": sent,
    }


@router.post("/2fa/request-email-code")
def request_email_code(data: RequestEmailCodeRequest, db: Session = Depends(get_db)):
    """Generate an email 2FA code for the login flow (displayed in UI since no mail server)."""
    from jwt import PyJWTError as JWTError
    try:
        payload = auth_utils.decode_token(data.temp_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="טוקן פג תוקף — התחבר מחדש")
    if not payload.get("2fa_pending"):
        raise HTTPException(status_code=400, detail="טוקן לא תקין")
    user_id = int(payload["sub"])
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    code = secrets.token_hex(4).upper()  # 8 chars, 32-bit entropy
    user.email_2fa_code = code
    user.email_2fa_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    sent = email_utils.send_2fa_code(user.email, code)
    # Return code only if email is not configured (dev mode fallback)
    return {
        "message": f"קוד נשלח לאימייל {user.email}" if sent else "קוד נוצר (מצב פיתוח)",
        "email": user.email,
        "code": None if sent else code,  # hide code when real email was sent
        "email_configured": sent,
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(auth_utils.get_current_user)):
    return {"id": current_user.id, "full_name": current_user.full_name, "email": current_user.email, "role": current_user.role, "is_admin": current_user.is_admin, "demo_mode_allowed": getattr(current_user, 'demo_mode_allowed', False)}


@router.post("/logout")
def logout(
    request: Request,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke JWT (blacklist jti) and clear HttpOnly cookie."""
    raw_token = request.cookies.get("access_token") or \
                request.headers.get("Authorization", "").removeprefix("Bearer ").strip() or None
    try:
        if raw_token:
            payload = auth_utils.decode_token(raw_token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                from datetime import timezone
                expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
                if not db.query(models.RevokedToken).filter(models.RevokedToken.jti == jti).first():
                    db.add(models.RevokedToken(jti=jti, expires_at=expires_at))
                    db.commit()
    except Exception:
        pass
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(key="access_token", path="/")
    return response


@router.post("/forgot-password")
@limiter.limit("3/15minutes")
def forgot_password(request: Request, data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    _GENERIC = "אם האימייל רשום במערכת, קוד איפוס ישלח אליו"
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        return {"message": _GENERIC, "reset_token": None, "email_configured": False}
    token = secrets.token_urlsafe(16)  # 22 chars, 128-bit entropy
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    sent = email_utils.send_reset_code(user.email, token)
    return {
        "message": _GENERIC,
        "reset_token": None if sent else token,
        "email_configured": sent,
    }


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    _validate_password(data.new_password)
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


@router.post("/2fa/setup")
def setup_2fa(current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Generate a new TOTP secret and return a QR code for scanning."""
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current_user.email, issuer_name="Orly Medical")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()
    # Store secret temporarily (not activated yet — user must confirm code)
    current_user.totp_secret = fe.encrypt(secret)
    current_user.totp_enabled = False
    current_user.totp_method = "totp"
    db.commit()
    return {"qr_code": f"data:image/png;base64,{qr_b64}", "secret": secret}


@router.post("/2fa/setup-email")
def setup_email_2fa(current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Enable email-based 2FA — sends confirmation code to registered email."""
    code = secrets.token_hex(4).upper()  # 8 chars, 32-bit entropy
    current_user.email_2fa_code = code
    current_user.email_2fa_expires = datetime.utcnow() + timedelta(minutes=10)
    current_user.totp_method = "email"
    current_user.totp_enabled = False
    db.commit()
    sent = email_utils.send_2fa_code(current_user.email, code)
    return {
        "message": f"קוד אימות נשלח לאימייל {current_user.email}" if sent else "קוד אימות נוצר",
        "email": current_user.email,
        "code": None if sent else code,
        "email_configured": sent,
    }


class Confirm2FAEmailRequest(BaseModel):
    code: str


@router.post("/2fa/confirm-email")
def confirm_email_2fa(data: Confirm2FAEmailRequest, current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Activate email 2FA after user confirms the code."""
    if not current_user.email_2fa_code or current_user.email_2fa_code != data.code:
        raise HTTPException(status_code=400, detail="קוד שגוי")
    if not current_user.email_2fa_expires or datetime.utcnow() > current_user.email_2fa_expires.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="הקוד פג תוקף")
    current_user.totp_enabled = True
    current_user.totp_method = "email"
    current_user.email_2fa_code = None
    current_user.email_2fa_expires = None
    db.commit()
    return {"message": "אימות דו-שלבי באמצעות אימייל הופעל"}


class SetupSMS2FARequest(BaseModel):
    phone_prefix: str   # e.g. "050"
    phone: str          # e.g. "1234567"


@router.post("/2fa/setup-sms")
def setup_sms_2fa(
    data: SetupSMS2FARequest,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """Save phone number, send verification SMS."""
    e164 = sms_utils.normalize_il_phone(data.phone_prefix, data.phone)
    code = secrets.token_hex(4).upper()
    current_user.phone_2fa = e164
    current_user.phone_2fa_prefix = data.phone_prefix
    current_user.email_2fa_code = code
    current_user.email_2fa_expires = datetime.utcnow() + timedelta(minutes=10)
    current_user.totp_method = "sms"
    current_user.totp_enabled = False
    db.commit()
    sent = sms_utils.send_2fa_sms(e164, code)
    masked = e164[-4:]
    return {
        "message": f"קוד אימות נשלח ל-****{masked}" if sent else "קוד אימות נוצר",
        "phone_masked": f"****{masked}",
        "code": None if sent else code,
        "sms_configured": sent,
    }


@router.post("/2fa/confirm-sms")
def confirm_sms_2fa(
    data: Confirm2FAEmailRequest,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """Activate SMS 2FA after user confirms the code."""
    if not current_user.email_2fa_code or current_user.email_2fa_code != data.code:
        raise HTTPException(status_code=400, detail="קוד שגוי")
    if not current_user.email_2fa_expires or datetime.utcnow() > current_user.email_2fa_expires.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="הקוד פג תוקף")
    current_user.totp_enabled = True
    current_user.totp_method = "sms"
    current_user.email_2fa_code = None
    current_user.email_2fa_expires = None
    db.commit()
    return {"message": "אימות דו-שלבי ב-SMS הופעל"}


class Confirm2FARequest(BaseModel):
    code: str


@router.post("/2fa/confirm")
def confirm_2fa(data: Confirm2FARequest, current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Activate 2FA after user scans QR and confirms a valid code."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="יש להפעיל תחילה את הגדרת 2FA")
    totp = pyotp.TOTP(fe.decrypt(current_user.totp_secret))
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="קוד שגוי — נסה שוב")
    current_user.totp_enabled = True
    db.commit()
    return {"message": "אימות דו-שלבי הופעל בהצלחה"}


@router.delete("/2fa/disable")
def disable_2fa(data: Confirm2FARequest, current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Disable 2FA — requires current valid code (TOTP / email / SMS)."""
    if not current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="אימות דו-שלבי אינו מופעל")
    method = current_user.totp_method or "totp"
    if method in ("email", "sms"):
        if not current_user.email_2fa_code or current_user.email_2fa_code != data.code:
            raise HTTPException(status_code=400, detail="קוד שגוי — בקש קוד חדש תחילה")
    else:
        if not current_user.totp_secret:
            raise HTTPException(status_code=400, detail="אימות דו-שלבי אינו מופעל")
        totp = pyotp.TOTP(fe.decrypt(current_user.totp_secret))
        if not totp.verify(data.code, valid_window=1):
            raise HTTPException(status_code=400, detail="קוד שגוי")
    current_user.totp_secret = None
    current_user.totp_enabled = False
    current_user.email_2fa_code = None
    current_user.email_2fa_expires = None
    current_user.phone_2fa = None
    current_user.phone_2fa_prefix = None
    db.commit()
    return {"message": "אימות דו-שלבי בוטל"}


@router.get("/2fa/status")
def get_2fa_status(current_user: models.User = Depends(auth_utils.get_current_user)):
    phone = current_user.phone_2fa
    masked = f"****{phone[-4:]}" if phone and len(phone) >= 4 else None
    return {
        "totp_enabled": bool(current_user.totp_enabled),
        "totp_method": current_user.totp_method or "totp",
        "phone_masked": masked,
    }


@router.put("/profile/password")
def change_own_password(data: ChangePasswordRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    _validate_password(data.new_password)
    if not auth_utils.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")
    # If 2FA is enabled, verify the code
    if current_user.totp_enabled:
        if not data.tfa_code:
            raise HTTPException(status_code=400, detail="נדרש קוד אימות דו-שלבי")
        method = current_user.totp_method or "totp"
        if method == "email":
            if not current_user.email_2fa_code or current_user.email_2fa_code != data.tfa_code:
                raise HTTPException(status_code=400, detail="קוד אימות שגוי")
            if not current_user.email_2fa_expires or datetime.utcnow() > current_user.email_2fa_expires.replace(tzinfo=None):
                raise HTTPException(status_code=400, detail="קוד האימות פג תוקף")
            current_user.email_2fa_code = None
            current_user.email_2fa_expires = None
        else:
            totp = pyotp.TOTP(fe.decrypt(current_user.totp_secret))
            if not totp.verify(data.tfa_code, valid_window=1):
                raise HTTPException(status_code=400, detail="קוד אימות שגוי")
    current_user.hashed_password = auth_utils.get_password_hash(data.new_password)
    db.commit()
    return {"message": "הסיסמה עודכנה בהצלחה"}


@router.post("/2fa/request-password-email-code")
def request_password_email_code(current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Send email 2FA code for password change."""
    if not current_user.totp_enabled or current_user.totp_method != "email":
        raise HTTPException(status_code=400, detail="אימות אימייל אינו מופעל")
    code = secrets.token_hex(4).upper()  # 8 chars, 32-bit entropy
    current_user.email_2fa_code = code
    current_user.email_2fa_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    sent = email_utils.send_2fa_code(current_user.email, code)
    return {
        "message": f"קוד נשלח לאימייל {current_user.email}" if sent else "קוד נוצר",
        "email": current_user.email,
        "code": None if sent else code,
        "email_configured": sent,
    }
