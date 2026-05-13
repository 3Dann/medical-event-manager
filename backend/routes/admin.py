import os
import secrets
import email_utils
import logging

logger = logging.getLogger("admin")
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/admin", tags=["admin"])


def user_to_dict(u: models.User) -> dict:
    import json as _uj
    try:
        perms = _uj.loads(u.permissions or "[]")
    except Exception:
        perms = []
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "is_admin": u.is_admin,
        "preserve_data": u.preserve_data,
        "demo_mode_allowed": getattr(u, 'demo_mode_allowed', False),
        "permissions": perms,
        "created_at": str(u.created_at) if u.created_at else None,
    }


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    users = db.query(models.User).order_by(models.User.id).all()
    return [user_to_dict(u) for u in users]


class UpdateRoleRequest(BaseModel):
    role: str
    is_admin: Optional[bool] = None


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    data: UpdateRoleRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לשנות הרשאות של עצמך")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if data.role not in ["manager", "patient", "broker"]:
        raise HTTPException(status_code=400, detail="תפקיד לא חוקי")
    user.role = data.role
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.post("/users/{user_id}/reset")
def reset_user_account(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Reset user password. Data is deleted only if preserve_data=False."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לאפס את החשבון שלך")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    temp_password = secrets.token_urlsafe(8)
    user.hashed_password = auth_utils.get_password_hash(temp_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    sent = email_utils.send_temp_password(user.email, temp_password)
    if not sent:
        logger.warning("Admin reset: email not sent for user %s — temp password NOT returned in response", user_id)

    return {
        "message": "הסיסמה אופסה. הסיסמה הזמנית נשלחה לאימייל המשתמש." if sent
                   else "הסיסמה אופסה. שירות המייל אינו מוגדר — שלח ידנית ל-" + user.email,
        "email_sent": sent,
        "preserve_data": user.preserve_data,
    }


@router.post("/users/{user_id}/delete-data")
def delete_user_data(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Delete user data only if preserve_data is False."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if user.preserve_data:
        raise HTTPException(status_code=403, detail="המשתמש ביקש לשמור את המידע שלו — לא ניתן למחוק")
    patients = db.query(models.Patient).filter(models.Patient.manager_id == user_id).all()
    for p in patients:
        db.delete(p)
    db.commit()
    return {"message": f"נמחקו {len(patients)} תיקים"}


@router.put("/users/{user_id}/demo-mode")
def toggle_demo_mode_allowed(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    user.demo_mode_allowed = not getattr(user, 'demo_mode_allowed', False)
    db.commit()
    return user_to_dict(user)


@router.put("/users/{user_id}/preserve-data")
def toggle_preserve_data(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    user.preserve_data = not user.preserve_data
    db.commit()
    return user_to_dict(user)


# ── Patient permission management ────────────────────────────────────────────

@router.get("/patients")
def list_all_patients(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """List all patients (admin only) — for the permissions management UI."""
    patients = db.query(models.Patient).order_by(models.Patient.id).all()
    return [
        {
            "id": p.id,
            "full_name": p.full_name,
            "manager_id": p.manager_id,
            "manager_name": p.manager.full_name if p.manager else None,
        }
        for p in patients
    ]


@router.get("/patients/{patient_id}/permissions")
def get_patient_permissions(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """List all managers who have been explicitly granted access to a patient."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="תיק לא נמצא")
    perms = db.query(models.PatientPermission).filter(
        models.PatientPermission.patient_id == patient_id
    ).all()
    result = []
    for perm in perms:
        manager = db.query(models.User).filter(models.User.id == perm.manager_id).first()
        granter = db.query(models.User).filter(models.User.id == perm.granted_by).first()
        result.append({
            "id": perm.id,
            "manager_id": perm.manager_id,
            "manager_name": manager.full_name if manager else str(perm.manager_id),
            "manager_email": manager.email if manager else "",
            "granted_by_name": granter.full_name if granter else str(perm.granted_by),
            "created_at": perm.created_at.isoformat() if perm.created_at else None,
        })
    return result


class GrantPermissionRequest(BaseModel):
    manager_id: int


@router.post("/patients/{patient_id}/permissions")
def grant_patient_permission(
    patient_id: int,
    data: GrantPermissionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Grant a manager access to a patient they don't own."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="תיק לא נמצא")
    manager = db.query(models.User).filter(models.User.id == data.manager_id).first()
    if not manager:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if manager.role != models.UserRole.manager:
        raise HTTPException(status_code=400, detail="המשתמש אינו מנהל אירוע")
    if patient.manager_id == data.manager_id:
        raise HTTPException(status_code=400, detail="מנהל זה הוא הבעלים של התיק")
    existing = db.query(models.PatientPermission).filter(
        models.PatientPermission.patient_id == patient_id,
        models.PatientPermission.manager_id == data.manager_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="הרשאה כבר קיימת")
    perm = models.PatientPermission(
        patient_id=patient_id,
        manager_id=data.manager_id,
        granted_by=current_user.id,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return {"id": perm.id, "manager_id": perm.manager_id, "manager_name": manager.full_name}


@router.get("/dashboard")
def admin_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """דשבורד ניהולי — סקירת עומס מלווים, נורות אסקלציה, פניות ממתינות."""
    managers = db.query(models.User).filter(
        models.User.role == models.UserRole.manager
    ).order_by(models.User.full_name).all()

    manager_rows = []
    total_critical = 0
    total_pending_requests = 0
    total_pending_claims = 0
    alerts = []

    for mgr in managers:
        patients = db.query(models.Patient).filter(
            models.Patient.manager_id == mgr.id
        ).all()
        patient_ids = [p.id for p in patients]

        critical_flags = 0
        warning_flags = 0
        if patient_ids:
            flags = db.query(models.PatientRedFlag).filter(
                models.PatientRedFlag.patient_id.in_(patient_ids),
                models.PatientRedFlag.is_active == True,
            ).all()
            critical_flags = sum(1 for f in flags if f.severity == "critical")
            warning_flags = sum(1 for f in flags if f.severity == "warning")

            # collect critical alerts
            for f in flags:
                if f.severity == "critical":
                    patient = next((p for p in patients if p.id == f.patient_id), None)
                    alerts.append({
                        "type": "red_flag",
                        "severity": "critical",
                        "patient_id": f.patient_id,
                        "patient_name": patient.full_name if patient else "",
                        "manager_name": mgr.full_name,
                        "manager_id": mgr.id,
                        "title": f.title,
                        "description": f.description or "",
                        "flag_type": f.flag_type,
                    })

        pending_requests = 0
        if patient_ids:
            pending_requests = db.query(models.PatientRequest).filter(
                models.PatientRequest.patient_id.in_(patient_ids),
                models.PatientRequest.status == "pending",
            ).count()

            # collect pending request alerts (max 3 per manager)
            req_items = db.query(models.PatientRequest).filter(
                models.PatientRequest.patient_id.in_(patient_ids),
                models.PatientRequest.status == "pending",
            ).order_by(models.PatientRequest.created_at.asc()).limit(3).all()
            for req in req_items:
                patient = next((p for p in patients if p.id == req.patient_id), None)
                alerts.append({
                    "type": "pending_request",
                    "severity": "warning",
                    "patient_id": req.patient_id,
                    "patient_name": patient.full_name if patient else "",
                    "manager_name": mgr.full_name,
                    "manager_id": mgr.id,
                    "title": f"פנייה ממתינה — {req.category}",
                    "description": req.message[:120] + ("..." if len(req.message) > 120 else ""),
                    "created_at": req.created_at.isoformat() if req.created_at else None,
                })

        pending_claims = 0
        if patient_ids:
            pending_claims = db.query(models.Claim).filter(
                models.Claim.patient_id.in_(patient_ids),
                models.Claim.status.in_(["pending", "draft"]),
            ).count()

        total_critical += critical_flags
        total_pending_requests += pending_requests
        total_pending_claims += pending_claims

        manager_rows.append({
            "id": mgr.id,
            "full_name": mgr.full_name,
            "email": mgr.email,
            "patient_count": len(patients),
            "critical_flags": critical_flags,
            "warning_flags": warning_flags,
            "pending_requests": pending_requests,
            "pending_claims": pending_claims,
        })

    # SLA breaches — active steps past their deadline
    from datetime import datetime, timezone
    now_utc = datetime.now(timezone.utc)
    sla_breached_steps = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.sla_deadline != None,
        models.WorkflowStep.sla_alerted == True,
        models.WorkflowStep.status == "active",
    ).all()
    total_sla_breaches = len(sla_breached_steps)
    for ws in sla_breached_steps[:5]:
        instance = db.get(models.WorkflowInstance, ws.instance_id) if ws.instance_id else None
        patient  = db.get(models.Patient, instance.patient_id) if instance and instance.patient_id else None
        mgr      = db.get(models.User, instance.created_by)    if instance and instance.created_by else None
        if not ws.sla_deadline or ws.sla_deadline > now_utc:
            continue  # skip if deadline not actually passed
        alerts.append({
            "type":         "sla_breach",
            "severity":     "critical",
            "patient_id":   patient.id        if patient else None,
            "patient_name": patient.full_name if patient else "",
            "manager_name": mgr.full_name if mgr else "",
            "manager_id":   mgr.id if mgr else None,
            "title":        f"חריגת SLA — {ws.name}",
            "description":  f"המועד האחרון עבר ב-{ws.sla_deadline.strftime('%d/%m/%Y') if ws.sla_deadline else '?'}",
            "flag_type":    "sla",
        })

    # sort alerts: critical first, then by patient name
    alerts.sort(key=lambda a: (0 if a["severity"] == "critical" else 1, a["patient_name"]))

    all_patients_count = db.query(models.Patient).count()

    return {
        "totals": {
            "managers":        len(managers),
            "patients":        all_patients_count,
            "critical_flags":  total_critical,
            "pending_requests": total_pending_requests,
            "pending_claims":  total_pending_claims,
            "sla_breaches":    total_sla_breaches,
        },
        "managers": manager_rows,
        "alerts": alerts[:20],
    }


@router.get("/sessions")
def list_sessions(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """רשימת sessions — מי מחובר עכשיו."""
    from datetime import datetime, timezone, timedelta
    q = db.query(models.ActiveSession)
    if active_only:
        q = q.filter(models.ActiveSession.is_active == True)
    sessions = q.order_by(models.ActiveSession.last_seen.desc()).limit(100).all()
    now = datetime.now(timezone.utc)
    result = []
    for s in sessions:
        user = db.get(models.User, s.user_id)
        last_seen = s.last_seen
        if last_seen and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        minutes_ago = int((now - last_seen).total_seconds() / 60) if last_seen else None
        result.append({
            "id":           s.id,
            "user_id":      s.user_id,
            "user_name":    user.full_name if user else "—",
            "user_email":   user.email if user else "—",
            "user_role":    user.role if user else "—",
            "jti":          s.jti[:8] + "…",  # partial, for display only
            "login_at":     s.login_at.isoformat() if s.login_at else None,
            "last_seen":    last_seen.isoformat() if last_seen else None,
            "minutes_ago":  minutes_ago,
            "ip_address":   s.ip_address,
            "user_agent":   s.user_agent,
            "is_active":    s.is_active,
            "revoked_at":   s.revoked_at.isoformat() if s.revoked_at else None,
        })
    return result


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """ביטול session מרחוק — מנתק את המשתמש בבקשתו הבאה."""
    from datetime import datetime, timezone, timedelta
    session = db.get(models.ActiveSession, session_id)
    if not session:
        raise HTTPException(404, "Session לא נמצא")
    if not session.is_active:
        raise HTTPException(400, "Session כבר בוטל")
    # Mark session inactive + add JTI to blacklist so next request is rejected
    session.is_active = False
    session.revoked_at = datetime.now(timezone.utc)
    session.revoked_by = current_user.id
    if session.jti:
        existing = db.query(models.RevokedToken).filter(
            models.RevokedToken.jti == session.jti
        ).first()
        if not existing:
            db.add(models.RevokedToken(
                jti=session.jti,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            ))
    db.commit()
    return {"ok": True, "message": "Session בוטל — המשתמש ינותק בבקשתו הבאה"}


@router.get("/tasks")
def admin_tasks(
    overdue_only: bool = False,
    status: str = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """רשימת משימות לאדמין — עם סינון לפי איחור וסטטוס."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    q = db.query(models.Task)
    if status:
        q = q.filter(models.Task.status == status)
    if overdue_only:
        q = q.filter(models.Task.due_date < now)
    tasks = q.order_by(models.Task.due_date.asc().nullslast()).limit(limit).all()

    result = []
    for t in tasks:
        patient = db.get(models.Patient, t.patient_id) if t.patient_id else None
        assignee = db.get(models.User, t.assigned_to) if t.assigned_to else None
        result.append({
            "id":           t.id,
            "title":        t.title,
            "status":       t.status,
            "priority":     t.priority,
            "due_date":     t.due_date.isoformat() if t.due_date else None,
            "source_type":  t.source_type,
            "patient_id":   t.patient_id,
            "patient_name": patient.full_name if patient else None,
            "assigned_to":  t.assigned_to,
            "assigned_name": assignee.full_name if assignee else None,
        })
    return result


@router.patch("/users/{user_id}/permissions")
def update_user_permissions(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Set permissions list for a user. data: {"permissions": ["export_pdf","download_docs"]}"""
    _VALID_PERMS = {"export_pdf", "download_docs", "view_financials"}
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "משתמש לא נמצא")
    import json as _j
    perms = data.get("permissions", [])
    invalid = [p for p in perms if p not in _VALID_PERMS]
    if invalid:
        raise HTTPException(400, f"הרשאות לא חוקיות: {invalid}")
    user.permissions = _j.dumps(perms)
    db.commit()
    return {"ok": True, "permissions": perms}


@router.delete("/patients/{patient_id}/permissions/{manager_id}")
def revoke_patient_permission(
    patient_id: int,
    manager_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    """Revoke a manager's access to a patient."""
    perm = db.query(models.PatientPermission).filter(
        models.PatientPermission.patient_id == patient_id,
        models.PatientPermission.manager_id == manager_id,
    ).first()
    if not perm:
        raise HTTPException(status_code=404, detail="הרשאה לא נמצאה")
    db.delete(perm)
    db.commit()
    return {"ok": True}
