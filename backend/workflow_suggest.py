"""
Workflow Suggestion Engine — מנוע הצעות זרימה אוטומטי.

Logic:
  1. Loads all active templates.
  2. Scores each template against the patient's condition_tags + medical_stage
     + existing claims state.
  3. Identifies conflicts (template already has an active/paused instance).
  4. Auto-creates non-conflicting top suggestions.
  5. Returns conflicts for manager resolution.
"""

import json
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
import models
from flow_engine import FlowEngine

# Minimum score to be included in suggestions
MIN_SCORE = 10

# Stage → trigger_event affinity map
STAGE_TRIGGER_AFFINITY = {
    "pre_diagnosis":      ["diagnosis", "general"],
    "active_treatment":   ["treatment", "surgery", "hospitalization", "general"],
    "recovery":           ["treatment", "hospitalization", "general"],
    "monitoring":         ["general", "treatment"],
}


def _patient_tags(patient: models.Patient) -> set:
    try:
        return set(json.loads(patient.condition_tags or "[]"))
    except Exception:
        return set()


def _template_tags(tmpl: models.WorkflowTemplate) -> set:
    try:
        return set(json.loads(tmpl.condition_tags or "[]"))
    except Exception:
        return set()


def _active_template_ids(db: Session, patient_id: int) -> set:
    rows = db.query(models.WorkflowInstance.template_id).filter(
        models.WorkflowInstance.patient_id == patient_id,
        models.WorkflowInstance.status.in_(["active", "paused"]),
    ).all()
    return {r[0] for r in rows}


def score_template(
    tmpl: models.WorkflowTemplate,
    patient: models.Patient,
    db: Session,
) -> tuple[int, list[str]]:
    """
    Returns (score, reasons_list).
    Higher score = better match.
    """
    score = 0
    reasons = []

    patient_tags = _patient_tags(patient)
    tmpl_tags = _template_tags(tmpl)
    stage = patient.medical_stage or "pre_diagnosis"

    # ── Tag overlap ───────────────────────────────────────────────────────────
    overlap = patient_tags & tmpl_tags
    if overlap:
        score += len(overlap) * 25
        reasons.append(f"מתאים לאבחנה: {', '.join(overlap)}")

    # ── Stage / trigger affinity ──────────────────────────────────────────────
    affine_triggers = STAGE_TRIGGER_AFFINITY.get(stage, ["general"])
    if tmpl.trigger_event in affine_triggers:
        score += 20
        reasons.append(f"מתאים לשלב הטיפול הנוכחי")

    # ── Claim-based boosts ────────────────────────────────────────────────────
    if tmpl.category == "appeal":
        rejected = db.query(models.Claim).filter(
            models.Claim.patient_id == patient.id,
            models.Claim.status == "rejected",
        ).count()
        if rejected:
            score += 40
            reasons.append(f"{rejected} תביעות דחויות — ערר מומלץ")

    if tmpl.category == "claim":
        pending = db.query(models.Claim).filter(
            models.Claim.patient_id == patient.id,
            models.Claim.status == "pending",
        ).count()
        if pending:
            score += 15
            reasons.append(f"{pending} תביעות ממתינות")

    # ── General templates always get a base score ─────────────────────────────
    if not tmpl_tags and tmpl.trigger_event in ("general", None):
        score += 5

    return score, reasons


def suggest_templates(
    db: Session,
    patient: models.Patient,
    limit: int = 10,
) -> dict:
    """
    Returns:
      {
        "auto_create":  [SuggestionItem],   # no conflict → will be auto-created
        "conflicts":    [ConflictItem],      # already active → manager must choose
        "skipped":      [SuggestionItem],   # low score
      }

    SuggestionItem = {template_id, name, category, score, reasons}
    ConflictItem   = {template_id, name, instance_id, instance_status, score, reasons,
                      options: ["create_anyway", "skip", "merge"]}
    """
    templates = db.query(models.WorkflowTemplate).filter(
        models.WorkflowTemplate.is_active == True
    ).all()

    active_ids = _active_template_ids(db, patient.id)

    auto_create = []
    conflicts = []
    skipped = []

    for tmpl in templates:
        score, reasons = score_template(tmpl, patient, db)
        if score < MIN_SCORE:
            skipped.append({"template_id": tmpl.id, "name": tmpl.name, "score": score})
            continue

        item = {
            "template_id": tmpl.id,
            "name":        tmpl.name,
            "category":    tmpl.category,
            "specialty":   tmpl.specialty,
            "score":       score,
            "reasons":     reasons,
        }

        if tmpl.id in active_ids:
            # Find the existing instance
            inst = db.query(models.WorkflowInstance).filter(
                models.WorkflowInstance.patient_id == patient.id,
                models.WorkflowInstance.template_id == tmpl.id,
                models.WorkflowInstance.status.in_(["active", "paused"]),
            ).first()
            conflicts.append({
                **item,
                "instance_id":     inst.id if inst else None,
                "instance_status": inst.status if inst else None,
                "options":         ["create_anyway", "skip", "merge"],
            })
        else:
            auto_create.append(item)

    # Sort by score descending
    auto_create.sort(key=lambda x: x["score"], reverse=True)
    conflicts.sort(key=lambda x: x["score"], reverse=True)

    return {
        "auto_create": auto_create[:limit],
        "conflicts":   conflicts,
        "skipped":     skipped,
    }


