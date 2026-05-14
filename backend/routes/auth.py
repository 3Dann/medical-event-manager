from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone as tz_module
from typing import Optional, Union
import os
import secrets
import logging
import pyotp
import field_encrypt as fe

logger = logging.getLogger("auth")
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
    org_name: Optional[str] = None
    applicant_message: Optional[str] = None


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
    must_change_password: bool = False
    demo_mode_allowed: bool = False


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


@router.post("/register")
@limiter.limit("3/hour")
def register(request: Request, user_data: UserCreate, db: Session = Depends(get_db),
             current_user: Optional[models.User] = Depends(auth_utils.get_optional_current_user)):
    is_first_user = db.query(models.User).count() == 0
    if is_first_user:
        _validate_password(user_data.password)
        existing = db.query(models.User).filter(models.User.email == user_data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        user = models.User(
            full_name=user_data.full_name,
            email=user_data.email,
            hashed_password=auth_utils.get_password_hash(user_data.password),
            role=user_data.role,
            is_admin=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = auth_utils.create_access_token({"sub": str(user.id)})
        return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, email=user.email, role=user.role, is_admin=user.is_admin, demo_mode_allowed=bool(user.demo_mode_allowed))

    _validate_password(user_data.password)
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    existing_pending = db.query(models.PendingRegistration).filter(
        models.PendingRegistration.email == user_data.email,
        models.PendingRegistration.status == "pending",
    ).first()
    if existing_pending:
        raise HTTPException(status_code=400, detail="בקשת רישום עם מייל זה כבר ממתינה לאישור")

    pending = models.PendingRegistration(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=auth_utils.get_password_hash(user_data.password),
        role=user_data.role,
        org_name=user_data.org_name,
        applicant_message=user_data.applicant_message,
    )
    db.add(pending)
    db.commit()

    admins = db.query(models.User).filter(models.User.is_admin == True).all()
    for admin in admins:
        email_utils.send_email(
            to=admin.email,
            subject="בקשת רישום חדשה — Orly Medical",
            body_html=f"""
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
              <h2 style="color: #1e3a5f;">בקשת רישום חדשה</h2>
              <p style="color: #374151;">התקבלה בקשת רישום חדשה למערכת:</p>
              <div style="background: white; border-radius: 10px; padding: 20px; border: 1px solid #e2e8f0; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>שם:</strong> {user_data.full_name}</p>
                <p style="margin: 4px 0;"><strong>מייל:</strong> {user_data.email}</p>
                <p style="margin: 4px 0;"><strong>תפקיד:</strong> {user_data.role}</p>
                {f'<p style="margin: 4px 0;"><strong>ארגון:</strong> {user_data.org_name}</p>' if user_data.org_name else ''}
                {f'<p style="margin: 4px 0;"><strong>הערה:</strong> {user_data.applicant_message}</p>' if user_data.applicant_message else ''}
              </div>
              <p style="color: #6b7280; font-size: 13px;">כנס לאזור הניהול כדי לאשר או לדחות את הבקשה.</p>
            </div>
            """,
        )

    return {"pending": True, "message": "בקשתך התקבלה. תקבל אישור במייל לאחר בדיקת האדמין."}


@router.get("/admin/registrations")
def list_registrations(
    status: str = Query("pending"),
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="נגיש לאדמין בלבד")
    regs = db.query(models.PendingRegistration).filter(
        models.PendingRegistration.status == status
    ).order_by(models.PendingRegistration.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "full_name": r.full_name,
            "email": r.email,
            "role": r.role,
            "org_name": r.org_name,
            "applicant_message": r.applicant_message,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "rejection_reason": r.rejection_reason,
        }
        for r in regs
    ]


