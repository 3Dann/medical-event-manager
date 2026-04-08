"""
routes/specialties.py — Medical Specialties API

Endpoints:
  GET  /api/specialties              — list all (with sub-specialties tree or flat)
  GET  /api/specialties/{id}         — detail for one specialty
  POST /api/specialties/scrape       — trigger fresh scrape (admin only)
  POST /api/specialties/{id}/feedback — learning: confirm / correct / flag a record
  GET  /api/specialties/insights     — learning analytics (confidence distribution, top flagged)
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import json

from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/specialties", tags=["specialties"])


# ── Schemas ────────────────────────────────────────────────────────────────

class SpecialtyOut(BaseModel):
    id: int
    name_en: str
    name_he: Optional[str]
    description_en: Optional[str]
    description_he: Optional[str]
    parent_id: Optional[int]
    source_url: Optional[str]
    confidence_score: Optional[float] = 1.0
    feedback_count: Optional[int] = 0
    is_verified: Optional[bool] = False
    is_active: Optional[bool] = True

    class Config:
        from_attributes = True


class SpecialtyWithChildren(SpecialtyOut):
    sub_specialties: list["SpecialtyWithChildren"] = []

    class Config:
        from_attributes = True


SpecialtyWithChildren.model_rebuild()


class FeedbackIn(BaseModel):
    action: str               # "confirm" | "correct" | "flag" | "merge"
    note: Optional[str] = None
    correction: Optional[dict] = None   # e.g. {"name_he": "...", "description_he": "..."}


# ── GET /api/specialties ───────────────────────────────────────────────────

@router.get("", response_model=list[SpecialtyOut])
def list_specialties(
    search: Optional[str] = None,
    parent_id: Optional[int] = None,
    only_top_level: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List specialties. Filter by search, parent_id, or only_top_level."""
    q = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.is_active == True)

    if search:
        term = f"%{search}%"
        q = q.filter(
            models.MedicalSpecialty.name_en.ilike(term) |
            models.MedicalSpecialty.name_he.ilike(term)
        )
    if parent_id is not None:
        q = q.filter(models.MedicalSpecialty.parent_id == parent_id)
    if only_top_level:
        q = q.filter(models.MedicalSpecialty.parent_id == None)

    return q.order_by(models.MedicalSpecialty.name_en).all()


@router.get("/tree", response_model=list[SpecialtyWithChildren])
def get_tree(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return top-level specialties with their sub_specialties nested."""
    top = (
        db.query(models.MedicalSpecialty)
        .filter(
            models.MedicalSpecialty.parent_id == None,
            models.MedicalSpecialty.is_active == True,
        )
        .order_by(models.MedicalSpecialty.name_en)
        .all()
    )
    return top


# ── GET /api/specialties/insights ─────────────────────────────────────────

@router.get("/insights")
def get_insights(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Learning analytics: confidence distribution, most flagged, coverage stats."""
    total = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.is_active == True).count()
    verified = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.is_verified == True).count()
    with_hebrew = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.name_he != None).count()

    # Confidence distribution
    high_conf   = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.confidence_score >= 0.8).count()
    medium_conf = db.query(models.MedicalSpecialty).filter(
        models.MedicalSpecialty.confidence_score >= 0.5,
        models.MedicalSpecialty.confidence_score < 0.8
    ).count()
    low_conf    = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.confidence_score < 0.5).count()

    # Most flagged specialties
    flagged = (
        db.query(models.MedicalSpecialtyFeedback, models.MedicalSpecialty)
        .join(models.MedicalSpecialty)
        .filter(models.MedicalSpecialtyFeedback.action == "flag")
        .order_by(models.MedicalSpecialtyFeedback.created_at.desc())
        .limit(10)
        .all()
    )

    # Feedback action breakdown
    feedback_counts = (
        db.query(
            models.MedicalSpecialtyFeedback.action,
            func.count(models.MedicalSpecialtyFeedback.id).label("cnt")
        )
        .group_by(models.MedicalSpecialtyFeedback.action)
        .all()
    )

    return {
        "total_specialties": total,
        "verified": verified,
        "with_hebrew_name": with_hebrew,
        "missing_hebrew": total - with_hebrew,
        "confidence": {
            "high": high_conf,
            "medium": medium_conf,
            "low": low_conf,
        },
        "feedback_summary": {r.action: r.cnt for r in feedback_counts},
        "recently_flagged": [
            {
                "specialty_id": sp.id,
                "name_en": sp.name_en,
                "name_he": sp.name_he,
                "note": fb.note,
            }
            for fb, sp in flagged
        ],
    }


# ── GET /api/specialties/{id} ──────────────────────────────────────────────

@router.get("/{specialty_id}", response_model=SpecialtyWithChildren)
def get_specialty(
    specialty_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sp = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.id == specialty_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Specialty not found")
    return sp


# ── POST /api/specialties/{id}/feedback ───────────────────────────────────

@router.post("/{specialty_id}/feedback")
def submit_feedback(
    specialty_id: int,
    body: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Learning: manager submits feedback on a specialty record.

    Actions:
      confirm  → confidence_score += 0.05 (max 1.0), is_verified = True
      correct  → apply correction fields to record, confidence stays
      flag     → confidence_score -= 0.1 (min 0.0)
      merge    → just logs the intent (handled manually for now)
    """
    sp = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.id == specialty_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Specialty not found")

    if body.action not in ("confirm", "correct", "flag", "merge"):
        raise HTTPException(status_code=400, detail="Invalid action")

    # Apply learning delta
    if body.action == "confirm":
        sp.confidence_score = min(1.0, (sp.confidence_score or 0.8) + 0.05)
        sp.is_verified = True
    elif body.action == "flag":
        sp.confidence_score = max(0.0, (sp.confidence_score or 0.8) - 0.1)
    elif body.action == "correct" and body.correction:
        allowed_fields = {"name_he", "description_he", "description_en", "name_en"}
        for field, value in body.correction.items():
            if field in allowed_fields and value:
                setattr(sp, field, value)

    sp.feedback_count = (sp.feedback_count or 0) + 1

    # Log feedback
    fb = models.MedicalSpecialtyFeedback(
        specialty_id=specialty_id,
        user_id=current_user.id,
        action=body.action,
        note=body.note,
        correction=json.dumps(body.correction) if body.correction else None,
    )
    db.add(fb)
    db.commit()

    return {"ok": True, "confidence_score": sp.confidence_score, "feedback_count": sp.feedback_count}


# ── POST /api/specialties/scrape ──────────────────────────────────────────

@router.post("/scrape")
def trigger_scrape(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Trigger a fresh scrape from all sources (runs in background)."""
    if not current_user.is_admin and current_user.role != "manager":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    def _run():
        from database import SessionLocal
        from specialty_scraper import upsert_specialties
        session = SessionLocal()
        try:
            result = upsert_specialties(session)
        except Exception as e:
            import logging
            logging.getLogger("specialties").error("Scrape error: %s", e)
        finally:
            session.close()

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Scrape started in background"}
