from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/public", tags=["public"])


def _serialize(f):
    return {
        "id": f.id,
        "name": f.name,
        "role": f.role,
        "message": f.message,
        "rating": f.rating,
        "feedback_type": getattr(f, 'feedback_type', 'general') or 'general',
        "is_read": getattr(f, 'is_read', False),
        "is_handled": getattr(f, 'is_handled', False),
        "created_at": str(f.created_at) if f.created_at else None,
    }


class FeedbackCreate(BaseModel):
    name: str
    role: Optional[str] = None
    message: str
    rating: Optional[int] = None
    feedback_type: Optional[str] = 'general'


@router.post("/feedback")
def submit_feedback(data: FeedbackCreate, db: Session = Depends(get_db)):
    feedback = models.ProjectFeedback(
        name=data.name,
        role=data.role,
        message=data.message,
        rating=max(1, min(5, data.rating)) if data.rating else None,
        feedback_type=data.feedback_type or 'general',
        is_read=False,
        is_handled=False,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return {"message": "תודה על המשוב!", "id": feedback.id}


@router.get("/feedback")
def list_feedback(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    items = db.query(models.ProjectFeedback).order_by(
        models.ProjectFeedback.created_at.desc()
    ).all()
    return [_serialize(f) for f in items]


@router.get("/feedback/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    count = db.query(models.ProjectFeedback).filter(
        models.ProjectFeedback.is_read == False
    ).count()
    return {"count": count}


@router.put("/feedback/mark-read")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    db.query(models.ProjectFeedback).filter(
        models.ProjectFeedback.is_read == False
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": "סומן כנקרא"}


@router.put("/feedback/{feedback_id}/handle")
def toggle_handled(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    item = db.query(models.ProjectFeedback).filter(models.ProjectFeedback.id == feedback_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="לא נמצא")
    item.is_handled = not getattr(item, 'is_handled', False)
    db.commit()
    return _serialize(item)
