"""תבניות שאלות לפגישות — ניהול ע"י אדמין."""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
import auth as auth_utils

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Serializer ────────────────────────────────────────────────────────────────

def _item_dict(item: models.QuestionItem) -> dict:
    return {
        "id":            item.id,
        "template_id":   item.template_id,
        "text":          item.text,
        "question_type": item.question_type,
        "order_index":   item.order_index,
        "is_required":   item.is_required,
        "hint":          item.hint,
    }

def _template_dict(t: models.QuestionTemplate, include_items: bool = True) -> dict:
    d = {
        "id":          t.id,
        "name":        t.name,
        "category":    t.category,
        "description": t.description,
        "is_builtin":  t.is_builtin,
        "created_at":  t.created_at.isoformat() if t.created_at else None,
        "items_count": len(t.items),
    }
    if include_items:
        d["items"] = [_item_dict(i) for i in t.items]
    return d


# ── Pydantic ──────────────────────────────────────────────────────────────────

class QuestionItemBody(BaseModel):
    text:          str
    question_type: str = "text"   # "text" | "bool"
    order_index:   int = 0
    is_required:   bool = False
    hint:          Optional[str] = None

class TemplateBody(BaseModel):
    name:        str
    category:    Optional[str] = None
    description: Optional[str] = None
    items:       List[QuestionItemBody] = []


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/api/question-templates")
def list_templates(db: Session = Depends(get_db),
                   current_user=Depends(auth_utils.require_manager)):
    templates = db.query(models.QuestionTemplate).order_by(
        models.QuestionTemplate.is_builtin.desc(),
        models.QuestionTemplate.name
    ).all()
    return [_template_dict(t) for t in templates]


@router.get("/api/question-templates/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db),
                 current_user=Depends(auth_utils.require_manager)):
    t = db.query(models.QuestionTemplate).filter(
        models.QuestionTemplate.id == template_id
    ).first()
    if not t:
        raise HTTPException(404, "תבנית לא נמצאה")
    return _template_dict(t)


@router.post("/api/question-templates")
def create_template(body: TemplateBody, db: Session = Depends(get_db),
                    current_user=Depends(auth_utils.require_admin)):
    t = models.QuestionTemplate(
        name=body.name,
        category=body.category,
        description=body.description,
        is_builtin=False,
        created_by=current_user.id,
    )
    db.add(t)
    db.flush()
    for i, item in enumerate(body.items):
        db.add(models.QuestionItem(
            template_id=t.id,
            text=item.text,
            question_type=item.question_type,
            order_index=item.order_index if item.order_index is not None else i,
            is_required=item.is_required,
            hint=item.hint,
        ))
    db.commit()
    db.refresh(t)
    return _template_dict(t)


@router.put("/api/question-templates/{template_id}")
def update_template(template_id: int, body: TemplateBody,
                    db: Session = Depends(get_db),
                    current_user=Depends(auth_utils.require_admin)):
    t = db.query(models.QuestionTemplate).filter(
        models.QuestionTemplate.id == template_id
    ).first()
    if not t:
        raise HTTPException(404, "תבנית לא נמצאה")
    if t.is_builtin:
        raise HTTPException(400, "לא ניתן לשנות תבנית מובנית")

    t.name        = body.name
    t.category    = body.category
    t.description = body.description

    # Warn if template is already in use — replacing items will orphan existing responses
    usage_count = db.query(models.PatientMeeting).filter(
        models.PatientMeeting.question_template_id == template_id
    ).count()
    if usage_count > 0:
        logger.warning(
            "update_template: template %d (%s) is used by %d meetings — "
            "replacing items will orphan existing question_responses",
            template_id, t.name, usage_count,
        )

    # Replace items entirely
    for old in list(t.items):
        db.delete(old)
    db.flush()
    for i, item in enumerate(body.items):
        db.add(models.QuestionItem(
            template_id=t.id,
            text=item.text,
            question_type=item.question_type,
            order_index=item.order_index if item.order_index is not None else i,
            is_required=item.is_required,
            hint=item.hint,
        ))
    db.commit()
    db.refresh(t)
    return _template_dict(t)


@router.delete("/api/question-templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db),
                    current_user=Depends(auth_utils.require_admin)):
    t = db.query(models.QuestionTemplate).filter(
        models.QuestionTemplate.id == template_id
    ).first()
    if not t:
        raise HTTPException(404, "תבנית לא נמצאה")
    if t.is_builtin:
        raise HTTPException(400, "לא ניתן למחוק תבנית מובנית")
    db.delete(t)
    db.commit()
    return {"ok": True}
