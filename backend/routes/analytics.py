"""Analytics — Workflow Funnel ונתוני שימוש."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from database import get_db
import auth as auth_utils

router = APIRouter()


@router.get("/api/analytics/workflow-funnel")
def workflow_funnel(db: Session = Depends(get_db),
                    current_user=Depends(auth_utils.require_admin)):
    # סיכום כלל instances לפי status
    status_rows = (
        db.query(models.WorkflowInstance.status, func.count().label("cnt"))
        .group_by(models.WorkflowInstance.status)
        .all()
    )
    by_status = {r.status: r.cnt for r in status_rows}

    # התפלגות לפי תבנית — top 8
    template_rows = (
        db.query(
            models.WorkflowTemplate.id,
            models.WorkflowTemplate.name,
            func.count(models.WorkflowInstance.id).label("total"),
        )
        .join(models.WorkflowInstance,
              models.WorkflowInstance.template_id == models.WorkflowTemplate.id,
              isouter=True)
        .group_by(models.WorkflowTemplate.id, models.WorkflowTemplate.name)
        .order_by(func.count(models.WorkflowInstance.id).desc())
        .limit(8)
        .all()
    )

    templates = []
    for row in template_rows:
        # step distribution for this template
        step_rows = (
            db.query(
                models.WorkflowStep.step_order,
                models.WorkflowStep.status,
                func.count().label("cnt"),
            )
            .join(models.WorkflowInstance,
                  models.WorkflowInstance.id == models.WorkflowStep.instance_id)
            .filter(models.WorkflowInstance.template_id == row.id)
            .group_by(models.WorkflowStep.step_order, models.WorkflowStep.status)
            .all()
        )

        # Aggregate by step_order
        step_map: dict = {}
        for sr in step_rows:
            entry = step_map.setdefault(sr.step_order, {
                "step_order": sr.step_order,
                "pending": 0, "active": 0, "completed": 0, "skipped": 0,
            })
            if sr.status in entry:
                entry[sr.status] = sr.cnt

        templates.append({
            "template_id":   row.id,
            "template_name": row.name,
            "total":         row.total or 0,
            "steps":         sorted(step_map.values(), key=lambda x: x["step_order"]),
        })

    total_patients_in_workflow = (
        db.query(func.count(func.distinct(models.WorkflowInstance.patient_id)))
        .filter(models.WorkflowInstance.status == "active")
        .scalar() or 0
    )

    return {
        "summary": {
            "total_patients_in_workflow": total_patients_in_workflow,
            "by_status": by_status,
        },
        "templates": templates,
    }
