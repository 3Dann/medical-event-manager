from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any
import json

from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LandingOverrides(BaseModel):
    heroBadge:   str
    stats:       Any   # list of {val, label}
    ctaTitle:    str
    ctaSubtitle: str


def _get(db: Session, key: str):
    row = db.query(models.SiteSetting).filter_by(key=key).first()
    return row.value if row else None


def _set(db: Session, key: str, value: str):
    row = db.query(models.SiteSetting).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(models.SiteSetting(key=key, value=value))
    db.commit()


@router.get("/landing")
def get_landing(db: Session = Depends(get_db)):
    """Public — returns stored landing page overrides (or empty dict if none)."""
    raw = _get(db, "landing_overrides")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


@router.put("/landing")
def save_landing(
    data: LandingOverrides,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Admin-only — saves landing page overrides to DB."""
    if not current_user.is_admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="נדרשת הרשאת מנהל")
    _set(db, "landing_overrides", json.dumps(data.model_dump()))
    return {"ok": True}
