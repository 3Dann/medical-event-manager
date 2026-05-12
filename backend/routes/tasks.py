"""
ניהול משימות חוצה-תיקים — "היום שלי"

GET  /api/tasks/my                  — משימות המנהל הנוכחי (sync אוטומטי)
POST /api/tasks                     — יצירת משימה ידנית
PUT  /api/tasks/{id}                — עדכון משימה
POST /api/tasks/{id}/complete       — השלמה + קריאה חוזרת למקור
DELETE /api/tasks/{id}             — מחיקת משימה ידנית בלבד
GET  /api/admin/tasks               — כל המשימות עם פילטרים (admin)
POST /api/admin/tasks               — יצירה ושיוך למנהל (admin)
GET  /api/tasks/calendar-token      — get/create ICS token
"""

import json
import secrets
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from auth import get_current_user

router = APIRouter()

PRIORITY_ORDER = {"urgent": 0, "high": 1, "normal": 2, "low": 3}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    patient_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: str = "normal"
    assigned_to: Optional[int] = None  # אדמין בלבד

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None


# ── Sync helpers ──────────────────────────────────────────────────────────────

def _sync_tasks_for_manager(manager_user_id: int, db: Session):
    """סנכרון אוטומטי של משימות ממקורות קיימים — batch loading, no N+1."""
    from sqlalchemy import or_

    # ── Batch-load all patients ───────────────────────────────────────────────
    granted_ids = [
        g.patient_id for g in db.query(models.PatientPermission.patient_id).filter(
            models.PatientPermission.manager_id == manager_user_id
        ).all()
    ]
    all_patients = db.query(models.Patient).filter(
        or_(
            models.Patient.manager_id == manager_user_id,
            models.Patient.id.in_(granted_ids) if granted_ids else False,
        )
    ).all()
    if not all_patients:
        return

    pid_map = {p.id: p for p in all_patients}
    pids = list(pid_map.keys())

    # ── Batch-load all related data in 5 queries total ────────────────────────
    meetings   = db.query(models.PatientMeeting).filter(
        models.PatientMeeting.patient_id.in_(pids)).all()
    instances  = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.patient_id.in_(pids),
        models.WorkflowInstance.status == "active").all()
    inst_ids   = [i.id for i in instances]
    steps      = db.query(models.WorkflowStep).filter(
        models.WorkflowStep.instance_id.in_(inst_ids),
        models.WorkflowStep.status == "active").all() if inst_ids else []
    requests   = db.query(models.PatientRequest).filter(
        models.PatientRequest.patient_id.in_(pids),
        models.PatientRequest.status == "pending").all()
    red_flags  = db.query(models.PatientRedFlag).filter(
        models.PatientRedFlag.patient_id.in_(pids),
        models.PatientRedFlag.is_active == True).all()

    inst_map = {i.id: i for i in instances}

    for meeting in meetings:
        patient = pid_map.get(meeting.patient_id)
        if patient:
            _sync_meeting_actions(manager_user_id, patient, db, meeting=meeting)
    for step in steps:
        inst    = inst_map.get(step.instance_id)
        patient = pid_map.get(inst.patient_id) if inst else None
        if patient and inst:
            _sync_workflow_steps(manager_user_id, patient, db, instance=inst, step=step)
    for req in requests:
        patient = pid_map.get(req.patient_id)
        if patient:
            _sync_patient_requests(manager_user_id, patient, db, request=req)
    for flag in red_flags:
        patient = pid_map.get(flag.patient_id)
        if patient:
            _sync_red_flags(manager_user_id, patient, db, flag=flag)


def _upsert_task(manager_id: int, patient: models.Patient,
                 source_type: str, source_id: int,
                 title: str, due_date, priority: str,
                 meta: dict, db: Session):
    """יצירת משימה אם לא קיימת, עדכון כותרת אם קיימת (ולא הושלמה)."""
    existing = db.query(models.Task).filter(
        models.Task.assigned_to == manager_id,
        models.Task.source_type == source_type,
        models.Task.source_id  == source_id,
    ).first()

    if existing:
        if existing.status != "done":
            existing.title    = title
            existing.due_date = due_date
        return

    task = models.Task(
        title       = title,
        assigned_to = manager_id,
        created_by  = manager_id,
        patient_id  = patient.id,
        source_type = source_type,
        source_id   = source_id,
        source_meta = json.dumps(meta, ensure_ascii=False),
        due_date    = due_date,
        priority    = priority,
        status      = "pending",
    )
    db.add(task)


