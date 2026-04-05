"""
Flow Engine — State Machine for Workflow management.
Handles creation, advancement, and lifecycle of WorkflowInstances.
When a step becomes active, automatically computes coverage via coverage_advisor.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
import models


def _now():
    return datetime.now(timezone.utc)


def _log(db: Session, step: models.WorkflowStep, user_id: Optional[int],
         action_type: str, description: str = None, data: dict = None):
    action = models.WorkflowAction(
        step_id=step.id,
        user_id=user_id,
        action_type=action_type,
        description=description,
        data=json.dumps(data) if data else None,
    )
    db.add(action)


def _activate_step(db: Session, step: models.WorkflowStep,
                   instance: models.WorkflowInstance,
                   user_id: Optional[int]):
    """Activate a step and auto-compute its coverage."""
    now = _now()
    step.status = "active"
    step.started_at = now
    instance.current_step_key = step.step_key
    _log(db, step, user_id, "step_started", f"שלב '{step.name}' הופעל")
    db.flush()

    # Auto-compute coverage if patient has insurance sources
    try:
        from coverage_advisor import compute_step_coverage
        patient = db.get(models.Patient, instance.patient_id)
        if patient and patient.insurance_sources:
            compute_step_coverage(db, step, patient)
    except Exception:
        pass  # coverage is advisory — never block the workflow

    # Auto-create draft claim for financial steps on activation
    try:
        _auto_create_draft_claim(db, step, instance)
    except Exception:
        pass


def _sync_journey_node(db: Session, step: models.WorkflowStep,
                       instance: models.WorkflowInstance):
    """
    When a journey step (step_key = "stage_XX") is completed,
    mark the corresponding journey Node as completed.
    """
    if not step.step_key or not step.step_key.startswith("stage_"):
        return
    try:
        stage_order = int(step.step_key.split("_")[1])
    except (IndexError, ValueError):
        return
    node = db.query(models.Node).filter(
        models.Node.patient_id == instance.patient_id,
        models.Node.node_type == "stage",
        models.Node.stage_order == stage_order,
    ).first()
    if node and node.status != "completed":
        node.status = "completed"
        db.flush()


def _auto_create_draft_claim(db: Session, step: models.WorkflowStep,
                              instance: models.WorkflowInstance):
    """
    When a financial step with coverage_categories is activated,
    auto-create a draft Claim using the best-ranked insurance source.
    Skips if no coverage data or no insurance sources.
    """
    if step.step_type != "financial":
        return
    if not step.coverage_categories:
        return
    try:
        cats = json.loads(step.coverage_categories)
    except Exception:
        return
    if not cats:
        return

    # Use the highest-ranked coverage item (priority_rank=1)
    best = db.query(models.WorkflowStepCoverage).filter(
        models.WorkflowStepCoverage.step_id == step.id,
        models.WorkflowStepCoverage.priority_rank == 1,
        models.WorkflowStepCoverage.is_covered == True,
    ).first()

    # Fallback: any active insurance source for this patient
    source_id = best.insurance_source_id if best else None
    if not source_id:
        src = db.query(models.InsuranceSource).filter(
            models.InsuranceSource.patient_id == instance.patient_id,
            models.InsuranceSource.is_active == True,
        ).first()
        source_id = src.id if src else None

    if not source_id:
        return

    # Avoid duplicate draft claims for the same step
    existing = db.query(models.Claim).filter(
        models.Claim.workflow_step_id == step.id,
    ).first()
    if existing:
        return

    claim = models.Claim(
        patient_id=instance.patient_id,
        insurance_source_id=source_id,
        category=cats[0],
        description=f"תביעה אוטומטית — {step.name}",
        amount_requested=step.estimated_cost,
        status="draft",
        workflow_step_id=step.id,
        notes="נוצרה אוטומטית על ידי מנוע הזרימה — ממתינה לאישור מנהל",
    )
    db.add(claim)
    db.flush()


class FlowEngine:

    @staticmethod
    def create_instance(
        db: Session,
        template_id: int,
        patient_id: int,
        created_by: int,
        title: str = None,
        linked_claim_id: int = None,
        linked_node_id: int = None,
    ) -> models.WorkflowInstance:
        """
        Create a new WorkflowInstance from a template.
        Copies all step templates as WorkflowSteps (inheriting coverage fields).
        Activates the first step immediately and computes its coverage.
        """
        template = db.query(models.WorkflowTemplate).filter(
            models.WorkflowTemplate.id == template_id,
            models.WorkflowTemplate.is_active == True,
        ).first()
        if not template:
            raise ValueError(f"Template {template_id} not found or inactive")

        instance = models.WorkflowInstance(
            template_id=template_id,
            patient_id=patient_id,
            created_by=created_by,
            title=title or template.name,
            status="active",
            linked_claim_id=linked_claim_id,
            linked_node_id=linked_node_id,
        )
        db.add(instance)
        db.flush()

        now = _now()
        steps = []
        for st in template.step_templates:
            due = (now + timedelta(days=st.duration_days)) if st.duration_days else None
            step = models.WorkflowStep(
                instance_id=instance.id,
                step_key=st.step_key,
                name=st.name,
                step_order=st.step_order,
                status="pending",
                due_date=due,
                is_optional=st.is_optional,
                instructions=st.instructions,
                # Inherit coverage fields from template
                coverage_categories=st.coverage_categories,
                step_type=st.step_type,
                estimated_cost=st.estimated_cost,
                required_documents=st.required_documents,
            )
            db.add(step)
            steps.append(step)

        db.flush()

        # Activate first step
        if steps:
            _activate_step(db, steps[0], instance, created_by)

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def advance_step(
        db: Session,
        instance_id: int,
        step_id: int,
        user_id: int,
        notes: str = None,
        result_data: dict = None,
    ) -> models.WorkflowInstance:
        """
        Complete current step and activate the next one.
        If no next step — mark instance as completed.
        """
        instance = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.id == instance_id
        ).first()
        if not instance:
            raise ValueError("Instance not found")
        if instance.status != "active":
            raise ValueError(f"Instance is {instance.status}, cannot advance")

        step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.id == step_id,
            models.WorkflowStep.instance_id == instance_id,
        ).first()
        if not step:
            raise ValueError("Step not found")
        if step.status != "active":
            raise ValueError(f"Step is {step.status}, not active")

        now = _now()
        step.status = "completed"
        step.completed_at = now
        if notes:
            step.notes = notes
        if result_data:
            step.result_data = json.dumps(result_data)

        _log(db, step, user_id, "step_completed",
             f"שלב '{step.name}' הושלם",
             {"notes": notes, "result_data": result_data})

        # Sync journey step → Node status
        _sync_journey_node(db, step, instance)

        # Auto-create draft claim for financial steps with coverage categories
        _auto_create_draft_claim(db, step, instance)

        # Find next pending step
        next_step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == instance_id,
            models.WorkflowStep.step_order > step.step_order,
            models.WorkflowStep.status == "pending",
        ).order_by(models.WorkflowStep.step_order).first()

        if next_step:
            _activate_step(db, next_step, instance, user_id)
        else:
            instance.status = "completed"
            instance.completed_at = now
            instance.current_step_key = None
            _log(db, step, user_id, "instance_completed",
                 "כל השלבים הושלמו — זרימה הסתיימה")

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def skip_step(
        db: Session,
        instance_id: int,
        step_id: int,
        user_id: int,
        reason: str = None,
    ) -> models.WorkflowInstance:
        """Skip an optional step and activate the next one."""
        instance = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.id == instance_id
        ).first()
        if not instance or instance.status != "active":
            raise ValueError("Instance not found or not active")

        step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.id == step_id,
            models.WorkflowStep.instance_id == instance_id,
        ).first()
        if not step:
            raise ValueError("Step not found")
        if not step.is_optional:
            raise ValueError("Only optional steps can be skipped")

        now = _now()
        step.status = "skipped"
        step.completed_at = now
        _log(db, step, user_id, "step_skipped",
             f"שלב '{step.name}' דולג", {"reason": reason})

        next_step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == instance_id,
            models.WorkflowStep.step_order > step.step_order,
            models.WorkflowStep.status == "pending",
        ).order_by(models.WorkflowStep.step_order).first()

        if next_step:
            _activate_step(db, next_step, instance, user_id)
        else:
            instance.status = "completed"
            instance.completed_at = now
            instance.current_step_key = None

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def add_step(
        db: Session,
        instance_id: int,
        user_id: int,
        name: str,
        after_step_order: Optional[int] = None,
        instructions: str = None,
        is_optional: bool = False,
        duration_days: int = None,
        coverage_categories: list = None,
        step_type: str = "administrative",
        estimated_cost: float = None,
    ) -> models.WorkflowStep:
        """
        Add an ad-hoc step to a running instance.
        Inserts after after_step_order (or at the end if None).
        Shifts subsequent pending steps to make room.
        """
        instance = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.id == instance_id
        ).first()
        if not instance:
            raise ValueError("Instance not found")
        if instance.status not in ("active", "paused"):
            raise ValueError("Can only add steps to active or paused instances")

        # Determine insertion position
        all_steps = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == instance_id
        ).order_by(models.WorkflowStep.step_order).all()

        if after_step_order is None:
            new_order = (all_steps[-1].step_order + 10) if all_steps else 10
        else:
            # Shift all pending steps after the insertion point
            new_order = after_step_order + 5
            for s in all_steps:
                if s.status == "pending" and s.step_order >= new_order:
                    s.step_order += 10

        now = _now()
        due = (now + timedelta(days=duration_days)) if duration_days else None

        step = models.WorkflowStep(
            instance_id=instance_id,
            step_key=f"adhoc_{int(now.timestamp())}",
            name=name,
            step_order=new_order,
            status="pending",
            is_optional=is_optional,
            instructions=instructions,
            due_date=due,
            coverage_categories=json.dumps(coverage_categories) if coverage_categories else None,
            step_type=step_type,
            estimated_cost=estimated_cost,
        )
        db.add(step)
        db.flush()

        # Log the addition
        _log(db, step, user_id, "step_added",
             f"צעד ידני '{name}' נוסף לזרימה")

        db.commit()
        db.refresh(step)
        return step

    @staticmethod
    def pause_instance(db: Session, instance_id: int, user_id: int,
                       reason: str = None) -> models.WorkflowInstance:
        instance = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.id == instance_id
        ).first()
        if not instance or instance.status != "active":
            raise ValueError("Instance not found or not active")
        instance.status = "paused"
        active_step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == instance_id,
            models.WorkflowStep.status == "active",
        ).first()
        if active_step:
            _log(db, active_step, user_id, "instance_paused",
                 f"זרימה הושהתה. סיבה: {reason or '—'}")
        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def resume_instance(db: Session, instance_id: int,
                        user_id: int) -> models.WorkflowInstance:
        instance = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.id == instance_id
        ).first()
        if not instance or instance.status != "paused":
            raise ValueError("Instance not found or not paused")
        instance.status = "active"
        active_step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == instance_id,
            models.WorkflowStep.status == "active",
        ).first()
        if active_step:
            _log(db, active_step, user_id, "instance_resumed", "זרימה חודשה")
        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def cancel_instance(db: Session, instance_id: int, user_id: int,
                        reason: str = None) -> models.WorkflowInstance:
        instance = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.id == instance_id
        ).first()
        if not instance:
            raise ValueError("Instance not found")
        if instance.status == "completed":
            raise ValueError("Cannot cancel a completed instance")
        instance.status = "cancelled"
        instance.completed_at = _now()
        active_step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.instance_id == instance_id,
            models.WorkflowStep.status == "active",
        ).first()
        if active_step:
            _log(db, active_step, user_id, "instance_cancelled",
                 f"זרימה בוטלה. סיבה: {reason or '—'}")
        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def get_summary(instance: models.WorkflowInstance) -> dict:
        from coverage_advisor import get_step_coverage_summary
        steps = instance.steps
        total = len(steps)
        done = sum(1 for s in steps if s.status in ("completed", "skipped"))
        progress = round((done / total) * 100) if total else 0
        current = next((s for s in steps if s.status == "active"), None)
        return {
            "id":               instance.id,
            "title":            instance.title,
            "status":           instance.status,
            "progress":         progress,
            "total_steps":      total,
            "completed_steps":  done,
            "current_step":     _step_dict(current) if current else None,
            "started_at":       instance.started_at.isoformat() if instance.started_at else None,
            "completed_at":     instance.completed_at.isoformat() if instance.completed_at else None,
            "due_date":         instance.due_date.isoformat() if instance.due_date else None,
            "patient_id":       instance.patient_id,
            "template_id":      instance.template_id,
            "template_name":    instance.template.name if instance.template else None,
            "specialty":        instance.template.specialty if instance.template else None,
            "linked_claim_id":  instance.linked_claim_id,
            "steps":            [_step_dict(s) for s in steps],
        }


def _step_dict(step: models.WorkflowStep) -> dict:
    if not step:
        return None
    from coverage_advisor import get_step_coverage_summary
    coverage = get_step_coverage_summary(step) if step.coverage_items else None
    return {
        "id":                  step.id,
        "step_key":            step.step_key,
        "name":                step.name,
        "step_order":          step.step_order,
        "status":              step.status,
        "is_optional":         step.is_optional,
        "instructions":        step.instructions,
        "notes":               step.notes,
        "step_type":           step.step_type,
        "estimated_cost":      step.estimated_cost,
        "coverage_categories": json.loads(step.coverage_categories) if step.coverage_categories else [],
        "required_documents":  json.loads(step.required_documents) if step.required_documents else [],
        "due_date":            step.due_date.isoformat() if step.due_date else None,
        "started_at":          step.started_at.isoformat() if step.started_at else None,
        "completed_at":        step.completed_at.isoformat() if step.completed_at else None,
        "assignee_id":         step.assignee_id,
        "coverage":            coverage,
        "actions": [
            {
                "id":           a.id,
                "action_type":  a.action_type,
                "description":  a.description,
                "user_id":      a.user_id,
                "created_at":   a.created_at.isoformat() if a.created_at else None,
            }
            for a in (step.actions or [])
        ],
    }
