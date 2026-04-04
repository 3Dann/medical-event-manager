from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
import secrets
import pyotp
import qrcode
import io
import base64
from fastapi.responses import JSONResponse
from database import get_db
import models
import auth as auth_utils
import email_utils

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
    requires_2fa: bool = False
    temp_token: str = None
    tfa_method: str = None


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
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    is_first_user = db.query(models.User).count() == 0
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
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role, is_admin=user.is_admin)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth_utils.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.totp_enabled and user.totp_secret:
        # Return temp token — frontend must complete 2FA step
        temp = auth_utils.create_access_token({"sub": str(user.id), "2fa_pending": True}, expires_minutes=5)
        method = user.totp_method or "totp"
        return Token(access_token="", token_type="bearer", user_id=user.id, full_name=user.full_name,
                     role=user.role, is_admin=user.is_admin, requires_2fa=True, temp_token=temp, tfa_method=method)
    token = auth_utils.create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role, is_admin=user.is_admin)


class Verify2FARequest(BaseModel):
    temp_token: str
    code: str


@router.post("/verify-2fa", response_model=Token)
def verify_2fa(data: Verify2FARequest, db: Session = Depends(get_db)):
    from jose import JWTError
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
    if method == "email":
        if not user.email_2fa_code or user.email_2fa_code != data.code:
            raise HTTPException(status_code=401, detail="קוד שגוי — נסה שוב")
        if not user.email_2fa_expires or datetime.utcnow() > user.email_2fa_expires.replace(tzinfo=None):
            raise HTTPException(status_code=401, detail="הקוד פג תוקף — בקש קוד חדש")
        user.email_2fa_code = None
        user.email_2fa_expires = None
        db.commit()
    else:
        if not user.totp_secret:
            raise HTTPException(status_code=400, detail="משתמש לא נמצא")
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(data.code, valid_window=1):
            raise HTTPException(status_code=401, detail="קוד שגוי — נסה שוב")
    token = auth_utils.create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user_id=user.id, full_name=user.full_name, role=user.role, is_admin=user.is_admin)


class RequestEmailCodeRequest(BaseModel):
    temp_token: str


@router.post("/2fa/request-email-code")
def request_email_code(data: RequestEmailCodeRequest, db: Session = Depends(get_db)):
    """Generate an email 2FA code for the login flow (displayed in UI since no mail server)."""
    from jose import JWTError
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
    code = secrets.token_hex(3).upper()  # 6 chars
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
    sent = email_utils.send_reset_code(user.email, token)
    return {
        "message": f"קוד איפוס נשלח לאימייל {user.email}" if sent else "קוד איפוס נוצר",
        "reset_token": None if sent else token,  # hide when real email sent
        "email_configured": sent,
    }


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
    current_user.totp_secret = secret
    current_user.totp_enabled = False
    current_user.totp_method = "totp"
    db.commit()
    return {"qr_code": f"data:image/png;base64,{qr_b64}", "secret": secret}


@router.post("/2fa/setup-email")
def setup_email_2fa(current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Enable email-based 2FA — sends confirmation code to registered email."""
    code = secrets.token_hex(3).upper()
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


class Confirm2FARequest(BaseModel):
    code: str


@router.post("/2fa/confirm")
def confirm_2fa(data: Confirm2FARequest, current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Activate 2FA after user scans QR and confirms a valid code."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="יש להפעיל תחילה את הגדרת 2FA")
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="קוד שגוי — נסה שוב")
    current_user.totp_enabled = True
    db.commit()
    return {"message": "אימות דו-שלבי הופעל בהצלחה"}


@router.delete("/2fa/disable")
def disable_2fa(data: Confirm2FARequest, current_user: models.User = Depends(auth_utils.get_current_user), db: Session = Depends(get_db)):
    """Disable 2FA — requires current TOTP code to confirm."""
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="אימות דו-שלבי אינו מופעל")
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="קוד שגוי")
    current_user.totp_secret = None
    current_user.totp_enabled = False
    db.commit()
    return {"message": "אימות דו-שלבי בוטל"}


@router.get("/2fa/status")
def get_2fa_status(current_user: models.User = Depends(auth_utils.get_current_user)):
    return {"totp_enabled": bool(current_user.totp_enabled), "totp_method": current_user.totp_method or "totp"}


@router.put("/profile/password")
def change_own_password(data: ChangePasswordRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
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
            totp = pyotp.TOTP(current_user.totp_secret)
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
    code = secrets.token_hex(3).upper()
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