def _sync_meeting_actions(manager_id: int, patient: models.Patient, db: Session, meeting=None):
    try:
        items = json.loads(meeting.action_items) if meeting.action_items else []
    except Exception:
        items = []
    for i, item in enumerate(items):
        if item.get("done"):
            continue
        title = f"{item.get('task', '')} — {patient.full_name}"
        due = None
        if meeting.meeting_date:
            try:
                due = datetime.fromisoformat(str(meeting.meeting_date)).replace(tzinfo=timezone.utc)
            except Exception:
                pass
        _upsert_task(manager_id, patient, "meeting_action",
                     meeting.id * 1000 + i, title, due, "normal",
                     {"meeting_id": meeting.id, "item_index": i,
                      "meeting_date": str(meeting.meeting_date)}, db)


def _sync_workflow_steps(manager_id: int, patient: models.Patient, db: Session,
                         instance=None, step=None):
    title = f"{step.name} — {instance.title} — {patient.full_name}"
    due = None
    if step.due_date:
        due = step.due_date.replace(tzinfo=timezone.utc) if step.due_date.tzinfo is None else step.due_date
    _upsert_task(manager_id, patient, "workflow_step",
                 step.id, title, due, "normal",
                 {"instance_id": instance.id, "step_name": step.name}, db)


def _sync_patient_requests(manager_id: int, patient: models.Patient, db: Session, request=None):
    title = f"פנייה ממתינה: {request.category} — {patient.full_name}"
    _upsert_task(manager_id, patient, "patient_request",
                 request.id, title, None, "high",
                 {"category": request.category, "message": request.message[:80]}, db)


def _sync_red_flags(manager_id: int, patient: models.Patient, db: Session, flag=None):
    title = f"🔴 {flag.title} — {patient.full_name}"
    priority = "urgent" if flag.severity == "critical" else "high"
    _upsert_task(manager_id, patient, "red_flag",
                 flag.id, title, None, priority,
                 {"flag_type": flag.flag_type, "severity": flag.severity}, db)


def _task_dict(task: models.Task) -> dict:
    patient_name = task.patient.full_name if task.patient else None
    return {
        "id":           task.id,
        "title":        task.title,
        "description":  task.description,
        "patient_id":   task.patient_id,
        "patient_name": patient_name,
        "source_type":  task.source_type,
        "source_id":    task.source_id,
        "source_meta":  json.loads(task.source_meta) if task.source_meta else {},
        "due_date":     task.due_date.isoformat() if task.due_date else None,
        "priority":     task.priority,
        "status":       task.status,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "is_new":       task.is_new,
        "created_at":   task.created_at.isoformat() if task.created_at else None,
        "assigned_to":  task.assigned_to,
    }


# ── Endpoints — מנהל ─────────────────────────────────────────────────────────

