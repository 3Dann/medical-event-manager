"""
תוכניות ביטוח משלים ספציפיות לפי קופת חולים
מבוסס על תוכניות 2024-2025 (יש לאמת מול אתרי הקופות)
"""

# מבנה: HMO_PLANS[hmo_name][plan_key] = { "label": ..., "coverages": { category: {...} } }

HMO_PLANS = {

    # ── כללית ──────────────────────────────────────────────────────────
    "clalit": {
        "mushlam": {
            "label": "כללית מושלם",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 80,  "copay": 150, "conditions": "מרשימת מומחים של הקופה", "abroad_covered": False},
                "surgery":          {"is_covered": True,  "coverage_percentage": 80,  "copay": 1200, "conditions": "ניתוחים פרטיים בבתי חולים מוכרים", "abroad_covered": False},
                "transplant":       {"is_covered": True,  "coverage_percentage": 70,  "annual_limit": 400000, "abroad_covered": False, "conditions": "השתלות בארץ"},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 90,  "copay": 250, "conditions": "חדר יחיד, בתי חולים מוכרים"},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 80,  "copay": 60,  "conditions": "עד 30 טיפולים בשנה"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 70,  "annual_limit": 50000, "conditions": "תרופות מחוץ לסל"},
                "critical_illness": {"is_covered": False},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 90,  "copay": 60,  "conditions": "פענוח מהיר, ללא הפניה"},
            }
        },
        "mushlam_plus": {
            "label": "כללית מושלם פלוס",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 90,  "copay": 100, "conditions": "כולל מומחים בחו\"ל", "abroad_covered": True},
                "surgery":          {"is_covered": True,  "coverage_percentage": 85,  "copay": 800,  "conditions": "כולל ניתוחים בחו\"ל", "abroad_covered": True},
                "transplant":       {"is_covered": True,  "coverage_percentage": 80,  "annual_limit": 700000, "abroad_covered": True, "conditions": "כולל השתלות בחו\"ל"},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 95,  "copay": 150, "conditions": "חדר יחיד, כולל חו\"ל"},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 85,  "copay": 40,  "conditions": "עד 45 טיפולים בשנה"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 80,  "annual_limit": 80000, "conditions": "תרופות וציוד מחוץ לסל"},
                "critical_illness": {"is_covered": True,  "coverage_amount": 80000,   "conditions": "רשימת מחלות קשות"},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 95,  "copay": 0,   "conditions": "פענוח מהיר, אמבולנס"},
            }
        },
        "platinum": {
            "label": "כללית מושלם פלטינום",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "conditions": "ללא הגבלה, כולל חו\"ל", "abroad_covered": True},
                "surgery":          {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "conditions": "ניתוחים בארץ ובחו\"ל", "abroad_covered": True},
                "transplant":       {"is_covered": True,  "coverage_percentage": 100, "annual_limit": 1500000, "abroad_covered": True},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "conditions": "חדר יחיד, ארץ וחו\"ל", "abroad_covered": True},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "conditions": "ללא הגבלת טיפולים"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 100, "annual_limit": 150000},
                "critical_illness": {"is_covered": True,  "coverage_amount": 200000,  "conditions": "תגמול חד-פעמי, מחלות קשות"},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "abroad_covered": True},
            }
        },
    },

    # ── מכבי ───────────────────────────────────────────────────────────
    "maccabi": {
        "shaban": {
            "label": "מכבי שב\"ן",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 80,  "copay": 120, "conditions": "מרשימת מומחי מכבי"},
                "surgery":          {"is_covered": True,  "coverage_percentage": 80,  "copay": 1500, "conditions": "ניתוחים פרטיים"},
                "transplant":       {"is_covered": True,  "coverage_percentage": 65,  "annual_limit": 350000, "abroad_covered": False},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 85,  "copay": 300, "conditions": "חדר יחיד"},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 75,  "copay": 70,  "conditions": "עד 25 טיפולים בשנה"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 65,  "annual_limit": 40000},
                "critical_illness": {"is_covered": False},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 85,  "copay": 70},
            }
        },
        "shaban_silver": {
            "label": "מכבי שב\"ן כסף",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 90,  "copay": 80,  "abroad_covered": True, "conditions": "כולל חו\"ל"},
                "surgery":          {"is_covered": True,  "coverage_percentage": 85,  "copay": 800,  "abroad_covered": True, "conditions": "כולל ניתוחים בחו\"ל"},
                "transplant":       {"is_covered": True,  "coverage_percentage": 75,  "annual_limit": 600000, "abroad_covered": True},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 92,  "copay": 200, "conditions": "חדר יחיד, כולל חו\"ל"},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 85,  "copay": 50,  "conditions": "עד 40 טיפולים בשנה"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 75,  "annual_limit": 70000},
                "critical_illness": {"is_covered": True,  "coverage_amount": 60000,   "conditions": "מחלות קשות"},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 92,  "copay": 40},
            }
        },
        "shaban_gold": {
            "label": "מכבי שב\"ן זהב",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "abroad_covered": True},
                "surgery":          {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "abroad_covered": True},
                "transplant":       {"is_covered": True,  "coverage_percentage": 100, "annual_limit": 1200000, "abroad_covered": True},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "abroad_covered": True},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "conditions": "ללא הגבלה"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 100, "annual_limit": 130000},
                "critical_illness": {"is_covered": True,  "coverage_amount": 150000},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "abroad_covered": True},
            }
        },
    },

    # ── מאוחדת ─────────────────────────────────────────────────────────
    "meuhedet": {
        "keshet": {
            "label": "מאוחדת קשת",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 80,  "copay": 130, "conditions": "מרשימת מומחי מאוחדת"},
                "surgery":          {"is_covered": True,  "coverage_percentage": 80,  "copay": 1300, "conditions": "ניתוחים פרטיים"},
                "transplant":       {"is_covered": True,  "coverage_percentage": 70,  "annual_limit": 380000, "abroad_covered": False},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 88,  "copay": 270, "conditions": "חדר יחיד"},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 80,  "copay": 55,  "conditions": "עד 28 טיפולים"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 68,  "annual_limit": 45000},
                "critical_illness": {"is_covered": False},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 88,  "copay": 55},
            }
        },
        "adif": {
            "label": "מאוחדת עדיף",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 95,  "copay": 50,  "abroad_covered": True, "conditions": "כולל חו\"ל"},
                "surgery":          {"is_covered": True,  "coverage_percentage": 90,  "copay": 400,  "abroad_covered": True, "conditions": "כולל ניתוחים בחו\"ל"},
                "transplant":       {"is_covered": True,  "coverage_percentage": 85,  "annual_limit": 800000, "abroad_covered": True},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 100, "copay": 0,   "conditions": "חדר יחיד, ארץ וחו\"ל", "abroad_covered": True},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 90,  "copay": 30,  "conditions": "עד 50 טיפולים"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 85,  "annual_limit": 100000},
                "critical_illness": {"is_covered": True,  "coverage_amount": 100000,  "conditions": "רשימת מחלות קשות"},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 100, "copay": 0},
            }
        },
    },

    # ── לאומית ─────────────────────────────────────────────────────────
    "leumit": {
        "shlema": {
            "label": "לאומית שלמה",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 80,  "copay": 140, "conditions": "מרשימת מומחי לאומית"},
                "surgery":          {"is_covered": True,  "coverage_percentage": 78,  "copay": 1400, "conditions": "ניתוחים פרטיים"},
                "transplant":       {"is_covered": True,  "coverage_percentage": 68,  "annual_limit": 360000, "abroad_covered": False},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 86,  "copay": 280, "conditions": "חדר יחיד"},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 78,  "copay": 60,  "conditions": "עד 25 טיפולים"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 65,  "annual_limit": 42000},
                "critical_illness": {"is_covered": False},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 86,  "copay": 60},
            }
        },
        "shlema_plus": {
            "label": "לאומית שלמה פלוס",
            "coverages": {
                "second_opinion":   {"is_covered": True,  "coverage_percentage": 92,  "copay": 70,  "abroad_covered": True, "conditions": "כולל חו\"ל"},
                "surgery":          {"is_covered": True,  "coverage_percentage": 88,  "copay": 600,  "abroad_covered": True, "conditions": "כולל ניתוחים בחו\"ל"},
                "transplant":       {"is_covered": True,  "coverage_percentage": 82,  "annual_limit": 650000, "abroad_covered": True},
                "hospitalization":  {"is_covered": True,  "coverage_percentage": 95,  "copay": 100, "conditions": "חדר יחיד, ארץ וחו\"ל", "abroad_covered": True},
                "rehabilitation":   {"is_covered": True,  "coverage_percentage": 88,  "copay": 35,  "conditions": "עד 45 טיפולים"},
                "advanced_tech":    {"is_covered": True,  "coverage_percentage": 82,  "annual_limit": 90000},
                "critical_illness": {"is_covered": True,  "coverage_amount": 80000,   "conditions": "מחלות קשות"},
                "diagnostics":      {"is_covered": True,  "coverage_percentage": 95,  "copay": 20},
            }
        },
    },
}

# מיפוי מהיר: hmo_name → רשימת תוכניות [(key, label), ...]
def get_hmo_plan_options(hmo_name):
    plans = HMO_PLANS.get(hmo_name, {})
    return [{"key": k, "label": v["label"]} for k, v in plans.items()]


def get_plan_coverages(hmo_name, plan_key):
    return HMO_PLANS.get(hmo_name, {}).get(plan_key, {}).get("coverages", {})


def get_plan_label(hmo_name, plan_key):
    return HMO_PLANS.get(hmo_name, {}).get(plan_key, {}).get("label", plan_key)
