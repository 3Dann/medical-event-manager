from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
import json

from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/settings", tags=["settings"])


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
async def save_landing(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Admin-only — saves landing page overrides to DB."""
    from fastapi import HTTPException
    if current_user.email != "da.tzalik@gmail.com":
        raise HTTPException(status_code=403, detail="גישה מורשית למפתח בלבד")
    data = await request.json()
    _set(db, "landing_overrides", json.dumps(data))
    return {"ok": True}