@router.get("/api/tasks/my")
def get_my_tasks(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != models.UserRole.manager:
        raise HTTPException(403, "נגיש למנהלי אירוע בלבד")

    _sync_tasks_for_manager(current_user.id, db)
    db.commit()

    # סימון is_new=False לכל המשימות החדשות שנצפו
    db.query(models.Task).filter(
        models.Task.assigned_to == current_user.id,
        models.Task.is_new == True,
    ).update({"is_new": False})
    db.commit()

    tasks = db.query(models.Task).filter(
        models.Task.assigned_to == current_user.id,
    ).order_by(models.Task.created_at.desc()).all()

    return [_task_dict(t) for t in tasks]


@router.get("/api/tasks/new-count")
def get_new_tasks_count(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """badge — כמה משימות חדשות מאדמין."""
    if current_user.role != models.UserRole.manager:
        return {"count": 0}
    count = db.query(models.Task).filter(
        models.Task.assigned_to == current_user.id,
        models.Task.is_new == True,
    ).count()
    return {"count": count}


@router.post("/api/tasks")
def create_task(
    body: TaskCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == models.UserRole.patient:
        raise HTTPException(403, "אין הרשאה")

    # מנהל יוצר רק לעצמו; אדמין יכול לשייך לכל מנהל
    assigned = current_user.id
    if current_user.is_admin and body.assigned_to:
        assigned = body.assigned_to

    task = models.Task(
        title       = body.title.strip(),
        description = body.description,
        assigned_to = assigned,
        created_by  = current_user.id,
        patient_id  = body.patient_id,
        source_type = "manual",
        due_date    = body.due_date,
        priority    = body.priority,
        is_new      = (current_user.is_admin and assigned != current_user.id),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_dict(task)


@router.put("/api/tasks/{task_id}")
def update_task(
    task_id: int,
    body: TaskUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "משימה לא נמצאה")

    # מנהל יכול לעדכן רק משימות שלו; אדמין — הכל
    if not current_user.is_admin and task.assigned_to != current_user.id:
        raise HTTPException(403, "אין הרשאה")

    # מנהל לא יכול לשנות due_date/priority במשימות מסונכרנות
    is_synced = task.source_type != "manual"
    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.status is not None:
        task.status = body.status
    if body.due_date is not None and (current_user.is_admin or not is_synced):
        task.due_date = body.due_date
    if body.priority is not None and (current_user.is_admin or not is_synced):
        task.priority = body.priority

    db.commit()
    return _task_dict(task)


@router.post("/api/tasks/{task_id}/complete")
def complete_task(
    task_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "משימה לא נמצאה")
    if not current_user.is_admin and task.assigned_to != current_user.id:
        raise HTTPException(403, "אין הרשאה")

    task.status       = "done"
    task.completed_at = datetime.now(timezone.utc)

    # קריאה חוזרת למקור
    _complete_source(task, db)
    db.commit()
    return _task_dict(task)


def _complete_source(task: models.Task, db: Session):
    if task.source_type == "meeting_action" and task.source_meta:
        try:
            meta    = json.loads(task.source_meta)
            meeting = db.query(models.PatientMeeting).filter(
                models.PatientMeeting.id == meta["meeting_id"]
            ).first()
            if meeting and meeting.action_items:
                items = json.loads(meeting.action_items)
                idx   = meta.get("item_index", 0)
                if 0 <= idx < len(items):
                    items[idx]["done"] = True
                    meeting.action_items = json.dumps(items, ensure_ascii=False)
        except Exception:
            pass

    elif task.source_type == "workflow_step":
        step = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.id == task.source_id
        ).first()
        if step and step.status == "active":
            step.status = "completed"

    elif task.source_type == "patient_request":
        req = db.query(models.PatientRequest).filter(
            models.PatientRequest.id == task.source_id
        ).first()
        if req:
            req.status      = "resolved"
            req.resolved_at = datetime.now(timezone.utc)

    elif task.source_type == "red_flag":
        flag = db.query(models.PatientRedFlag).filter(
            models.PatientRedFlag.id == task.source_id
        ).first()
        if flag:
            flag.is_active = False


@router.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "משימה לא נמצאה")
    if task.source_type != "manual":
        raise HTTPException(400, "ניתן למחוק משימות ידניות בלבד")
    if not current_user.is_admin and task.assigned_to != current_user.id:
        raise HTTPException(403, "אין הרשאה")
    db.delete(task)
    db.commit()
    return {"ok": True}


# ── Endpoints — אדמין ────────────────────────────────────────────────────────

@router.get("/api/admin/tasks")
def admin_get_tasks(
    manager_id: Optional[int] = Query(None),
    patient_id: Optional[int] = Query(None),
    source_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(403, "נגיש לאדמין בלבד")

    q = db.query(models.Task)
    if manager_id:
        q = q.filter(models.Task.assigned_to == manager_id)
    if patient_id:
        q = q.filter(models.Task.patient_id == patient_id)
    if source_type:
        q = q.filter(models.Task.source_type == source_type)
    if priority:
        q = q.filter(models.Task.priority == priority)
    if status:
        q = q.filter(models.Task.status == status)
    if overdue_only:
        now = datetime.now(timezone.utc)
        q = q.filter(
            models.Task.due_date < now,
            models.Task.status != "done",
        )

    tasks = q.order_by(models.Task.due_date.asc().nullslast(),
                       models.Task.created_at.desc()).all()

    result = []
    for t in tasks:
        d = _task_dict(t)
        d["assigned_name"] = t.assigned_user.full_name if t.assigned_user else None
        result.append(d)
    return result


# ── Calendar token ────────────────────────────────────────────────────────────

@router.get("/api/tasks/calendar-token")
def get_calendar_token(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(models.CalendarToken).filter(
        models.CalendarToken.user_id == current_user.id
    ).first()
    if not row:
        row = models.CalendarToken(
            user_id=current_user.id,
            token=secrets.token_urlsafe(32),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return {"token": row.token}
