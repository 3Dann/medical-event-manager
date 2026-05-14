import hashlib
import random
import secrets
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_ipaddr

import models
import auth as auth_utils
import sms_utils
from database import get_db

logger = logging.getLogger("patient_auth")

router = APIRouter(prefix="/api/patient-auth", tags=["patient-auth"])

limiter = Limiter(key_func=get_ipaddr)

_CAPTCHAS: dict = {}
_OTPS: dict = {}


def _cleanup_expired():
    now = datetime.now(timezone.utc)
    expired_captchas = [k for k, v in _CAPTCHAS.items() if v["expires"] < now]
    for k in expired_captchas:
        del _CAPTCHAS[k]
    expired_otps = [k for k, v in _OTPS.items() if v["expires"] < now]
    for k in expired_otps:
        del _OTPS[k]


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@router.get("/captcha")
def get_captcha():
    _cleanup_expired()
    a = random.randint(10, 50)
    b = random.randint(1, 49)
    op = random.choice(["+", "-"])
    answer = a + b if op == "+" else a - b
    captcha_id = secrets.token_hex(16)
    _CAPTCHAS[captcha_id] = {
        "answer": answer,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return {"captcha_id": captcha_id, "question": f"{a} {op} {b} = ?"}


class OTPRequest(BaseModel):
    id_number: str
    captcha_id: str
    captcha_answer: str


@router.post("/otp")
@limiter.limit("5/minute")
def send_otp(request: Request, body: OTPRequest, db: Session = Depends(get_db)):
    _cleanup_expired()

    captcha = _CAPTCHAS.get(body.captcha_id)
    if not captcha:
        raise HTTPException(status_code=400, detail="קוד האימות אינו תקף או פג תוקפו. אנא רענן ונסה שנית.")
    if datetime.now(timezone.utc) > captcha["expires"]:
        del _CAPTCHAS[body.captcha_id]
        raise HTTPException(status_code=400, detail="קוד האימות פג תוקפו. אנא רענן ונסה שנית.")
    try:
        given_answer = int(body.captcha_answer.strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="תשובת האימות חייבת להיות מספר.")
    if given_answer != captcha["answer"]:
        del _CAPTCHAS[body.captcha_id]
        raise HTTPException(status_code=400, detail="תשובת האימות שגויה. אנא רענן ונסה שנית.")
    del _CAPTCHAS[body.captcha_id]

    patient = None
    all_patients = db.query(models.Patient).all()
    for p in all_patients:
        if p.id_number and p.id_number == body.id_number.strip():
            patient = p
            break

    if not patient:
        raise HTTPException(status_code=404, detail="לא נמצא תיק מטופל עם מספר זהות זה. אנא פנה למנהל האירוע שלך.")

    if not patient.phone or not patient.phone_prefix:
        raise HTTPException(status_code=400, detail="אין מספר טלפון מעודכן בתיק. אנא פנה למנהל האירוע שלך.")

    import secrets as _sec
    otp_code = str(_sec.randbelow(900000) + 100000)
    otp_key = _sha256(body.id_number.strip())
    _OTPS[otp_key] = {
        "code_hash": _sha256(otp_code),
        "expires": datetime.now(timezone.utc) + timedelta(minutes=10),
        "attempts": 0,
        "patient_id": patient.id,
    }

    phone = sms_utils.normalize_il_phone(patient.phone_prefix, patient.phone)
    sms_utils.send_2fa_sms(phone, otp_code)

    last_four = patient.phone[-4:] if len(patient.phone) >= 4 else patient.phone
    return {"sent": True, "masked_phone": f"***-***-{last_four}"}


class VerifyRequest(BaseModel):
    id_number: str
    otp: str


def _ensure_patient_user(patient: models.Patient, db: Session) -> models.User:
    import bcrypt

    if patient.patient_user_id:
        existing_user = db.query(models.User).filter(models.User.id == patient.patient_user_id).first()
        if existing_user:
            return existing_user

    email = f"patient_{patient.id}@portal.internal"
    raw_password = secrets.token_hex(32)
    hashed = bcrypt.hashpw(raw_password.encode(), bcrypt.gensalt()).decode()

    try:
        user = models.User(
            full_name=patient.full_name,
            email=email,
            hashed_password=hashed,
            role=models.UserRole.patient,
        )
        db.add(user)
        db.flush()
        patient.patient_user_id = user.id
        db.commit()
        db.refresh(user)
        return user
    except Exception as e:
        db.rollback()
        logger.error("_ensure_patient_user failed for patient %d: %s", patient.id, e)
        raise HTTPException(status_code=500, detail="שגיאה ביצירת גישה. אנא פנה למנהל האירוע שלך.")


@router.post("/verify")
@limiter.limit("10/minute")
def verify_otp(request: Request, body: VerifyRequest, db: Session = Depends(get_db)):
    otp_key = _sha256(body.id_number.strip())
    entry = _OTPS.get(otp_key)

    if not entry:
        raise HTTPException(status_code=400, detail="לא נמצא קוד OTP פעיל. אנא בקש קוד חדש.")

    if datetime.now(timezone.utc) > entry["expires"]:
        del _OTPS[otp_key]
        raise HTTPException(status_code=400, detail="הקוד פג תוקפו. אנא בקש קוד חדש.")

    if entry["attempts"] >= 5:
        del _OTPS[otp_key]
        raise HTTPException(status_code=429, detail="חרגת ממספר הניסיונות המותר. אנא בקש קוד חדש.")

    entry["attempts"] += 1

    if _sha256(body.otp.strip()) != entry["code_hash"]:
        remaining = 5 - entry["attempts"]
        raise HTTPException(status_code=400, detail=f"קוד שגוי, נשארו {remaining} ניסיונות.")

    del _OTPS[otp_key]

    patient = db.query(models.Patient).filter(models.Patient.id == entry["patient_id"]).first()
    if not patient:
        raise HTTPException(status_code=404, detail="לא נמצא תיק מטופל.")

    user = _ensure_patient_user(patient, db)

    token = auth_utils.create_access_token(
        {"sub": str(user.id)},
        expires_minutes=8 * 60,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "patient_name": patient.full_name,
    }
