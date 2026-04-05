from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth as auth_utils
from flow_engine import FlowEngine, _step_dict

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class StepTemplateIn(BaseModel):
    step_key: str
    name: str
    description: Optional[str] = None
    step_order: int
    assignee_role: Optional[str] = "manager"
    duration_days: Optional[int] = None
    is_optional: bool = False
    instructions: Optional[str] = None


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    steps: List[StepTemplateIn] = []


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


class InstanceCreate(BaseModel):
    template_id: int
    patient_id: int
    title: Optional[str] = None
    linked_claim_id: Optional[int] = None
    linked_node_id: Optional[int] = None


class AdvanceStepIn(BaseModel):
    notes: Optional[str] = None
    result_data: Optional[dict] = None


class SkipStepIn(BaseModel):
    reason: Optional[str] = None


class PauseIn(BaseModel):
    reason: Optional[str] = None


class CancelIn(BaseModel):
    reason: Optional[str] = None


class StepUpdate(BaseModel):
    notes: Optional[str] = None
    due_date: Optional[str] = None
    assignee_id: Optional[int] = None


class NoteIn(BaseModel):
    text: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def template_dict(t: models.WorkflowTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "category": t.category,
        "is_active": t.is_active,
        "is_builtin": t.is_builtin,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "steps": [
            {
                "id": s.id,
                "step_key": s.step_key,
                "name": s.name,
                "description": s.description,
                "step_order": s.step_order,
                "assignee_role": s.assignee_role,
                "duration_days": s.duration_days,
                "is_optional": s.is_optional,
                "instructions": s.instructions,
            }
            for s in t.step_templates
        ],
    }


# ── Templates ─────────────────────────────────────────────────────────────────

@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    templates = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.is_active == True
    ).order_by(models.WorkflowTemplate.id).all()
    return [template_dict(t) for t in templates]


@router.post("/templates")
def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    tmpl = models.WorkflowTemplate(
        name=data.name,
        description=data.description,
        category=data.category,
        created_by=current_user.id,
    )
    db.add(tmpl)
    db.flush()
    for s in data.steps:
        db.add(models.WorkflowStepTemplate(template_id=tmpl.id, **s.dict()))
    db.commit()
    db.refresh(tmpl)
    return template_dict(tmpl)


@router.get("/templates/{template_id}")
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    tmpl = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")
    return template_dict(tmpl)


@router.put("/templates/{template_id}")
def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    tmpl = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")
    for field, val in data.dict(exclude_none=True).items():
        setattr(tmpl, field, val)
    db.commit()
    db.refresh(tmpl)
    return template_dict(tmpl)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    tmpl = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")
    if tmpl.is_builtin:
        raise HTTPException(400, "Cannot delete a built-in template")
    has_instances = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.template_id == template_id
    ).first()
    if has_instances:
        raise HTTPException(400, "Cannot delete template with existing instances")
    db.delete(tmpl)
    db.commit()
    return {"message": "deleted"}


# ── Instances ─────────────────────────────────────────────────────────────────

@router.get("/instances")
def list_instances(
    patient_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    q = db.query(models.WorkflowInstance)
    if patient_id:
        q = q.filter(models.WorkflowInstance.patient_id == patient_id)
    if status:
        q = q.filter(models.WorkflowInstance.status == status)
    instances = q.order_by(models.WorkflowInstance.started_at.desc()).all()
    return [FlowEngine.get_summary(i) for i in instances]


@router.post("/instances")
def create_instance(
    data: InstanceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    try:
        instance = FlowEngine.create_instance(
            db=db,
            template_id=data.template_id,
            patient_id=data.patient_id,
            created_by=current_user.id,
            title=data.title,
            linked_claim_id=data.linked_claim_id,
            linked_node_id=data.linked_node_id,
        )
        return FlowEngine.get_summary(instance)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/instances/{instance_id}")
def get_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    instance = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.id == instance_id
    ).first()
    if not instance:
        raise HTTPException(404, "Instance not found")
    return FlowEngine.get_summary(instance)


@router.post("/instances/{instance_id}/pause")
def pause_instance(
    instance_id: int,
    data: PauseIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    try:
        instance = FlowEngine.pause_instance(db, instance_id, current_user.id, data.reason)
        return FlowEngine.get_summary(instance)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/instances/{instance_id}/resume")
def resume_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    try:
        instance = FlowEngine.resume_instance(db, instance_id, current_user.id)
        return FlowEngine.get_summary(instance)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/instances/{instance_id}")
def delete_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    instance = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.id == instance_id
    ).first()
    if not instance:
        raise HTTPException(404, "Instance not found")
    db.delete(instance)
    db.commit()
    return {"ok": True}


@router.post("/instances/{instance_id}/cancel")
def cancel_instance(
    instance_id: int,
    data: CancelIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    try:
        instance = FlowEngine.cancel_instance(db, instance_id, current_user.id, data.reason)
        return FlowEngine.get_summary(instance)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Steps ─────────────────────────────────────────────────────────────────────

@router.post("/instances/{instance_id}/steps/{step_id}/advance")
def advance_step(
    instance_id: int,
    step_id: int,
    data: AdvanceStepIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    try:
        instance = FlowEngine.advance_step(
            db, instance_id, step_id, current_user.id,
            notes=data.notes, result_data=data.result_data,
        )
        return FlowEngine.get_summary(instance)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/instances/{instance_id}/steps/{step_id}/skip")
def skip_step(
    instance_id: int,
    step_id: int,
    data: SkipStepIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    try:
        instance = FlowEngine.skip_step(
            db, instance_id, step_id, current_user.id, reason=data.reason
        )
        return FlowEngine.get_summary(instance)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/instances/{instance_id}/steps/{step_id}")
def update_step(
    instance_id: int,
    step_id: int,
    data: StepUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    step = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.id == step_id,
        models.WorkflowStep.instance_id == instance_id,
    ).first()
    if not step:
        raise HTTPException(404, "Step not found")
    if data.notes is not None:
        step.notes = data.notes
    if data.assignee_id is not None:
        step.assignee_id = data.assignee_id
    if data.due_date is not None:
        from datetime import datetime
        step.due_date = datetime.fromisoformat(data.due_date)
    db.commit()
    return _step_dict(step)


@router.post("/instances/{instance_id}/steps/{step_id}/notes")
def add_note(
    instance_id: int,
    step_id: int,
    data: NoteIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    step = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.id == step_id,
        models.WorkflowStep.instance_id == instance_id,
    ).first()
    if not step:
        raise HTTPException(404, "Step not found")
    action = models.WorkflowAction(
        step_id=step.id,
        user_id=current_user.id,
        action_type="note_added",
        description=data.text,
    )
    db.add(action)
    db.commit()
    return {"message": "note added"}
