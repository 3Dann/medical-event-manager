from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/responsiveness", tags=["responsiveness"])


class ScoreUpdate(BaseModel):
    response_speed: Optional[float] = None
    bureaucracy_level: Optional[float] = None
    notes: Optional[str] = None


def score_to_dict(s):
    return {
        "id": s.id,
        "company_name": s.company_name,
        "company_type": s.company_type,
        "response_speed": s.response_speed,
        "bureaucracy_level": s.bureaucracy_level,
        "overall_score": s.overall_score,
        "is_default": s.is_default,
        "notes": s.notes,
    }


@router.get("")
def list_scores(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    scores = db.query(models.ResponsivenessScore).all()
    return [score_to_dict(s) for s in scores]


@router.put("/{score_id}")
def update_score(score_id: int, data: ScoreUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    score = db.query(models.ResponsivenessScore).filter(models.ResponsivenessScore.id == score_id).first()
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    if data.response_speed is not None:
        score.response_speed = max(1, min(10, data.response_speed))
    if data.bureaucracy_level is not None:
        score.bureaucracy_level = max(1, min(10, data.bureaucracy_level))
    if data.notes is not None:
        score.notes = data.notes
    score.overall_score = round((score.response_speed + score.bureaucracy_level) / 2, 1)
    score.is_default = False
    db.commit()
    db.refresh(score)
    return score_to_dict(score)