def apply_suggestions(
    db: Session,
    patient: models.Patient,
    created_by: int,
    auto_create_ids: Optional[list[int]] = None,
    conflict_resolutions: Optional[list[dict]] = None,
) -> dict:
    """
    Execute the suggestion plan:
      - auto_create_ids: template IDs to create (defaults to all auto_create suggestions)
      - conflict_resolutions: list of {template_id, action: "create_anyway"|"skip"|"merge"}

    Returns {created: [...], skipped: [...], errors: [...]}
    """
    suggestions = suggest_templates(db, patient)

    to_create = auto_create_ids if auto_create_ids is not None else [
        s["template_id"] for s in suggestions["auto_create"]
    ]

    created = []
    skipped_ids = []
    errors = []

    # ── Auto-create ────────────────────────────────────────────────────────────
    for tmpl_id in to_create:
        try:
            inst = FlowEngine.create_instance(
                db=db,
                template_id=tmpl_id,
                patient_id=patient.id,
                created_by=created_by,
            )
            created.append({"template_id": tmpl_id, "instance_id": inst.id})
        except Exception as e:
            errors.append({"template_id": tmpl_id, "error": str(e)})

    # ── Conflict resolutions ────────────────────────────────────────────────────
    for res in (conflict_resolutions or []):
        action = res.get("action", "skip")
        tmpl_id = res["template_id"]

        if action == "skip":
            skipped_ids.append(tmpl_id)

        elif action == "create_anyway":
            try:
                inst = FlowEngine.create_instance(
                    db=db,
                    template_id=tmpl_id,
                    patient_id=patient.id,
                    created_by=created_by,
                )
                created.append({"template_id": tmpl_id, "instance_id": inst.id})
            except Exception as e:
                errors.append({"template_id": tmpl_id, "error": str(e)})

        elif action == "merge":
            # Keep existing instance; log a note on its active step
            inst = db.query(models.WorkflowInstance).filter(
                models.WorkflowInstance.patient_id == patient.id,
                models.WorkflowInstance.template_id == tmpl_id,
                models.WorkflowInstance.status.in_(["active", "paused"]),
            ).first()
            if inst:
                active_step = next(
                    (s for s in inst.steps if s.status == "active"), None
                )
                if active_step:
                    note = models.WorkflowAction(
                        step_id=active_step.id,
                        user_id=created_by,
                        action_type="merge_note",
                        description="זרימה חדשה מוזגה לזרימה קיימת",
                    )
                    db.add(note)
                created.append({
                    "template_id": tmpl_id,
                    "instance_id": inst.id,
                    "action": "merged",
                })
            db.flush()

    return {
        "created":  created,
        "skipped":  skipped_ids,
        "errors":   errors,
        "pending_conflicts": [
            c for c in suggestions["conflicts"]
            if c["template_id"] not in [r["template_id"] for r in (conflict_resolutions or [])]
        ],
    }


def derive_medical_stage(patient: models.Patient, db: Session) -> Optional[str]:
    """
    Derive medical_stage from the patient's journey nodes.
    Most-advanced completed/active stage wins.
    Returns: pre_diagnosis | active_treatment | recovery | monitoring | None
    """
    stage_map = {10: "pre_diagnosis", 20: "pre_diagnosis", 30: "active_treatment",
                 40: "recovery", 50: "monitoring"}

    nodes = db.query(models.Node).filter(
        models.Node.patient_id == patient.id,
        models.Node.node_type == "stage",
        models.Node.status.in_(["active", "completed"]),
    ).order_by(models.Node.stage_order.desc()).all()

    for node in nodes:
        if node.stage_order in stage_map:
            return stage_map[node.stage_order]

    return None
