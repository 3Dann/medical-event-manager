from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth as auth_utils
from flow_engine import FlowEngine, _step_dict
from coverage_advisor import compute_step_coverage, get_step_coverage_summary

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class StepTemplateIn(BaseModel):
    step_key: str
    name: str
    description: Optional[str] = None
    step_order: int
    assignee_role: Optional[str] = "manager"
    duration_days: Optional[int] = None
    is_optional: bool = False
    instructions: Optional[str] = None
    coverage_categories: Optional[List[str]] = None
    step_type: Optional[str] = "administrative"
    estimated_cost: Optional[float] = None
    required_documents: Optional[List[str]] = None


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    condition_tags: Optional[List[str]] = None
    trigger_event: Optional[str] = None
    specialty: Optional[str] = None
    steps: List[StepTemplateIn] = []


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    condition_tags: Optional[List[str]] = None
    trigger_event: Optional[str] = None
    specialty: Optional[str] = None
    is_active: Optional[bool] = None
    steps: Optional[List[StepTemplateIn]] = None


class InstanceCreate(BaseModel):
    template_id: int
    patient_id: int
    title: Optional[str] = None
    linked_claim_id: Optional[int] = None
    linked_node_id: Optional[int] = None


class AdvanceStepIn(BaseModel):
    notes: Optional[str] = None
    result_data: Optional[dict] = None
    force: bool = False


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
    estimated_cost: Optional[float] = None


class NoteIn(BaseModel):
    text: str


class AddStepIn(BaseModel):
    name: str
    after_step_order: Optional[int] = None
    instructions: Optional[str] = None
    is_optional: bool = False
    duration_days: Optional[int] = None
    coverage_categories: Optional[List[str]] = None
    step_type: Optional[str] = "administrative"
    estimated_cost: Optional[float] = None


class ConflictResolution(BaseModel):
    template_id: int
    action: str  # create_anyway | skip | merge


class ApplySuggestionsIn(BaseModel):
    patient_id: int
    auto_create_ids: Optional[List[int]] = None
    conflict_resolutions: Optional[List[ConflictResolution]] = None


class ConditionTagCreate(BaseModel):
    key: str
    label_he: str
    category: str
    category_he: str


# ── Helpers ────────────────────────────────────────────────────────────────────

import json

def template_dict(t: models.WorkflowTemplate) -> dict:
    return {
        "id":             t.id,
        "name":           t.name,
        "description":    t.description,
        "category":       t.category,
        "condition_tags": json.loads(t.condition_tags) if t.condition_tags else [],
        "trigger_event":  t.trigger_event,
        "specialty":      t.specialty,
        "is_active":      t.is_active,
        "is_builtin":     t.is_builtin,
        "created_at":     t.created_at.isoformat() if t.created_at else None,
        "steps": [
            {
                "id":                  s.id,
                "step_key":            s.step_key,
                "name":                s.name,
                "description":         s.description,
                "step_order":          s.step_order,
                "assignee_role":       s.assignee_role,
                "duration_days":       s.duration_days,
                "is_optional":         s.is_optional,
                "instructions":        s.instructions,
                "coverage_categories": json.loads(s.coverage_categories) if s.coverage_categories else [],
                "step_type":           s.step_type,
                "estimated_cost":      s.estimated_cost,
                "required_documents":  json.loads(s.required_documents) if s.required_documents else [],
            }
            for s in t.step_templates
        ],
    }


# ── Condition Tags ─────────────────────────────────────────────────────────────

