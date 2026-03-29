"""
Seed data for:
1. Responsiveness scores (default)
2. Sal HaBriut standard coverages
3. HMO package definitions
"""

RESPONSIVENESS_DEFAULTS = [
    {"company_name": "סל הבריאות", "company_type": "sal_habriut", "response_speed": 8.5, "bureaucracy_level": 8.0, "overall_score": 8.3},
    {"company_name": "ביטוח לאומי", "company_type": "bituch_leumi", "response_speed": 5.0, "bureaucracy_level": 5.0, "overall_score": 5.0},
    {"company_name": "כללית", "company_type": "hmo", "response_speed": 7.5, "bureaucracy_level": 7.0, "overall_score": 7.3},
    {"company_name": "מכבי", "company_type": "hmo", "response_speed": 8.0, "bureaucracy_level": 7.5, "overall_score": 7.8},
    {"company_name": "מאוחדת", "company_type": "hmo", "response_speed": 7.0, "bureaucracy_level": 7.0, "overall_score": 7.0},
    {"company_name": "לאומית", "company_type": "hmo", "response_speed": 7.0, "bureaucracy_level": 6.5, "overall_score": 6.8},
    {"company_name": "הראל", "company_type": "private", "response_speed": 7.5, "bureaucracy_level": 7.0, "overall_score": 7.3},
    {"company_name": "מגדל", "company_type": "private", "response_speed": 7.0, "bureaucracy_level": 6.5, "overall_score": 6.8},
    {"company_name": "כלל", "company_type": "private", "response_speed": 6.5, "bureaucracy_level": 6.5, "overall_score": 6.5},
    {"company_name": "הפניקס", "company_type": "private", "response_speed": 7.0, "bureaucracy_level": 7.0, "overall_score": 7.0},
    {"company_name": "מנורה", "company_type": "private", "response_speed": 7.0, "bureaucracy_level": 6.5, "overall_score": 6.8},
    {"company_name": "איילון", "company_type": "private", "response_speed": 6.5, "bureaucracy_level": 6.5, "overall_score": 6.5},
    {"company_name": "שירביט", "company_type": "private", "response_speed": 6.0, "bureaucracy_level": 6.0, "overall_score": 6.0},
]

SAL_HABRIUT_COVERAGES = {
    "second_opinion": {
        "is_covered": True,
        "coverage_percentage": 80,
        "copay": 50,
        "conditions": "ברשימת הרופאים המוכרים בלבד",
        "abroad_covered": False,
        "notes": "חוות דעת שנייה מומחה — כלולה בסל",
    },
    "surgery": {
        "is_covered": True,
        "coverage_percentage": 100,
        "copay": 0,
        "conditions": "ניתוח בבית חולים ציבורי, ברשימת הניתוחים המאושרים",
        "abroad_covered": False,
        "notes": "ניתוחים אלקטיביים — ייתכן תור המתנה",
    },
    "transplant": {
        "is_covered": True,
        "coverage_percentage": 100,
        "conditions": "השתלה בארץ בלבד דרך מרכז ההשתלות הלאומי",
        "abroad_covered": False,
        "notes": "השתלה בחו\"ל — אינה בסל, יש לבדוק השלמה",
    },
    "hospitalization": {
        "is_covered": True,
        "coverage_percentage": 100,
        "copay": 0,
        "conditions": "בבית חולים ציבורי, חדר רגיל",
        "abroad_covered": False,
        "notes": "חדר יחיד / פרטי — אינו בסל",
    },
    "rehabilitation": {
        "is_covered": True,
        "coverage_percentage": 80,
        "copay": 30,
        "conditions": "פיזיותרפיה, ריפוי בעיסוק — עד 15 טיפולים בשנה",
        "abroad_covered": False,
    },
    "advanced_tech": {
        "is_covered": False,
        "conditions": "תרופות וטכנולוגיות חדישות — מחוץ לסל, דורש אישור",
        "notes": "ועדת חריגים — ניתן לפנות",
    },
    "critical_illness": {
        "is_covered": False,
        "notes": "אינו בסל הבריאות הבסיסי",
    },
    "diagnostics": {
        "is_covered": True,
        "coverage_percentage": 100,
        "copay": 30,
        "conditions": "CT, MRI, ביופסיה — עם הפניית רופא מטפל",
        "abroad_covered": False,
        "notes": "פענוח מהיר — אינו בסל הבסיסי",
    },
}

HMO_COVERAGES = {
    "mushlam": {
        "second_opinion": {"is_covered": True, "coverage_percentage": 80, "copay": 100, "conditions": "מרשימה מוסדרת", "abroad_covered": False},
        "surgery": {"is_covered": True, "coverage_percentage": 80, "copay": 500, "conditions": "כולל ניתוחים פרטיים", "abroad_covered": False},
        "transplant": {"is_covered": True, "coverage_percentage": 70, "abroad_covered": True, "conditions": "גם השתלות בחו\"ל"},
        "hospitalization": {"is_covered": True, "coverage_percentage": 90, "copay": 200, "conditions": "כולל חדר יחיד בתוספת תשלום"},
        "rehabilitation": {"is_covered": True, "coverage_percentage": 80, "copay": 50, "conditions": "עד 30 טיפולים בשנה"},
        "advanced_tech": {"is_covered": True, "coverage_percentage": 70, "conditions": "תרופות מחוץ לסל — עד תקרה שנתית"},
        "critical_illness": {"is_covered": False},
        "diagnostics": {"is_covered": True, "coverage_percentage": 90, "copay": 50, "conditions": "כולל פענוח מהיר"},
    },
    "premium": {
        "second_opinion": {"is_covered": True, "coverage_percentage": 100, "copay": 0, "abroad_covered": True, "conditions": "כולל חו\"ל"},
        "surgery": {"is_covered": True, "coverage_percentage": 90, "copay": 200, "abroad_covered": True, "conditions": "כולל ניתוחים בחו\"ל"},
        "transplant": {"is_covered": True, "coverage_percentage": 85, "abroad_covered": True},
        "hospitalization": {"is_covered": True, "coverage_percentage": 100, "copay": 0, "conditions": "חדר יחיד כלול"},
        "rehabilitation": {"is_covered": True, "coverage_percentage": 90, "copay": 30, "conditions": "עד 50 טיפולים בשנה"},
        "advanced_tech": {"is_covered": True, "coverage_percentage": 80, "conditions": "תקרה גבוהה יותר"},
        "critical_illness": {"is_covered": True, "coverage_amount": 50000, "conditions": "מחלות ספציפיות ברשימה"},
        "diagnostics": {"is_covered": True, "coverage_percentage": 100, "copay": 0, "conditions": "כולל פענוח מהיר ואמבולנס"},
    },
}
