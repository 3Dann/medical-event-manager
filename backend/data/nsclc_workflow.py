# -*- coding: utf-8 -*-
"""
מסע מטופל NSCLC — סרטן ריאה
תבנית אחת עם הסתעפות: 11 צמתים שלבים 1-3 + 6 צמתים שלב 4
צמתים 12-14 מקבילים (parallel_group)
מבוסס על: ניהול ארוע רפואי סרטן ריאה.xlsx
"""

NSCLC_TEMPLATE = {
    "name": "מסע סרטן ריאה NSCLC",
    "description": (
        "מסע מטופל מלא לסרטן ריאה מסוג NSCLC — מהופעת תסמינים ועד מעקב. "
        "כולל 11 צמתים לשלבים 1-3 ו-6 צמתים לשלב 4 גרורתי. "
        "בשלב 4 — צמתים 12-14 מופעלים במקביל."
    ),
    "category": "treatment",
    "condition_tags": ["cancer", "lung_cancer", "nsclc", "oncology"],
    "trigger_event": "diagnosis",
    "specialty": "oncology",
    "is_journey": False,

    "steps": [

        # ══════════════════════════════════════════════════════════════════════
        # שלבים 1-3 — 11 צמתים סדרתיים
        # ══════════════════════════════════════════════════════════════════════

        {
            "step_key":   "lung_s1_symptoms",
            "name":       "הופעת תסמינים",
            "step_order": 1,
            "step_type":  "medical",
            "duration_days": 14,
            "sla_days":   7,
            "coverage_categories": ["diagnostics"],
            "estimated_cost": 500,
            "required_documents": [],
            "gate_condition": None,
            "gate_error_msg": None,
            "instructions": (
                "שיעול כרוני מעל 3 שבועות, עייפות, קוצר נשימה, כיח דמי. "
                "לוגיקה: גיל>40 + מעשן + שיעול>3 שבועות → הפניה ישירה ל-CT במינון נמוך (LDCT). "
                "אל תשלח ל-X-ray — מפספס 25% מהמקרים. "
                "SLA: 7 ימים מפתיחת תיק — ודא הפניה ל-CT."
            ),
            "tasks": [
                "קבל הפניה מרופא משפחה לריאות",
                "תאם CT מינון נמוך (LDCT)",
                "תעד תסמינים ותאריך התחלה",
                "בדוק היסטוריית עישון + גיל",
            ],
        },
        {
            "step_key":   "lung_s2_red_flags",
            "name":       "תמרורי אזהרה",
            "step_order": 2,
            "step_type":  "medical",
            "duration_days": 3,
            "sla_days":   None,
            "coverage_categories": ["diagnostics"],
            "estimated_cost": 1200,
            "gate_condition": None,
            "instructions": (
                "תמרורי אזהרה מיידיים (Emergency): שיעול דמי (Hemoptysis), נפיחות פנים/צוואר (SVC Syndrome), סטרידור. "
                "תמרורי אזהרה שקטים (Urgent): דלקת ריאות לא חולפת, התאלות אצבעות, צרידות חדשה מעל 3 שבועות. "
                "Emergency → Fast Track לרופא ריאות תוך 48 שעות. Urgent → תוך שבוע."
            ),
            "tasks": [
                "זיהוי סוג תמרור האזהרה (Emergency / Urgent)",
                "הפניה מהירה לרופא ריאות",
                "תיעוד הממצאים בתיק",
            ],
        },
        {
            "step_key":   "lung_s3_labs",
            "name":       "בירור מעבדתי",
            "step_order": 3,
            "step_type":  "medical",
            "duration_days": 3,
            "coverage_categories": ["diagnostics"],
            "estimated_cost": 300,
            "gate_condition": None,
            "instructions": (
                "ספירת דם מלאה, כימיה, תפקודי כבד. "
                "סידן גבוה (היפרקלצמיה) / טסיות מעל 400,000 → התראת ממאירות גרורתית. "
                "הכן 'תיק מוכן' לפגישה עם מומחה."
            ),
            "tasks": [
                "הזמן ספירת דם מלאה (CBC)",
                "הזמן כימיה + תפקודי כבד",
                "בדוק רמת סידן בדם",
                "הכן תיק ממצאים לפגישה עם מומחה",
            ],
        },
        {
            "step_key":   "lung_s4_staging",
            "name":       "קביעת שלב (Staging)",
            "step_order": 4,
            "step_type":  "medical",
            "duration_days": 21,
            "coverage_categories": ["diagnostics", "advanced_tech"],
            "estimated_cost": 5500,
            "required_documents": ["PET_CT", "CT_chest"],
            "gate_condition": None,
            "gate_error_msg": "נדרשת תוצאת EBUS לפני מעבר לכירורגיה כשיש קליטה בבלוטות",
            "instructions": (
                "PET-CT שלם לפני ביופסיה — מיפוי גוף מלא. "
                "EBUS: ביופסיית בלוטות לימפה. "
                "שער: אם PET-CT מראה קליטה בבלוטות → חובת EBUS לפני אישור מעבר לכירורגיה."
            ),
            "tasks": [
                "תאם PET-CT מלא",
                "קבל אישור קופה ל-PET-CT",
                "בצע EBUS אם יש קליטה בבלוטות",
                "שמור דוחות הדמיה בתיק",
                "עדכן שלב (Stage) לפי הממצאים",
            ],
        },
        {
            "step_key":   "lung_s5_ngs",
            "name":       "אבחנה מולקולרית (NGS)",
            "step_order": 5,
            "step_type":  "medical",
            "duration_days": 21,
            "sla_days":   21,
            "coverage_categories": ["diagnostics", "advanced_tech"],
            "estimated_cost": 3500,
            "required_documents": ["NGS_report"],
            "gate_condition": {"field": "biomarker_target", "operator": "not_empty"},
            "gate_error_msg": "לא ניתן להגדיר תוכנית טיפול ללא תוצאת NGS (Biomarker Status)",
            "instructions": (
                "NGS מקיף DNA+RNA (FoundationOne / אונקוטסט). RNA חובה לזיהוי ALK/ROS1/RET. "
                "בדיקת סבסוד: HER2 ← בורינגר, KRAS ← אמגן. "
                "מוטציות: EGFR, ALK, HER2, KRAS, RET, MET Exon 14, ROS1, BRAF, PD-L1. "
                "SLA: 21 יום — אם לא התקבלה תוצאה → הזמן ביופסיה נוזלית. "
                "שער: חסום מעבר לטיפול ללא ערך בשדה Biomarker."
            ),
            "tasks": [
                "הזמן NGS DNA+RNA (FoundationOne / אונקוטסט)",
                "ודא כמות רקמה מספקת — Core Biopsy",
                "הזמן ביופסיה נוזלית אם רקמה לא מספיקה",
                "עקוב אחרי תוצאה — SLA 21 יום",
                "עדכן שדה Biomarker בתיק לאחר קבלת תוצאה",
            ],
        },
        {
            "step_key":   "lung_s6_surgery_eval",
            "name":       "הערכת נתיחות (FEV1)",
            "step_order": 6,
            "step_type":  "medical",
            "duration_days": 7,
            "coverage_categories": ["diagnostics"],
            "estimated_cost": 800,
            "gate_condition": {"field": "fev1_score", "operator": "not_empty"},
            "gate_error_msg": "נדרש ציון FEV1 לפני תכנון כירורגי",
            "instructions": (
                "ייעוץ כירורג חזה + בדיקת תפקודי ריאה מלאה (FEV1). "
                "FEV1 מתחת ל-60% → התראה: נדרש ייעוץ קרדיולוגי/נשימתי נוסף. "
                "שדה חובה: fev1_score."
            ),
            "tasks": [
                "תאם ייעוץ כירורג חזה",
                "הזמן בדיקת תפקודי ריאה (PFT/FEV1)",
                "עדכן ציון FEV1 בתיק הקליני",
                "הפנה לייעוץ קרדיולוגי אם FEV1 < 60%",
            ],
        },
        {
            "step_key":   "lung_s7_tumor_board",
            "name":       "ישיבת צוות (Tumor Board)",
            "step_order": 7,
            "step_type":  "medical",
            "duration_days": 7,
            "coverage_categories": ["diagnostics"],
            "estimated_cost": 0,
            "gate_condition": {
                "fields": ["tumor_board_surgeon", "tumor_board_oncologist", "tumor_board_radiation"],
                "operator": "all_true"
            },
            "gate_error_msg": "נדרש אישור כירורג חזה + אונקולוג רפואי + אונקולוג קרינתי",
            "instructions": (
                "ישיבה רב-תחומית: כירורג חזה + אונקולוג רפואי + אונקולוג קרינתי. "
                "שלב 1-2 → חובת ציון FEV1 לפני תכנון ניתוח. "
                "שער: חסום עד לחתימה דיגיטלית של שלושת התפקידים."
            ),
            "tasks": [
                "קבע מועד ישיבת צוות רב-תחומי",
                "הכן חומר רקע: PET-CT, NGS, FEV1",
                "קבל אישור כירורג חזה (סמן ב-NSCLCPathwayTab)",
                "קבל אישור אונקולוג רפואי (סמן ב-NSCLCPathwayTab)",
                "קבל אישור אונקולוג קרינתי (סמן ב-NSCLCPathwayTab)",
                "תעד פרוטוקול ישיבה",
            ],
        },
        {
            "step_key":   "lung_s8_neoadjuvant",
            "name":       "טיפול טרום-ניתוחי (Neoadjuvant)",
            "step_order": 8,
            "step_type":  "medical",
            "is_optional": True,
            "duration_days": 28,
            "coverage_categories": ["advanced_tech"],
            "estimated_cost": 25000,
            "instructions": (
                "רלוונטי לשלב 3A עם גידול מעל 4 ס\"מ. "
                "כימותרפיה + אימונותרפיה להקטנת הגידול לפני ניתוח. "
                "צומת אופציונלי — מופעל לפי שיקול הצוות הרב-תחומי."
            ),
            "tasks": [
                "קבל אישור קופה לכימותרפיה טרום-ניתוחית",
                "תאם מחלקת אונקולוגיה להתחלת טיפול",
                "בצע CT מעקב לאחר 2 מחזורים",
                "הגש תביעה ביטוחית לכיסוי הטיפול",
            ],
        },
        {
            "step_key":   "lung_s9_treatment",
            "name":       "טיפול וניהול",
            "step_order": 9,
            "step_type":  "medical",
            "duration_days": 30,
            "coverage_categories": ["advanced_tech", "hospitalization"],
            "estimated_cost": 20000,
            "instructions": (
                "ניהול שוטף: תרופות, תביעות, תופעות לוואי, תמיכה פסיכוסוציאלית. "
                "אם שלב 4 → עבור לשימוש בצמתים 12-17. "
                "חיפוש ניסויים קליניים ותרופות חמלה."
            ),
            "tasks": [
                "הגש תביעת מחלה קשה לביטוח הפרטי",
                "בדוק זכאות לגמלת נכות ב-ביטוח לאומי",
                "חפש ניסויים קליניים מתאימים",
                "הפנה לתמיכה פסיכוסוציאלית",
                "עקוב אחרי תופעות לוואי ותיעד",
            ],
        },
        {
            "step_key":   "lung_s10_adjuvant",
            "name":       "טיפול משלים (Adjuvant)",
            "step_order": 10,
            "step_type":  "medical",
            "duration_days": 14,
            "sla_days":   14,
            "coverage_categories": ["advanced_tech"],
            "estimated_cost": 15000,
            "gate_condition": None,
            "instructions": (
                "לאחר ניתוח: וידוי בדיקת EGFR לרקמה שהוסרה. "
                "SLA: 14 יום מהניתוח → התראה אוטומטית: 'האם נשלחה בדיקת EGFR לרקמה שהוסרה?'. "
                "מניעת פספוס טיפול מונע (Tagrisso adjuvant) למרות זכאות."
            ),
            "tasks": [
                "שלח בדיקת EGFR לרקמה שהוסרה — SLA 14 יום",
                "קבל תוצאת EGFR מהפתולוגיה",
                "אם EGFR+ — תאם Tagrisso adjuvant עם אונקולוג",
                "הגש תביעה לכיסוי טיפול משלים",
            ],
        },
        {
            "step_key":   "lung_s11_followup",
            "name":       "מעקב (Follow-up)",
            "step_order": 11,
            "step_type":  "medical",
            "duration_days": 90,
            "coverage_categories": ["diagnostics"],
            "estimated_cost": 800,
            "instructions": (
                "CT חזה + בטן כל 3-6 חודשים למשך 5 שנים. "
                "MRI מוח — גרורות מוחיות שכיחות. "
                "יומן תזכורות אוטומטי ל-60 חודשים. "
                "מעקב לא עקבי → גילוי מאוחר של הישנות."
            ),
            "tasks": [
                "הגדר תזכורת CT כל 3-6 חודשים (5 שנים)",
                "הגדר תזכורת MRI מוח שנתית",
                "תאם מעקב אונקולוגי שוטף",
                "תעד ממצאי מעקב בתיק",
            ],
        },

        # ══════════════════════════════════════════════════════════════════════
        # שלב 4 גרורתי — 6 צמתים
        # צמתים 12-14: parallel_group — מופעלים יחד
        # ══════════════════════════════════════════════════════════════════════

        {
            "step_key":      "lung4_s1_molecular_id",
            "name":          "שלב 4 — אבחנה מולקולרית",
            "step_order":    12,
            "step_type":     "medical",
            "is_optional":   True,
            "duration_days": 14,
            "sla_days":      14,
            "parallel_group": "lung4_init",
            "coverage_categories": ["diagnostics", "advanced_tech"],
            "estimated_cost": 3500,
            "required_documents": ["NGS_report", "biopsy_report"],
            "gate_condition": {"field": "biomarker_target", "operator": "not_empty"},
            "gate_error_msg": "חסום: לא ניתן לעבור לטיפול ללא Biomarker Status",
            "instructions": (
                "מקביל לצמתים 13+14. הפעל את שלושתם יחד. "
                "צ'קליסט ביופסיה: וידוי כמות רקמה (Core Biopsy), הזמנת NGS DNA+RNA, "
                "ביופסיה נוזלית כחלופה אם רקמה לא מספקת. "
                "ספק: מכון פתולוגי / אונקוטסט. "
                "SLA: 14 יום ← אם לא הגיעה תוצאה → התראה: 'הזמן ביופסיה נוזלית'."
            ),
            "tasks": [
                "ודא כמות רקמה מספיקה — Core Biopsy",
                "הזמן NGS DNA+RNA מלא",
                "הזמן ביופסיה נוזלית אם רקמה לא מספיקה",
                "עקוב אחרי תוצאה — SLA 14 יום",
                "עדכן Biomarker בתיק לאחר תוצאה",
            ],
        },
        {
            "step_key":      "lung4_s2_access_strategy",
            "name":          "שלב 4 — אסטרטגיית גישה לטיפול",
            "step_order":    13,
            "step_type":     "financial",
            "is_optional":   True,
            "duration_days": 14,
            "parallel_group": "lung4_init",
            "coverage_categories": ["advanced_tech"],
            "estimated_cost": 0,
            "instructions": (
                "מקביל לצמתים 12+14. הפעל את שלושתם יחד. "
                "הצלב מוטציה × טבלת טיפולים (סל / חמלה / ביטוח פרטי). "
                "אם חמלה: פנה למנהל הרפואי (MSL) של חברת הפארמה לפי המוטציה. "
                "EGFR Classic → AstraZeneca 09-7406527. "
                "HER2 → Boehringer 09-9730500. "
                "ALK → Roche 09-9710111. "
                "חמלה → הכן טופס 29ג' + מסמכי בקשה."
            ),
            "tasks": [
                "הצלב Biomarker עם טבלת תרופות (ב-NSCLCPathwayTab)",
                "בדוק זכאות סל קופה",
                "צור קשר עם MSL הרלוונטי",
                "הכן טופס 29ג' אם מסלול חמלה",
                "הגש בקשה לביטוח פרטי לכיסוי תרופה",
            ],
        },
        {
            "step_key":      "lung4_s3_supportive_layer",
            "name":          "שלב 4 — מעטפת תומכת",
            "step_order":    14,
            "step_type":     "medical",
            "is_optional":   True,
            "duration_days": 14,
            "parallel_group": "lung4_init",
            "coverage_categories": ["rehabilitation"],
            "estimated_cost": 500,
            "instructions": (
                "מקביל לצמתים 12+13. הפעל את שלושתם יחד. "
                "תיאום ייעוץ פליאטיבי מוקדם ומרפאת כאב. "
                "ליווי רגשי למשפחה (Cancer Hope, עמותת חלאסרטן). "
                "כברירת מחדל: פליאציה מופעלת מיום ראשון בשלב 4."
            ),
            "tasks": [
                "תאם ייעוץ עם רפואה פליאטיבית",
                "הפנה למרפאת כאב",
                "חבר לארגון תמיכה (Cancer Hope / חלאסרטן)",
                "הפנה לעובד סוציאלי רפואי",
            ],
        },
        {
            "step_key":      "lung4_s4_resistance_junction",
            "name":          "שלב 4 — ניהול עמידות",
            "step_order":    15,
            "step_type":     "medical",
            "is_optional":   True,
            "duration_days": 21,
            "coverage_categories": ["diagnostics", "advanced_tech"],
            "estimated_cost": 4000,
            "instructions": (
                "טריגר: התקדמות מחלה (Progression) בהדמיה. "
                "ביופסיה חוזרת לחיפוש מוטציות עמידות משניות (MET לאחר EGFR, T790M). "
                "NGS חוזר: עדכון קו טיפול במערכת (קו 2). "
                "SLA: תיאום ביופסיה תוך 7 ימים מאישור התקדמות מחלה."
            ),
            "tasks": [
                "אשר התקדמות מחלה עם אונקולוג",
                "תאם ביופסיה חוזרת — SLA 7 ימים",
                "הזמן NGS חוזר",
                "עדכן Biomarker וקו טיפול בתיק",
                "חפש תרופת קו 2 בסל / חמלה",
            ],
        },
        {
            "step_key":         "lung4_s5_exploration_gate",
            "name":             "שלב 4 — אופק רפואי (Exploration Gate)",
            "step_order":       16,
            "step_type":        "medical",
            "is_optional":      True,
            "is_exploration_gate": True,
            "duration_days":    30,
            "coverage_categories": ["advanced_tech"],
            "estimated_cost":   2000,
            "gate_condition": {
                "checklist": [
                    "international_centers_checked",
                    "clinical_trials_searched",
                    "off_label_reviewed"
                ],
                "operator": "all_answered"
            },
            "gate_error_msg": "חסום: לפני מעבר להוספיס יש להשלים את צ'קליסט אופק רפואי",
            "instructions": (
                "טריגר: מיצוי קווי טיפול בסל. "
                "שלושה מסלולים לבדוק: "
                "(א) מרכזים בחו'ל: MD Anderson, מרכזים בגרמניה — ריכוז תיק באנגלית, שינוע בלוקים. "
                "(ב) ניסויים קליניים: ClinicalTrials.gov Phase 1-2, Single Patient IND. "
                "(ג) Off-label: Case Reports, ספרות, בקשת חמלה אישית לחברת פארמה. "
                "שער: חסום לפני מעבר להוספיס — חובת Checklist שלושת המסלולים."
            ),
        },
        {
            "step_key":      "lung4_s6_comfort_transition",
            "name":          "שלב 4 — מעבר לחמלה ונוחות",
            "step_order":    17,
            "step_type":     "medical",
            "is_optional":   True,
            "duration_days": None,
            "coverage_categories": ["rehabilitation"],
            "estimated_cost": 0,
            "gate_condition": {
                "field": "exploration_gate_complete",
                "operator": "is_true"
            },
            "gate_error_msg": "חסום: השלם את שלב 'אופק רפואי' לפני מעבר להוספיס",
            "instructions": (
                "הפעלת הוספיס בית דרך קופת חולים (צבר רפואה). "
                "מעבר מהוספיס פעיל (טיפול תומך + ביולוגי) לנוחות מלאה. "
                "שער: חסום לגמרי ללא אישור Exploration Gate. "
                "ספקים: צבר רפואה, מרכזי הוספיס קהילתיים."
            ),
        },
    ],
}
