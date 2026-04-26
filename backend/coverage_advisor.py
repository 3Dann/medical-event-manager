"""
Coverage Advisor — מייעץ כיסוי ביטוחי לצעדי זרימה.

For each active workflow step:
  1. Reads coverage_categories from the step (inherited from template or overridden).
  2. Checks every active insurance source of the patient.
  3. Computes how much is covered + how much is missing.
  4. Looks up ResponsivenessScore for each insurer.
  5. Ranks sources by composite score: 60% coverage + 40% responsiveness.
  6. Writes WorkflowStepCoverage rows and returns ranked recommendations.
"""

import json
from typing import Optional
from sqlalchemy.orm import Session
import models

# ── HMO name normalization → ResponsivenessScore company_name ─────────────────
HMO_TO_COMPANY = {
    "clalit":    "כללית",
    "maccabi":   "מכבי",
    "meuhedet":  "מאוחדת",
    "leumit":    "לאומית",
}

SOURCE_TYPE_TO_COMPANY = {
    "bituch_leumi": "ביטוח לאומי",
    "sal_habriut":  "סל הבריאות",
}

CATEGORY_LABELS = {
    "second_opinion":    "חוות דעת שנייה",
    "surgery":           "ניתוח",
    "transplant":        "השתלה",
    "hospitalization":   "אשפוז",
    "rehabilitation":    "שיקום",
    "advanced_tech":     "טכנולוגיה מתקדמת",
    "critical_illness":  "מחלה קשה",
    "diagnostics":       "אבחון",
}


def _company_name(source) -> str:
    """Return the display name of an insurance source for responsiveness lookup."""
    if source is None:
        return ""
    if source.source_type == "kupat_holim" and source.hmo_name:
        return HMO_TO_COMPANY.get(source.hmo_name, source.hmo_name)
    if source.company_name:
        return source.company_name
    return SOURCE_TYPE_TO_COMPANY.get(source.source_type, source.source_type or "")


def _responsiveness(db: Session, company: str) -> Optional[float]:
    """Look up the overall responsiveness score (1-10) for a company."""
    score = db.query(models.ResponsivenessScore).filter(
        models.ResponsivenessScore.company_name == company
    ).first()
    return score.overall_score if score else None


def _composite_score(coverage_ratio: float, resp_score: Optional[float]) -> float:
    """60% coverage ratio (0-1) + 40% responsiveness ratio (0-1)."""
    resp_ratio = (resp_score / 10.0) if resp_score else 0.5
    return round(coverage_ratio * 0.6 + resp_ratio * 0.4, 4)


def _effective_cost(step: models.WorkflowStep,
                    template_step: Optional[models.WorkflowStepTemplate]) -> Optional[float]:
    """Instance-level override takes priority over template default."""
    if step.estimated_cost is not None:
        return step.estimated_cost
    if template_step and template_step.estimated_cost is not None:
        return template_step.estimated_cost
    return None


def _categories(step: models.WorkflowStep,
                template_step: Optional[models.WorkflowStepTemplate]) -> list:
    """Step-level override takes priority over template."""
    raw = step.coverage_categories or (
        template_step.coverage_categories if template_step else None
    )
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []


def _find_template_step(step: models.WorkflowStep) -> Optional[models.WorkflowStepTemplate]:
    template = step.instance.template if step.instance else None
    if not template:
        return None
    return next(
        (st for st in template.step_templates if st.step_key == step.step_key),
        None
    )


def _build_recommendation(
    source: models.InsuranceSource,
    coverage: Optional[models.Coverage],
    category: str,
    estimated_cost: Optional[float],
    covered_amount: Optional[float],
    gap: Optional[float],
    rank: int,
) -> str:
    company = _company_name(source)
    cat_label = CATEGORY_LABELS.get(category, category)
    parts = [f"עדיפות {rank} — {company}"]

    if coverage and coverage.is_covered:
        if coverage.coverage_amount:
            parts.append(f"כיסוי עד ₪{coverage.coverage_amount:,.0f}")
        elif coverage.coverage_percentage:
            parts.append(f"כיסוי {coverage.coverage_percentage:.0f}%")
        if coverage.copay:
            parts.append(f"השתתפות עצמית ₪{coverage.copay:,.0f}")
        if coverage.annual_limit:
            parts.append(f"תקרה שנתית ₪{coverage.annual_limit:,.0f}")
        if gap and gap > 0:
            parts.append(f"פער משוער ₪{gap:,.0f}")
        if coverage.conditions:
            parts.append(f"תנאים: {coverage.conditions}")
    else:
        parts.append(f"אין כיסוי ל{cat_label}")
        if estimated_cost:
            parts.append(f"עלות משוערת ₪{estimated_cost:,.0f}")

    return " | ".join(parts)


