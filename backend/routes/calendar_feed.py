"""
ICS Feed — יומן חי אישי לכל משתמש.

GET /api/calendar/{token}.ics   — feed ציבורי ללא אימות
"""

import json
import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
import models

router = APIRouter()


def _ics_escape(text: str) -> str:
    """RFC 5545 escaping."""
    if not text:
        return ""
    text = text.replace("\\", "\\\\")
    text = text.replace(";", "\\;")
    text = text.replace(",", "\\,")
    text = text.replace("\n", "\\n")
    return text


def _fold(line: str) -> str:
    """RFC 5545: fold lines longer than 75 octets."""
    out = []
    while len(line.encode("utf-8")) > 75:
        out.append(line[:75])
        line = " " + line[75:]
    out.append(line)
    return "\r\n".join(out)


def _dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _date_only(dt) -> str:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    return dt.strftime("%Y%m%d")


def _vevent(uid: str, summary: str, description: str,
            dtstart, dtend=None, all_day=False) -> list:
    lines = [
        "BEGIN:VEVENT",
        _fold(f"UID:{uid}"),
        _fold(f"SUMMARY:{_ics_escape(summary)}"),
    ]
    if description:
        lines.append(_fold(f"DESCRIPTION:{_ics_escape(description)}"))
    if all_day:
        lines.append(f"DTSTART;VALUE=DATE:{_date_only(dtstart)}")
        if dtend:
            lines.append(f"DTEND;VALUE=DATE:{_date_only(dtend)}")
    else:
        lines.append(f"DTSTART:{_dt(dtstart)}")
        if dtend:
            lines.append(f"DTEND:{_dt(dtend)}")
    lines.append("END:VEVENT")
    return lines


def _build_ics(user: models.User, db: Session) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Orly Medical//Calendar Feed//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:Orly Medical — {_ics_escape(user.full_name)}",
        "X-WR-TIMEZONE:Asia/Jerusalem",
    ]

    # משימות פתוחות עם due_date
    tasks = db.query(models.Task).filter(
        models.Task.assigned_to == user.id,
        models.Task.status != "done",
        models.Task.due_date != None,
    ).all()

    for task in tasks:
        patient_name = task.patient.full_name if task.patient else ""
        summary = task.title
        desc = f"מטופל: {patient_name}" if patient_name else ""
        if task.description:
            desc += f"\n{task.description}"
        due = task.due_date
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        dtend = due + timedelta(hours=1)
        lines += _vevent(
            uid=f"task-{task.id}@orly-medical",
            summary=f"✓ {summary}",
            description=desc,
            dtstart=due,
            dtend=dtend,
        )

    # פגישות מטופל — לפי patient_id של המנהל
    patient_ids = [p.id for p in db.query(models.Patient).filter(
        models.Patient.manager_id == user.id
    ).all()]

    if patient_ids:
        meetings = db.query(models.PatientMeeting).filter(
            models.PatientMeeting.patient_id.in_(patient_ids),
        ).all()

        for m in meetings:
            if not m.meeting_date:
                continue
            patient = db.query(models.Patient).filter(
                models.Patient.id == m.patient_id
            ).first()
            patient_name = patient.full_name if patient else ""
            summary = f"{m.meeting_type_label or 'פגישה'} — {patient_name}"
            desc = m.status_summary or ""
            if m.professional_name:
                desc = f"{m.professional_name}\n{desc}"

            try:
                dt = datetime.fromisoformat(str(m.meeting_date))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue

            dtend = dt + timedelta(hours=1)
            lines += _vevent(
                uid=f"meeting-{m.id}@orly-medical",
                summary=summary,
                description=desc,
                dtstart=dt,
                dtend=dtend,
            )

        # שלבים פעילים בזרימות עבודה עם due_date
        instances = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.patient_id.in_(patient_ids),
            models.WorkflowInstance.status == "active",
        ).all()

        for inst in instances:
            steps = db.query(models.WorkflowStep).filter(
                models.WorkflowStep.instance_id == inst.id,
                models.WorkflowStep.status == "active",
                models.WorkflowStep.due_date != None,
            ).all()
            patient = db.query(models.Patient).filter(
                models.Patient.id == inst.patient_id
            ).first()
            patient_name = patient.full_name if patient else ""

            for step in steps:
                due = step.due_date
                if due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)
                summary = f"⏰ {step.name} — {patient_name}"
                lines += _vevent(
                    uid=f"step-{step.id}@orly-medical",
                    summary=summary,
                    description=f"זרימה: {inst.title}",
                    dtstart=due,
                    dtend=due + timedelta(hours=1),
                )

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


# ── Public endpoint ───────────────────────────────────────────────────────────

@router.get("/api/calendar/{token}.ics")
def get_calendar_feed(token: str, db: Session = Depends(get_db)):
    cal_token = db.query(models.CalendarToken).filter(
        models.CalendarToken.token == token
    ).first()
    if not cal_token:
        return Response(status_code=404)

    user = db.query(models.User).filter(
        models.User.id == cal_token.user_id
    ).first()
    if not user:
        return Response(status_code=404)

    ics_content = _build_ics(user, db)
    return Response(
        content=ics_content.encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="orly-medical.ics"',
            "Cache-Control": "no-cache, no-store",
        }
    )
