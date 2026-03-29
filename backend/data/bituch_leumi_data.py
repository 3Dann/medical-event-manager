"""
רשימת זכאויות ביטוח לאומי — נתוני ברירת מחדל
מחולקות לקיימות (existing), פוטנציאליות (potential), צפויות (projected)
"""

BITUCH_LEUMI_ENTITLEMENTS = [
    # ── זכאויות קיימות לכל מבוטח ──────────────────────────────────────
    {
        "entitlement_type": "existing",
        "title": "דמי מחלה",
        "description": "תשלום דמי מחלה לשכיר מהיום הרביעי להיעדרות עקב מחלה. הכיסוי: 50% מהשכר ביום ד', 100% מיום ה' ואילך. תקרה: 1.5 פעמים השכר הממוצע.",
        "amount": None,
        "is_approved": True,
    },
    {
        "entitlement_type": "existing",
        "title": "ביטוח בריאות ממלכתי",
        "description": "זכאות לשירותי בריאות מקופת החולים. כל תושב ישראל זכאי לסל שירותי הבריאות.",
        "amount": None,
        "is_approved": True,
    },
    {
        "entitlement_type": "existing",
        "title": "גמלת שמירת היריון",
        "description": "לעובדת שנאלצת להפסיק עבודתה בשל סיכון להיריון — תשלום חודשי. רלוונטי בהתאם למצב.",
        "amount": None,
        "is_approved": False,
    },

    # ── זכאויות פוטנציאליות ─────────────────────────────────────────────
    {
        "entitlement_type": "potential",
        "title": "נכות כללית",
        "description": "מי שאינו מסוגל לעבוד עקב ליקוי גופני, שכלי או נפשי. דרגת אי-כושר מינימלית: 60% (40% בתנאים מסוימים). יש להגיש תביעה לוועדה רפואית.",
        "amount": 3500,
        "is_approved": False,
    },
    {
        "entitlement_type": "potential",
        "title": "שיקום מקצועי",
        "description": "סיוע בשיקום תעסוקתי — הכשרה מקצועית, לימודים, ייעוץ תעסוקתי. זכאים: נכים, נפגעי עבודה, נפגעי תאונות דרכים.",
        "amount": None,
        "is_approved": False,
    },
    {
        "entitlement_type": "potential",
        "title": "גמלת סיעוד",
        "description": "לקשיש או נכה הזקוק לעזרה בפעולות יום-יום. מותנה בבדיקת תלות תפקודית. הגמלה ניתנת בשירותים או בכסף.",
        "amount": 5000,
        "is_approved": False,
    },
    {
        "entitlement_type": "potential",
        "title": "נפגע עבודה",
        "description": "פגיעה בעת עבודה או בדרך לעבודה. זכאות לדמי פגיעה (75% משכר ב-3 חודשים ראשונים), קצבת נכות מעבודה, שיקום.",
        "amount": None,
        "is_approved": False,
    },
    {
        "entitlement_type": "potential",
        "title": "תגמול נפגעי פעולות איבה",
        "description": "פגיעה כתוצאה מפעולת איבה. זכאות לתגמולים, טיפול רפואי, שיקום.",
        "amount": None,
        "is_approved": False,
    },
    {
        "entitlement_type": "potential",
        "title": "קצבת ילד נכה",
        "description": "לילד עד גיל 18 עם ליקוי גופני, שכלי או נפשי הדורש השגחה יתרה. תלוי בדרגת הנכות.",
        "amount": 2800,
        "is_approved": False,
    },
    {
        "entitlement_type": "potential",
        "title": "אבטלה / דמי אבטלה",
        "description": "לעובד שכיר שפוטר ואינו מסוגל למצוא עבודה. תנאי זכאות: תקופת אכשרה של 12 חודשים.",
        "amount": None,
        "is_approved": False,
    },

    # ── זכאויות צפויות — שנה הקרובה ──────────────────────────────────
    {
        "entitlement_type": "projected",
        "title": "הגדלת קצבת נכות",
        "description": "בחינה מחדש של דרגת נכות בוועדה רפואית — פוטנציאל להגדלת הקצבה בהתאם להחמרה.",
        "amount": None,
        "is_approved": False,
    },
    {
        "entitlement_type": "projected",
        "title": "ועדת רפואית — עדכון נכות",
        "description": "במידה ומצב בריאותי השתנה — יש לפנות לוועדה רפואית לעדכון שיעור הנכות ובהתאם הקצבה.",
        "amount": None,
        "is_approved": False,
    },
    {
        "entitlement_type": "projected",
        "title": "תוספת תלויים",
        "description": "תוספת לקצבת נכות עבור בן/בת זוג או ילדים תלויים. יש לדווח על שינויים במצב משפחתי.",
        "amount": 500,
        "is_approved": False,
    },
    {
        "entitlement_type": "projected",
        "title": "זכאות לשיקום סיעודי",
        "description": "בסיום אשפוז — בדיקת זכאות לשיקום ממוסד. יש להגיש בקשה 30 יום לפני שחרור.",
        "amount": None,
        "is_approved": False,
    },
]