@router.get("/condition-tags")
def list_condition_tags(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    q = db.query(models.MedicalConditionTag).filter(
        models.MedicalConditionTag.is_active == True
    )
    if category:
        q = q.filter(models.MedicalConditionTag.category == category)
    tags = q.order_by(models.MedicalConditionTag.category,
                      models.MedicalConditionTag.label_he).all()

    # Group by category
    grouped: dict = {}
    for tag in tags:
        cat = tag.category or "general"
        if cat not in grouped:
            grouped[cat] = {"category": cat, "category_he": tag.category_he or cat, "tags": []}
        grouped[cat]["tags"].append({
            "id":          tag.id,
            "key":         tag.key,
            "label_he":    tag.label_he,
            "is_builtin":  tag.is_builtin,
        })
    return list(grouped.values())


@router.post("/condition-tags")
def create_condition_tag(
    data: ConditionTagCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    existing = db.query(models.MedicalConditionTag).filter(
        models.MedicalConditionTag.key == data.key
    ).first()
    if existing:
        raise HTTPException(400, "תגית עם מפתח זה כבר קיימת")
    tag = models.MedicalConditionTag(
        key=data.key,
        label_he=data.label_he,
        category=data.category,
        category_he=data.category_he,
        is_builtin=False,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return {"id": tag.id, "key": tag.key, "label_he": tag.label_he}


@router.delete("/condition-tags/{tag_id}")
def delete_condition_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    tag = db.query(models.MedicalConditionTag).filter(
        models.MedicalConditionTag.id == tag_id
    ).first()
    if not tag:
        raise HTTPException(404, "תגית לא נמצאה")
    if tag.is_builtin:
        raise HTTPException(400, "לא ניתן למחוק תגית מובנית")
    tag.is_active = False
    db.commit()
    return {"ok": True}


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/templates")
def list_templates(
    specialty: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    q = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.is_active == True
    )
    if specialty:
        q = q.filter(models.WorkflowTemplate.specialty == specialty)
    if category:
        q = q.filter(models.WorkflowTemplate.category == category)
    templates = q.order_by(models.WorkflowTemplate.id).all()
    return [template_dict(t) for t in templates]


@router.post("/templates")
def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
):
    tmpl = models.WorkflowTemplate(
        name=data.name,
        description=data.description,
        category=data.category,
        condition_tags=json.dumps(data.condition_tags or []),
        trigger_event=data.trigger_event,
        specialty=data.specialty,
        created_by=current_user.id,
    )
    db.add(tmpl)
    db.flush()
    for s in data.steps:
        db.add(models.WorkflowStepTemplate(
            template_id=tmpl.id,
            step_key=s.step_key,
            name=s.name,
            description=s.description,
            step_order=s.step_order,
            assignee_role=s.assignee_role,
            duration_days=s.duration_days,
            is_optional=s.is_optional,
            instructions=s.instructions,
            coverage_categories=json.dumps(s.coverage_categories) if s.coverage_categories else None,
            step_type=s.step_type,
            estimated_cost=s.estimated_cost,
            required_documents=json.dumps(s.required_documents) if s.required_documents else None,
        ))
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
    current_user: models.User = Depends(auth_utils.require_admin),
):
    tmpl = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    # Auto-backup builtin templates before first edit
    if tmpl.is_builtin:
        from datetime import date
        backup_name = f"[גיבוי] {tmpl.name} — {date.today()}"
        existing_backup = db.query(models.WorkflowTemplate).filter(
            models.WorkflowTemplate.name == backup_name
        ).first()
        if not existing_backup:
            backup = models.WorkflowTemplate(
                name=backup_name,
                description=tmpl.description,
                category=tmpl.category,
                condition_tags=tmpl.condition_tags,
                trigger_event=tmpl.trigger_event,
                specialty=tmpl.specialty,
                is_builtin=False,
                is_active=False,
                created_by=current_user.id,
            )
            db.add(backup)
            db.flush()
            for s in tmpl.step_templates:
                db.add(models.WorkflowStepTemplate(
                    template_id=backup.id,
                    step_key=s.step_key,
                    name=s.name,
                    description=s.description,
                    step_order=s.step_order,
                    assignee_role=s.assignee_role,
                    duration_days=s.duration_days,
                    is_optional=s.is_optional,
                    instructions=s.instructions,
                    coverage_categories=s.coverage_categories,
                    step_type=s.step_type,
                    estimated_cost=s.estimated_cost,
                    required_documents=s.required_documents,
                ))

    update = data.model_dump(exclude_none=True)
    steps_data = update.pop("steps", None)
    if "condition_tags" in update:
        update["condition_tags"] = json.dumps(update["condition_tags"])
    for field, val in update.items():
        setattr(tmpl, field, val)

    # Replace steps if provided
    if steps_data is not None:
        db.query(models.WorkflowStepTemplate).filter(
            models.WorkflowStepTemplate.template_id == tmpl.id
        ).delete()
        for s in steps_data:
            db.add(models.WorkflowStepTemplate(
                template_id=tmpl.id,
                step_key=s["step_key"],
                name=s["name"],
                description=s.get("description"),
                step_order=s["step_order"],
                assignee_role=s.get("assignee_role", "manager"),
                duration_days=s.get("duration_days"),
                is_optional=s.get("is_optional", False),
                instructions=s.get("instructions"),
                coverage_categories=json.dumps(s["coverage_categories"]) if s.get("coverage_categories") else None,
                step_type=s.get("step_type", "administrative"),
                estimated_cost=s.get("estimated_cost"),
                required_documents=json.dumps(s["required_documents"]) if s.get("required_documents") else None,
            ))

    db.commit()
    db.refresh(tmpl)
    return template_dict(tmpl)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_admin),
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


# ── Suggest ────────────────────────────────────────────────────────────────────