@router.post("/admin/registrations/{reg_id}/approve")
def approve_registration(
    reg_id: int,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="נגיש לאדמין בלבד")
    reg = db.query(models.PendingRegistration).filter(models.PendingRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if reg.status != "pending":
        raise HTTPException(status_code=400, detail="הבקשה כבר טופלה")
    existing = db.query(models.User).filter(models.User.email == reg.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="המייל כבר רשום במערכת")
    temp_password = secrets.token_urlsafe(10)
    user = models.User(
        full_name=reg.full_name,
        email=reg.email,
        hashed_password=auth_utils.get_password_hash(temp_password),
        role=reg.role,
        is_admin=False,
        must_change_password=True,
    )
    db.add(user)
    reg.status = "approved"
    reg.reviewed_at = datetime.now(tz_module.utc)
    reg.reviewed_by_id = current_user.id
    db.commit()
    email_utils.send_email(
        to=reg.email,
        subject="בקשתך אושרה — Orly Medical",
        body_html=f"""
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
          <h2 style="color: #1e3a5f;">בקשתך אושרה!</h2>
          <p style="color: #374151;">שלום {reg.full_name},</p>
          <p style="color: #374151;">בקשתך לרישום ל-Orly Medical אושרה.</p>
          <p style="color: #374151; margin-top: 16px;">הסיסמה הזמנית שלך:</p>
          <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 20px; margin: 12px 0; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: center; direction: ltr;">
            {temp_password}
          </div>
          <p style="color: #dc2626; font-weight: bold;">יש לשנות את הסיסמה בכניסה הראשונה.</p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">צוות Orly Medical</p>
        </div>
        """,
    )
    return {"approved": True}


class RejectRegistrationRequest(BaseModel):
    reason: str


@router.post("/admin/registrations/{reg_id}/reject")
def reject_registration(
    reg_id: int,
    body: RejectRegistrationRequest,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="נגיש לאדמין בלבד")
    reg = db.query(models.PendingRegistration).filter(models.PendingRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if reg.status != "pending":
        raise HTTPException(status_code=400, detail="הבקשה כבר טופלה")
    reg.status = "rejected"
    reg.reviewed_at = datetime.now(tz_module.utc)
    reg.reviewed_by_id = current_user.id
    reg.rejection_reason = body.reason
    db.commit()
    email_utils.send_email(
        to=reg.email,
        subject="עדכון לגבי בקשת הרישום שלך — Orly Medical",
        body_html=f"""
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
          <h2 style="color: #1e3a5f;">עדכון לגבי בקשת הרישום</h2>
          <p style="color: #374151;">שלום {reg.full_name},</p>
          <p style="color: #374151;">בקשתך לרישום ל-Orly Medical נדחתה.</p>
          <div style="background: #fef2f2; border-radius: 8px; padding: 16px; border: 1px solid #fecaca; margin: 16px 0;">
            <p style="margin: 0; color: #7f1d1d;"><strong>סיבה:</strong> {body.reason}</p>
          </div>
          <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">לשאלות נוספות, פנה לצוות Orly Medical.</p>
        </div>
        """,
    )
    return {"rejected": True}


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
        "must_change_password": bool(user.must_change_password),
        "demo_mode_allowed": bool(getattr(user, "demo_mode_allowed", False)),
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
@limiter.limit("3/minute")
def verify_2fa(request: Request, data: Verify2FARequest, db: Session = Depends(get_db)):
    from datetime import timezone as tz
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

    # Enforce lockout — same counter as login failures
    if user.locked_until:
        locked_until = user.locked_until.replace(tzinfo=tz.utc) if user.locked_until.tzinfo is None else user.locked_until
        if datetime.now(tz.utc) < locked_until:
            raise HTTPException(status_code=429, detail="חשבון נעול זמנית. נסה שנית בעוד 15 דקות.")

    # Prefer the method the user chose in the UI; fall back to stored method
    chosen_method = data.method or user.totp_method or "email"

    def _record_2fa_failure():
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= _LOCKOUT_ATTEMPTS:
            user.locked_until = datetime.now(tz.utc) + timedelta(minutes=_LOCKOUT_MINUTES)
            user.failed_login_attempts = 0
            logger.warning("Account locked after repeated 2FA failures: user_id=%s", user.id)
        db.commit()

    if chosen_method == "totp":
        if not user.totp_secret:
            raise HTTPException(status_code=400, detail="יש להגדיר תחילה את גוגל אותנטיקייטור")
        totp = pyotp.TOTP(fe.decrypt(user.totp_secret))
        if not totp.verify(data.code, valid_window=2):
            _record_2fa_failure()
            raise HTTPException(status_code=401, detail="חוסר התאמה בזיהוי — הקוד שהוזן אינו תואם")
        # Auto-enable on first successful TOTP use during login
        if not user.totp_enabled:
            user.totp_enabled = True
            user.totp_method = "totp"
            db.commit()
    else:
        # email or sms
        if not user.email_2fa_code or user.email_2fa_code != data.code:
            _record_2fa_failure()
            raise HTTPException(status_code=401, detail="חוסר התאמה בזיהוי — הקוד שהוזן אינו תואם")
        if not user.email_2fa_expires or datetime.utcnow() > user.email_2fa_expires.replace(tzinfo=None):
            raise HTTPException(status_code=401, detail="חוסר התאמה בזיהוי — הקוד פג תוקף, בקש קוד חדש")
        user.email_2fa_code = None
        user.email_2fa_expires = None
        db.commit()
    # 2FA passed — reset failure counter
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    token = auth_utils.create_access_token({"sub": str(user.id)})
    # Record active session
    try:
        decoded = auth_utils.decode_token(token)
        jti = decoded.get("jti")
        ip  = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or (request.client.host if request.client else None)
        ua  = request.headers.get("User-Agent", "")[:256]
        if jti:
            db.add(models.ActiveSession(
                user_id=user.id, jti=jti,
                ip_address=ip, user_agent=ua,
            ))
            db.commit()
    except Exception:
        logger.warning("ActiveSession create failed", exc_info=True)
    is_secure = os.environ.get("RAILWAY_ENVIRONMENT") == "production"
    response = JSONResponse(content={
        "access_token": token, "token_type": "bearer",
        "user_id": user.id, "full_name": user.full_name,
        "email": user.email, "role": user.role, "is_admin": user.is_admin,
        "must_change_password": bool(user.must_change_password),
        "demo_mode_allowed": bool(user.demo_mode_allowed),
    })
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, secure=is_secure, samesite="strict",
        max_age=auth_utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )
    return response


class ChangeRequiredPasswordRequest(BaseModel):
    new_password: str

@router.post("/change-required-password")
@limiter.limit("10/minute")
def change_required_password(
    request: Request,
    body: ChangeRequiredPasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    if not current_user.must_change_password:
        raise HTTPException(status_code=400, detail="שינוי סיסמה אינו נדרש")
    _validate_password(body.new_password)
    current_user.hashed_password = auth_utils.get_password_hash(body.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"changed": True}


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


@router.post("/2fa/setup-totp-login")
def setup_totp_during_login(data: RequestEmailCodeRequest, db: Session = Depends(get_db)):
    """Generate TOTP secret during login flow (uses temp_token, no full auth needed)."""
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
    if user.totp_secret:
        secret = fe.decrypt(user.totp_secret)
    else:
        secret = pyotp.random_base32()
        user.totp_secret = fe.encrypt(secret)
        user.totp_enabled = False
        user.totp_method = "totp"
        db.commit()
    totp_obj = pyotp.TOTP(secret)
    uri = totp_obj.provisioning_uri(name=user.email, issuer_name="Orly Medical")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()
    return {"qr_code": f"data:image/png;base64,{qr_b64}", "secret": secret}


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
                # Mark active session as revoked
                session = db.query(models.ActiveSession).filter(
                    models.ActiveSession.jti == jti
                ).first()
                if session:
                    session.is_active = False
                    session.revoked_at = datetime.now(timezone.utc)
                db.commit()
    except Exception:
        pass
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(key="access_token", path="/")
    return response


_RESET_CHALLENGES: dict = {}


def _cleanup_reset_challenges():
    from datetime import timezone as tz
    now = datetime.now(tz.utc)
    expired = [k for k, v in _RESET_CHALLENGES.items() if v["expires"] < now]
    for k in expired:
        del _RESET_CHALLENGES[k]


class ForgotPasswordVerifyRequest(BaseModel):
    email: str
    id_number: str
    extra_answer: str


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    from datetime import timezone as tz
    import random
    _cleanup_reset_challenges()
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        return {"step": "verify", "extra_field": "מה שמך המלא?"}
    options = []
    if user.full_name:
        options.append(("full_name", "מה שמך המלא?"))
    pending_reg = db.query(models.PendingRegistration).filter(
        models.PendingRegistration.email == data.email,
        models.PendingRegistration.status == "approved",
    ).first()
    if pending_reg and pending_reg.org_name:
        options.append(("org_name", "מה שם הארגון שלך?"))
    if not options:
        options.append(("full_name", "מה שמך המלא?"))
    chosen_field, chosen_label = random.choice(options)
    _RESET_CHALLENGES[data.email] = {
        "field": chosen_field,
        "expires": datetime.now(tz.utc) + timedelta(minutes=10),
        "user_id": user.id,
    }
    return {"step": "verify", "extra_field": chosen_label}


@router.post("/forgot-password/verify")
@limiter.limit("5/minute")
def forgot_password_verify(request: Request, data: ForgotPasswordVerifyRequest, db: Session = Depends(get_db)):
    from datetime import timezone as tz
    _cleanup_reset_challenges()
    challenge = _RESET_CHALLENGES.get(data.email)
    if not challenge or challenge["expires"] < datetime.now(tz.utc):
        raise HTTPException(status_code=400, detail="נא להתחיל מחדש")
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="נא להתחיל מחדש")
    if (user.reset_verify_attempts or 0) >= 3:
        raise HTTPException(status_code=429, detail="החשבון חסום. פנה לאדמין.")
    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == user.id
    ).first()
    id_ok = True
    if patient and patient.id_number:
        id_ok = (data.id_number.strip() == (patient.id_number or "").strip())
    extra_ok = False
    field = challenge["field"]
    if field == "full_name":
        extra_ok = data.extra_answer.strip().lower() == (user.full_name or "").strip().lower()
    elif field == "org_name":
        pending_reg = db.query(models.PendingRegistration).filter(
            models.PendingRegistration.email == data.email,
            models.PendingRegistration.status == "approved",
        ).first()
        org = (pending_reg.org_name or "").strip().lower() if pending_reg else ""
        extra_ok = data.extra_answer.strip().lower() == org
    if not id_ok or not extra_ok:
        user.reset_verify_attempts = (user.reset_verify_attempts or 0) + 1
        db.commit()
        if user.reset_verify_attempts >= 3:
            user.locked_until = datetime.now(tz.utc) + timedelta(days=365)
            db.commit()
            _RESET_CHALLENGES.pop(data.email, None)
            admins = db.query(models.User).filter(models.User.is_admin == True).all()
            for admin in admins:
                email_utils.send_email(
                    to=admin.email,
                    subject="חשבון נחסם — ניסיונות שחזור סיסמה חשודים",
                    body_html=(
                        f"<div dir='rtl' style='font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;'>"
                        f"<h2 style='color:#1e3a5f;'>חשבון נחסם</h2>"
                        f"<p>החשבון של <strong>{user.full_name}</strong> ({user.email}) נחסם לאחר 3 ניסיונות כושלים לאימות זהות בתהליך שחזור סיסמה.</p>"
                        f"<p style='color:#6b7280;font-size:13px;'>כנס לאזור הניהול כדי לשחרר את החשבון.</p>"
                        f"</div>"
                    ),
                )
            raise HTTPException(status_code=403, detail="זיהוי נכשל 3 פעמים. חשבונך נחסם — פנה לאדמין.")
        remaining = 3 - user.reset_verify_attempts
        raise HTTPException(status_code=401, detail=f"פרטים שגויים. נותרו {remaining} ניסיונות.")
    user.reset_verify_attempts = 0
    _RESET_CHALLENGES.pop(data.email, None)
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.commit()
    frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
    import urllib.parse
    link = f"{frontend_origin}/reset-password?token={urllib.parse.quote(reset_token)}&email={urllib.parse.quote(user.email)}"
    email_utils.send_reset_link(user.email, link)
    return {"step": "reset_sent", "message": "קישור לאיפוס סיסמה נשלח לאימייל שלך"}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    _validate_password(data.new_password)
    user = db.query(models.User).filter(models.User.reset_token == data.token).first()
    if not user:
        raise HTTPException(status_code=400, detail="קישור האיפוס אינו תקין")
    now = datetime.now(timezone.utc)
    expires = user.reset_token_expires
    if not expires:
        raise HTTPException(status_code=400, detail="קישור האיפוס אינו תקין")
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="קישור האיפוס פג תוקף — בקש קישור חדש")
    user.hashed_password = auth_utils.get_password_hash(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    user.must_change_password = False
    db.commit()
    return {"message": "הסיסמה עודכנה בהצלחה"}


@router.get("/reset-password/validate")
def validate_reset_token(token: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.reset_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="קישור לא תקין")
    now = datetime.now(timezone.utc)
    expires = user.reset_token_expires
    if not expires:
        raise HTTPException(status_code=400, detail="קישור לא תקין")
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="קישור פג תוקף")
    return {"valid": True}


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