def compute_step_coverage(
    db: Session,
    step: models.WorkflowStep,
    patient: models.Patient,
) -> list[dict]:
    """
    Compute and persist WorkflowStepCoverage rows for a step.
    Returns list of recommendation dicts sorted by priority_rank.
    """
    # Clear previous computation
    db.query(models.WorkflowStepCoverage).filter(
        models.WorkflowStepCoverage.step_id == step.id
    ).delete(synchronize_session=False)

    template_step = _find_template_step(step)
    categories = _categories(step, template_step)
    estimated_cost = _effective_cost(step, template_step)

    if not categories:
        db.flush()
        return []

    active_sources = [s for s in patient.insurance_sources if s.is_active]
    if not active_sources:
        db.flush()
        return []

    candidates = []  # (composite_score, WorkflowStepCoverage instance)

    for source in active_sources:
        company = _company_name(source)
        resp = _responsiveness(db, company)

        for category in categories:
            # Find matching coverage record
            cov = db.query(models.Coverage).filter(
                models.Coverage.insurance_source_id == source.id,
                models.Coverage.category == category,
            ).first()

            is_covered = bool(cov and cov.is_covered)
            covered_amount = None
            coverage_pct = None
            gap = None
            claim_suggested = False

            if is_covered:
                claim_suggested = True
                if cov.coverage_amount:
                    covered_amount = cov.coverage_amount
                    if estimated_cost:
                        gap = max(0.0, estimated_cost - covered_amount)
                elif cov.coverage_percentage and estimated_cost:
                    covered_amount = estimated_cost * (cov.coverage_percentage / 100.0)
                    coverage_pct = cov.coverage_percentage
                    gap = max(0.0, estimated_cost - covered_amount)
                else:
                    covered_amount = None

                cov_ratio = (covered_amount / estimated_cost) if (
                    covered_amount and estimated_cost and estimated_cost > 0
                ) else 0.5
            else:
                cov_ratio = 0.0
                gap = estimated_cost

            score = _composite_score(cov_ratio, resp)

            item = models.WorkflowStepCoverage(
                step_id=step.id,
                insurance_source_id=source.id,
                coverage_id=cov.id if cov else None,
                coverage_category=category,
                is_covered=is_covered,
                covered_amount=covered_amount,
                coverage_percentage=coverage_pct or (cov.coverage_percentage if cov else None),
                gap_amount=gap,
                responsiveness_score=resp,
                claim_suggested=claim_suggested,
            )
            candidates.append((score, item))

    # Sort by score descending, assign ranks
    candidates.sort(key=lambda x: x[0], reverse=True)
    results = []
    for rank, (score, item) in enumerate(candidates, start=1):
        item.priority_rank = rank
        source = next(s for s in active_sources if s.id == item.insurance_source_id)
        cov_obj = db.get(models.Coverage, item.coverage_id) if item.coverage_id else None
        item.recommendation = _build_recommendation(
            source=source,
            coverage=cov_obj,
            category=item.coverage_category,
            estimated_cost=estimated_cost,
            covered_amount=item.covered_amount,
            gap=item.gap_amount,
            rank=rank,
        )
        db.add(item)
        results.append({
            "rank":                rank,
            "insurance_source_id": item.insurance_source_id,
            "source_name":         _company_name(source),
            "source_type":         source.source_type,
            "coverage_category":   item.coverage_category,
            "is_covered":          item.is_covered,
            "covered_amount":      item.covered_amount,
            "coverage_percentage": item.coverage_percentage,
            "gap_amount":          item.gap_amount,
            "responsiveness_score":item.responsiveness_score,
            "composite_score":     score,
            "claim_suggested":     item.claim_suggested,
            "recommendation":      item.recommendation,
        })

    db.flush()
    return results


def get_step_coverage_summary(step: models.WorkflowStep) -> dict:
    """Return a summary of already-computed coverage for a step."""
    items = sorted(step.coverage_items, key=lambda x: (x.priority_rank or 999))
    estimated_cost = step.estimated_cost

    best = next((i for i in items if i.is_covered), None)
    total_gap = None
    if estimated_cost and best and best.covered_amount:
        total_gap = max(0.0, estimated_cost - best.covered_amount)
    elif estimated_cost and not best:
        total_gap = estimated_cost

    return {
        "estimated_cost":  estimated_cost,
        "total_gap":       total_gap,
        "has_coverage":    any(i.is_covered for i in items),
        "best_source":     _company_name(
            items[0].insurance_source
        ) if items else None,
        "items": [
            {
                "rank":                i.priority_rank,
                "source_name":         _company_name(i.insurance_source),
                "source_type":         i.insurance_source.source_type,
                "coverage_category":   i.coverage_category,
                "is_covered":          i.is_covered,
                "covered_amount":      i.covered_amount,
                "coverage_percentage": i.coverage_percentage,
                "gap_amount":          i.gap_amount,
                "responsiveness_score":i.responsiveness_score,
                "claim_suggested":     i.claim_suggested,
                "recommendation":      i.recommendation,
                "computed_at":         i.computed_at.isoformat() if i.computed_at else None,
            }
            for i in items
        ],
    }
