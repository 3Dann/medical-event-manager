import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import FamilyShareToken, Patient, PatientRequest
from auth import get_current_user

router = APIRouter()

TOKEN_TTL_DAYS = 7


def _get_token(token: str, db: Session) -> FamilyShareToken:
    now = datetime.now(timezone.utc)
    row = db.query(FamilyShareToken).filter(
        FamilyShareToken.token == token,
        FamilyShareToken.is_active == True,
        FamilyShareToken.expires_at > now,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="קישור לא תקין או פג תוקף")
    return row


# ── יצירת טוקן (המטופל המחובר בלבד) ─────────────────────────────────────────
@router.post("/api/patient/family-share")
def create_share_token(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="גישה למטופלים בלבד")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="לא נמצא תיק מטופל")

    # ביטול טוקנים קודמים
    db.query(FamilyShareToken).filter(
        FamilyShareToken.patient_id == patient.id,
        FamilyShareToken.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    row = FamilyShareToken(patient_id=patient.id, token=token, expires_at=expires_at)
    db.add(row)
    db.commit()

    return {"token": token, "expires_at": expires_at.isoformat(), "days": TOKEN_TTL_DAYS}


# ── צפייה בלבד — ללא אימות ───────────────────────────────────────────────────
@router.get("/api/family-view/{token}")
def family_view(token: str, db: Session = Depends(get_db)):
    share = _get_token(token, db)
    patient = db.query(Patient).filter(Patient.id == share.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404)

    # מחזיר מידע מצומצם — ללא מסמכים פרטיים ובלי אפשרות שליחת פניות
    from routes.patient_portal import _build_summary
    summary = _build_summary(patient, db)

    return {
        "patient_name": patient.full_name,
        "expires_at": share.expires_at.isoformat(),
        "summary": {
            "workflows": summary.get("workflows", []),
            "red_flags": summary.get("red_flags", []),
            "financial":  summary.get("financial", {}),
            "claims_count": len(summary.get("claims", [])),
        }
    }
