from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/admin", tags=["audit"])


def _to_dict(log: models.UserActivityLog) -> dict:
    return {
        "id": log.id,
        "user_id": log.user_id,
        "user_name": log.user_name,
        "action_type": log.action_type,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "ip_address": log.ip_address,
        "status_code": log.status_code,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.get("/activity")
def list_activity(
    user_id: Optional[int] = Query(None),
    action_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    q = db.query(models.UserActivityLog)
    if user_id:
        q = q.filter(models.UserActivityLog.user_id == user_id)
    if action_type:
        q = q.filter(models.UserActivityLog.action_type == action_type)
    if date_from:
        try:
            q = q.filter(models.UserActivityLog.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(models.UserActivityLog.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    total = q.count()
    items = (
        q.order_by(models.UserActivityLog.created_at.desc())
         .offset((page - 1) * limit)
         .limit(limit)
         .all()
    )

    return {"total": total, "page": page, "limit": limit, "items": [_to_dict(l) for l in items]}
