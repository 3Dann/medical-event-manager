"""Built-in medical condition tags — two-level hierarchy: category → specific tag."""

BUILTIN_CONDITION_TAGS = [
    # ── אונקולוגיה ──────────────────────────────────────────────────────────────
    {"key": "cancer",            "label_he": "סרטן (כללי)",       "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "breast_cancer",     "label_he": "סרטן שד",            "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "lung_cancer",       "label_he": "סרטן ריאות",         "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "colorectal_cancer", "label_he": "סרטן מעי גס",        "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "prostate_cancer",   "label_he": "סרטן ערמונית",       "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "lymphoma",          "label_he": "לימפומה",            "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "leukemia",          "label_he": "לוקמיה",             "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "chemotherapy",      "label_he": "כימותרפיה",          "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "radiation",         "label_he": "קרינה",              "category": "oncology",      "category_he": "אונקולוגיה"},
    {"key": "immunotherapy",     "label_he": "אימונותרפיה",        "category": "oncology",      "category_he": "אונקולוגיה"},
    # ── קרדיולוגיה ─────────────────────────────────────────────────────────────
    {"key": "cardiac",           "label_he": "מחלת לב (כללי)",     "category": "cardiology",    "category_he": "קרדיולוגיה"},
    {"key": "heart_attack",      "label_he": "אוטם שריר הלב",      "category": "cardiology",    "category_he": "קרדיולוגיה"},
    {"key": "heart_surgery",     "label_he": "ניתוח לב",           "category": "cardiology",    "category_he": "קרדיולוגיה"},
    {"key": "pacemaker",         "label_he": "קוצב לב",            "category": "cardiology",    "category_he": "קרדיולוגיה"},
    {"key": "heart_failure",     "label_he": "אי ספיקת לב",        "category": "cardiology",    "category_he": "קרדיולוגיה"},
    {"key": "arrhythmia",        "label_he": "הפרעת קצב",          "category": "cardiology",    "category_he": "קרדיולוגיה"},
    # ── נוירולוגיה ─────────────────────────────────────────────────────────────
    {"key": "neurology",         "label_he": "מחלה נוירולוגית",    "category": "neurology",     "category_he": "נוירולוגיה"},
    {"key": "stroke",            "label_he": "שבץ מוחי",           "category": "neurology",     "category_he": "נוירולוגיה"},
    {"key": "epilepsy",          "label_he": "אפילפסיה",           "category": "neurology",     "category_he": "נוירולוגיה"},
    {"key": "ms",                "label_he": "טרשת נפוצה",         "category": "neurology",     "category_he": "נוירולוגיה"},
    {"key": "parkinsons",        "label_he": "פרקינסון",           "category": "neurology",     "category_he": "נוירולוגיה"},
    # ── אורתופדיה ──────────────────────────────────────────────────────────────
    {"key": "orthopedic",        "label_he": "בעיה אורתופדית",     "category": "orthopedics",   "category_he": "אורתופדיה"},
    {"key": "joint_replacement", "label_he": "החלפת מפרק",         "category": "orthopedics",   "category_he": "אורתופדיה"},
    {"key": "spine",             "label_he": "עמוד שדרה",          "category": "orthopedics",   "category_he": "אורתופדיה"},
    {"key": "fracture",          "label_he": "שבר",                "category": "orthopedics",   "category_he": "אורתופדיה"},
    # ── כללי ───────────────────────────────────────────────────────────────────
    {"key": "surgery",           "label_he": "ניתוח",              "category": "general",       "category_he": "כללי"},
    {"key": "hospitalization",   "label_he": "אשפוז",              "category": "general",       "category_he": "כללי"},
    {"key": "rehabilitation",    "label_he": "שיקום",              "category": "general",       "category_he": "כללי"},
    {"key": "chronic",           "label_he": "מחלה כרונית",        "category": "general",       "category_he": "כללי"},
    {"key": "rare_disease",      "label_he": "מחלה נדירה",         "category": "general",       "category_he": "כללי"},
    {"key": "transplant",        "label_he": "השתלה",              "category": "general",       "category_he": "כללי"},
    {"key": "disability",        "label_he": "נכות",               "category": "general",       "category_he": "כללי"},
    {"key": "diabetes",          "label_he": "סוכרת",              "category": "general",       "category_he": "כללי"},
    {"key": "autoimmune",        "label_he": "מחלה אוטואימונית",   "category": "general",       "category_he": "כללי"},
]
