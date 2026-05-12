import secrets
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from slowapi import Limiter
from slowapi.util import get_ipaddr

logger = logging.getLogger("family_share")
limiter = Limiter(key_func=get_ipaddr)
import models
from auth import get_current_user

router = APIRouter()
TOKEN_TTL_DAYS = 7


def _get_valid_token(token: str, db: Session) -> models.FamilyShareToken:
    now = datetime.now(timezone.utc)
    row = db.query(models.FamilyShareToken).filter(
        models.FamilyShareToken.token == token,
        models.FamilyShareToken.is_active == True,
        models.FamilyShareToken.expires_at > now,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="קישור לא תקין או שפג תוקפו")
    return row


# ── יצירת טוקן — המטופל המחובר בלבד ─────────────────────────────────────────
@router.post("/api/patient/family-share")
def create_share_token(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != models.UserRole.patient:
        raise HTTPException(status_code=403, detail="גישה למטופלים בלבד")

    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="לא נמצא תיק מטופל")

    # ביטול טוקנים קודמים
    db.query(models.FamilyShareToken).filter(
        models.FamilyShareToken.patient_id == patient.id,
        models.FamilyShareToken.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    row = models.FamilyShareToken(patient_id=patient.id, token=token, expires_at=expires_at)
    db.add(row)
    db.commit()

    return {
        "token":      token,
        "expires_at": expires_at.isoformat(),
        "days":       TOKEN_TTL_DAYS,
    }


# ── ביטול טוקן ───────────────────────────────────────────────────────────────
@router.delete("/api/patient/family-share")
def revoke_share_token(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != models.UserRole.patient:
        raise HTTPException(status_code=403)

    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == current_user.id
    ).first()
    if patient:
        now = datetime.now(timezone.utc)
        db.query(models.FamilyShareToken).filter(
            models.FamilyShareToken.patient_id == patient.id,
            models.FamilyShareToken.is_active == True,
        ).update({"is_active": False, "revoked_at": now, "revoked_by": current_user.id})
        db.commit()

    return {"ok": True}


# ── בדיקת טוקן קיים ──────────────────────────────────────────────────────────
@router.get("/api/patient/family-share/status")
def share_token_status(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != models.UserRole.patient:
        raise HTTPException(status_code=403)

    patient = db.query(models.Patient).filter(
        models.Patient.patient_user_id == current_user.id
    ).first()
    if not patient:
        return {"active": False}

    now = datetime.now(timezone.utc)
    row = db.query(models.FamilyShareToken).filter(
        models.FamilyShareToken.patient_id == patient.id,
        models.FamilyShareToken.is_active == True,
        models.FamilyShareToken.expires_at > now,
    ).first()

    if not row:
        return {"active": False}

    return {
        "active":     True,
        "expires_at": row.expires_at.isoformat(),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ── צפייה בלבד — ללא אימות ───────────────────────────────────────────────────
@router.get("/api/family-view/{token}")
@limiter.limit("60/minute")
def family_view(request: Request, token: str, db: Session = Depends(get_db)):
    share   = _get_valid_token(token, db)
    patient = db.query(models.Patient).filter(models.Patient.id == share.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404)

    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    logger.info("Family view accessed: patient_id=%s token_id=%s ip=%s", patient.id, share.id, ip)
    try:
        db.add(models.UserActivityLog(
            user_id=None, user_name="family_view",
            action_type="family_view_access",
            resource_type="patient", resource_id=str(patient.id),
            ip_address=ip, status_code=200,
        ))
        db.commit()
    except Exception:
        pass

    # Workflows
    wf_instances = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.patient_id == patient.id,
    ).order_by(models.WorkflowInstance.id.desc()).all()

    def _wf_dict(wf):
        steps = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == wf.id
        ).order_by(models.WorkflowStep.step_order).all()
        total = len(steps)
        done  = sum(1 for s in steps if s.status in ("completed", "skipped"))
        return {
            "id":       wf.id,
            "title":    wf.title,
            "status":   wf.status,
            "progress": round(done / total * 100) if total else 0,
            "steps": [{"name": s.name, "status": s.status} for s in steps],
        }

    # Red flags
    red_flags = [
        {"flag_type": f.flag_type, "title": f.title, "description": f.description}
        for f in patient.red_flags if f.is_active
    ]

    return {
        "patient_name": patient.full_name,
        "diagnosis":    patient.diagnosis_details,
        "expires_at":   share.expires_at.isoformat(),
        "workflows":    [_wf_dict(wf) for wf in wf_instances],
        "red_flags":    red_flags,
        "claims_count": db.query(models.Claim).filter(
            models.Claim.patient_id == patient.id,
            models.Claim.status != "draft",
        ).count(),
    }