@router.get("/suggest")
def suggest(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    """Return ranked workflow suggestions for a patient."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    from workflow_suggest import suggest_templates
    return suggest_templates(db, patient)


@router.post("/suggest/apply")
def apply_suggest(
    data: ApplySuggestionsIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    """Auto-create workflows + handle conflict resolutions."""
    patient = db.query(models.Patient).filter(models.Patient.id == data.patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    from workflow_suggest import apply_suggestions
    resolutions = [r.dict() for r in (data.conflict_resolutions or [])]
    return apply_suggestions(
        db=db,
        patient=patient,
        created_by=current_user.id,
        auto_create_ids=data.auto_create_ids,
        conflict_resolutions=resolutions,
    )


# ── Instances ──────────────────────────────────────────────────────────────────

@router.get("/instances")
def list_instances(
    patient_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    q = db.query(models.WorkflowInstance).join(
        models.Patient, models.WorkflowInstance.patient_id == models.Patient.id
    )
    if patient_id:
        q = q.filter(models.WorkflowInstance.patient_id == patient_id)
    if status:
        q = q.filter(models.WorkflowInstance.status == status)
    # Scope by role
    if current_user.role == models.UserRole.patient:
        q = q.filter(models.Patient.patient_user_id == current_user.id)
    elif not current_user.is_admin:
        q = q.filter(models.Patient.manager_id == current_user.id)
    instances = q.order_by(models.WorkflowInstance.started_at.desc()).all()

    result = []
    for i in instances:
        summary = FlowEngine.get_summary(i)
        patient = db.get(models.Patient, i.patient_id)
        summary["patient_name"] = patient.full_name if patient else None
        summary["diagnosis"] = patient.diagnosis_details if patient else None
        result.append(summary)
    return result


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


@router.get("/instances/{instance_id}/coverage-summary")
def instance_coverage_summary(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Coverage overview for all steps in an instance."""
    instance = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.id == instance_id
    ).first()
    if not instance:
        raise HTTPException(404, "Instance not found")

    total_estimated = 0.0
    total_covered = 0.0
    steps_summary = []

    for step in instance.steps:
        cov = get_step_coverage_summary(step)
        est = cov.get("estimated_cost") or 0
        covered = 0.0
        if cov.get("items"):
            best = next((i for i in cov["items"] if i["is_covered"]), None)
            if best and best.get("covered_amount"):
                covered = best["covered_amount"]
        total_estimated += est
        total_covered += covered
        steps_summary.append({
            "step_id":      step.id,
            "step_name":    step.name,
            "status":       step.status,
            "coverage":     cov,
        })

    return {
        "instance_id":     instance_id,
        "total_estimated": total_estimated,
        "total_covered":   total_covered,
        "total_gap":       max(0.0, total_estimated - total_covered),
        "steps":           steps_summary,
    }


# ── Steps ──────────────────────────────────────────────────────────────────────

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
            notes=data.notes, result_data=data.result_data, force=data.force,
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


@router.post("/instances/{instance_id}/steps")
def add_step(
    instance_id: int,
    data: AddStepIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    """Add an ad-hoc step to a running instance."""
    try:
        step = FlowEngine.add_step(
            db=db,
            instance_id=instance_id,
            user_id=current_user.id,
            name=data.name,
            after_step_order=data.after_step_order,
            instructions=data.instructions,
            is_optional=data.is_optional,
            duration_days=data.duration_days,
            coverage_categories=data.coverage_categories,
            step_type=data.step_type,
            estimated_cost=data.estimated_cost,
        )
        return _step_dict(step)
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
    if data.estimated_cost is not None:
        step.estimated_cost = data.estimated_cost
    db.commit()
    return _step_dict(step)


@router.get("/instances/{instance_id}/steps/{step_id}/coverage")
def get_step_coverage(
    instance_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    step = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.id == step_id,
        models.WorkflowStep.instance_id == instance_id,
    ).first()
    if not step:
        raise HTTPException(404, "Step not found")
    return get_step_coverage_summary(step)


@router.post("/instances/{instance_id}/steps/{step_id}/coverage/recompute")
def recompute_step_coverage(
    instance_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    """Force-recompute coverage (e.g. after insurance was updated)."""
    step = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.id == step_id,
        models.WorkflowStep.instance_id == instance_id,
    ).first()
    if not step:
        raise HTTPException(404, "Step not found")
    instance = step.instance
    patient = db.get(models.Patient, instance.patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    results = compute_step_coverage(db, step, patient)
    db.commit()
    return {"recomputed": len(results), "items": results}


@router.post("/instances/{instance_id}/steps/{step_id}/tasks/{task_id}/toggle")
def toggle_task(
    instance_id: int,
    step_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    """Toggle a step task as completed / uncompleted."""
    step = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.id == step_id,
        models.WorkflowStep.instance_id == instance_id,
    ).first()
    if not step:
        raise HTTPException(404, "Step not found")

    task = db.query(models.WorkflowStepTask).filter(
        models.WorkflowStepTask.id == task_id,
        models.WorkflowStepTask.step_id == step_id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")

    from datetime import datetime, timezone
    if task.is_completed:
        task.is_completed = False
        task.completed_at = None
        task.completed_by = None
    else:
        task.is_completed = True
        task.completed_at = datetime.now(timezone.utc)
        task.completed_by = current_user.id

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
