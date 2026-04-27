"""
מחלץ דוח כיסויים מסוכם לכל פוליסות המטופל
"""
from typing import Any, Dict, List

POLICY_TYPES = {
    "life": "ביטוח חיים",
    "health": "ביטוח בריאות",
    "nursing": "ביטוח סיעוד",
    "critical_illness": "ביטוח מחלות קשות",
    "disability": "אובדן כושר עבודה",
}

COVERAGE_LABELS = {
    "hospitalization": "אשפוז",
    "surgery": "ניתוח",
    "specialist": "ביקור מומחה",
    "medications": "תרופות",
    "nursing_care": "סיעוד",
    "death_benefit": "פטירה",
    "disability_monthly": "נכות חודשית",
    "critical_illness_lumpsum": "מחלות קשות",
    "loss_of_work_capacity": "אובדן כושר עבודה",
}


def extract_coverage_report(patient, policies) -> Dict[str, Any]:
    report = {
        "patient_id": patient.id,
        "patient_name": patient.full_name,
        "id_number": patient.id_number,
        "total_policies": len(policies),
        "total_monthly_premium": sum(p.monthly_premium or 0 for p in policies),
        "by_type": {},
        "coverage_matrix": {},
        "gaps": [],
        "highlights": [],
    }

    # ארגן לפי סוג
    for policy_type, label in POLICY_TYPES.items():
        matching = [p for p in policies if p.policy_type == policy_type]
        if matching:
            report["by_type"][policy_type] = {
                "label": label,
                "count": len(matching),
                "insurers": [p.insurer for p in matching],
                "policies": [_policy_summary(p) for p in matching],
            }
        else:
            report["gaps"].append(label)

    # מטריצת כיסויים — שורות: כיסוי, עמודות: חברת ביטוח
    for coverage_key, coverage_label in COVERAGE_LABELS.items():
        covered_by = []
        for p in policies:
            cov = p.coverages.get(coverage_key, {})
            if cov.get("covered"):
                covered_by.append({
                    "insurer": p.insurer,
                    "policy_type": POLICY_TYPES.get(p.policy_type, p.policy_type),
                    "amount": cov.get("amount", ""),
                    "notes": cov.get("notes", ""),
                })
        report["coverage_matrix"][coverage_label] = {
            "covered": len(covered_by) > 0,
            "covered_by": covered_by,
        }

    # הדגשות
    for label, data in report["coverage_matrix"].items():
        if not data["covered"]:
            report["gaps"].append(f"כיסוי {label}")
        elif len(data["covered_by"]) > 1:
            report["highlights"].append(f"כפילות כיסוי: {label} מכוסה ב-{len(data['covered_by'])} פוליסות")

    return report


def _policy_summary(policy) -> Dict[str, Any]:
    return {
        "id": policy.id,
        "policy_number": policy.policy_number,
        "insurer": policy.insurer,
        "product_name": policy.product_name,
        "monthly_premium": policy.monthly_premium,
        "start_date": policy.start_date.isoformat() if policy.start_date else None,
        "analysis_status": policy.analysis_status,
    }
