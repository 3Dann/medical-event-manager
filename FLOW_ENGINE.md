# מנוע זרימת עבודה — תיעוד טכני מפורט
## Orly Medical — Flow Engine
**גרסה:** 1.0 | **תאריך:** אפריל 2026

---

## 1. מטרה ועקרונות

מנוע הזרימה (Flow Engine) הוא מודול מרכזי המאפשר הגדרה, הרצה, ומעקב אחר תהליכים מובנים (Workflows) לניהול מסע המטופל.

### 1.1 מה פותר המנוע?

ללא מנוע זרימה, כל תהליך (הגשת תביעה, ערר, קבלת חוות דעת) מנוהל ידנית ואין נראות לשלב הנוכחי, מי אחראי, ומה הצעד הבא. המנוע מספק:

- **מבנה:** כל תהליך מחולק לשלבים ברורים עם סדר מוגדר
- **אחריות:** כל שלב משויך לאדם / תפקיד אחראי
- **מעקב:** סטטוס בזמן אמת + היסטוריה מלאה
- **אוטומציה:** מעברים אוטומטיים בהתמלאות תנאים
- **תזכורות:** התראות על דדליינים קרובים

### 1.2 עקרונות עיצוב

- **Template / Instance separation** — תבנית (Template) מוגדרת פעם אחת, מורצת (Instance) פעמים רבות לכל מטופל
- **State Machine** — כל Instance נמצא תמיד במצב (State) אחד מוגדר
- **Audit Log** — כל פעולה נרשמת עם זמן + משתמש + נתונים
- **Loosely Coupled** — המנוע מחובר למודלים קיימים (Claim, Patient, Document) אך אינו תלוי בהם

---

## 2. ארכיטקטורה כללית

```
┌─────────────────────────────────────────────────────────────┐
│                      FLOW ENGINE                            │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Templates   │───▶│  Instances   │───▶│    Steps     │  │
│  │  (תבניות)    │    │  (הרצות)     │    │   (שלבים)    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │Step Templates│    │  Transitions │    │   Actions /  │  │
│  │  (שלבי תבנית)│    │   (מעברים)   │    │  Audit Log   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                                         │
         ▼                                         ▼
┌─────────────────┐                    ┌─────────────────────┐
│  Existing Models│                    │   Notifications     │
│  Patient, Claim,│                    │   (התראות)          │
│  Document, Node │                    └─────────────────────┘
└─────────────────┘
```

---

## 3. מודל הנתונים המלא

### 3.1 WorkflowTemplate — תבנית זרימה

```python
class WorkflowTemplate(Base):
    __tablename__ = "workflow_templates"

    id          = Column(Integer, primary_key=True)
    name        = Column(String, nullable=False)        # "הגשת תביעה לקופ"ח"
    description = Column(Text, nullable=True)
    category    = Column(String, nullable=True)         # "claim" / "appeal" / "treatment"
    is_active   = Column(Boolean, default=True)
    created_by  = Column(Integer, ForeignKey("users.id"))
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, onupdate=func.now())

    step_templates = relationship("WorkflowStepTemplate",
                                  order_by="WorkflowStepTemplate.step_order",
                                  cascade="all, delete-orphan")
    instances      = relationship("WorkflowInstance", back_populates="template")
    creator        = relationship("User", foreign_keys=[created_by])
```

**שדות מפתח:**
- `category` — מאפשר סינון תבניות לפי סוג (תביעה, ערר, טיפול)
- `is_active` — ניתן לבטל תבנית מבלי למחוק instances קיימים

---

### 3.2 WorkflowStepTemplate — שלב בתבנית

```python
class WorkflowStepTemplate(Base):
    __tablename__ = "workflow_step_templates"

    id           = Column(Integer, primary_key=True)
    template_id  = Column(Integer, ForeignKey("workflow_templates.id"))
    step_key     = Column(String, nullable=False)      # מזהה ייחודי: "collect_docs"
    name         = Column(String, nullable=False)      # "איסוף מסמכים"
    description  = Column(Text, nullable=True)         # הסבר מה לעשות בשלב
    step_order   = Column(Integer, nullable=False)     # 1, 2, 3...
    assignee_role= Column(String, nullable=True)       # "manager" / "patient" / "admin"
    duration_days= Column(Integer, nullable=True)      # ימים צפויים לשלב
    is_optional  = Column(Boolean, default=False)      # שלב אופציונלי?
    auto_advance = Column(Boolean, default=False)      # מתקדם אוטומטית?
    instructions = Column(Text, nullable=True)         # הנחיות מפורטות
    template     = relationship("WorkflowTemplate", back_populates="step_templates")
```

**שדות מפתח:**
- `step_key` — מזהה טקסטואלי ייחודי (משמש ל-transition logic)
- `duration_days` — לחישוב due_date אוטומטי כשנוצר instance
- `auto_advance` — שלב שמתקדם לבד (למשל "המתנה לתגובה" → אחרי X ימים)

---

### 3.3 WorkflowInstance — הרצה ספציפית

```python
class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id              = Column(Integer, primary_key=True)
    template_id     = Column(Integer, ForeignKey("workflow_templates.id"))
    patient_id      = Column(Integer, ForeignKey("patients.id"))
    created_by      = Column(Integer, ForeignKey("users.id"))
    title           = Column(String, nullable=True)       # "תביעה ניתוח — ינואר 2026"
    status          = Column(String, default="active")    # active/completed/cancelled/paused
    current_step_id = Column(Integer, ForeignKey("workflow_steps.id"), nullable=True)
    linked_claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    linked_node_id  = Column(Integer, ForeignKey("nodes.id"), nullable=True)
    context_data    = Column(Text, nullable=True)         # JSON — נתוני הקשר חופשיים
    started_at      = Column(DateTime, server_default=func.now())
    completed_at    = Column(DateTime, nullable=True)
    due_date        = Column(DateTime, nullable=True)

    template     = relationship("WorkflowTemplate", back_populates="instances")
    patient      = relationship("Patient")
    steps        = relationship("WorkflowStep", back_populates="instance",
                                order_by="WorkflowStep.step_order",
                                cascade="all, delete-orphan")
    creator      = relationship("User", foreign_keys=[created_by])
    current_step = relationship("WorkflowStep", foreign_keys=[current_step_id])
    linked_claim = relationship("Claim", foreign_keys=[linked_claim_id])
```

**סטטוסים אפשריים:**
- `active` — זורם, בטיפול
- `completed` — כל השלבים הושלמו
- `cancelled` — בוטל (עם סיבה ב-context_data)
- `paused` — מושהה זמנית

---

### 3.4 WorkflowStep — שלב בהרצה ספציפית

```python
class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id            = Column(Integer, primary_key=True)
    instance_id   = Column(Integer, ForeignKey("workflow_instances.id"))
    step_key      = Column(String, nullable=False)
    name          = Column(String, nullable=False)
    step_order    = Column(Integer, nullable=False)
    status        = Column(String, default="pending")  # pending/active/completed/skipped
    assignee_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date      = Column(DateTime, nullable=True)
    started_at    = Column(DateTime, nullable=True)
    completed_at  = Column(DateTime, nullable=True)
    notes         = Column(Text, nullable=True)
    result_data   = Column(Text, nullable=True)  # JSON — פלט השלב (למשל: סכום מאושר)
    is_optional   = Column(Boolean, default=False)

    instance  = relationship("WorkflowInstance", back_populates="steps")
    assignee  = relationship("User", foreign_keys=[assignee_id])
    actions   = relationship("WorkflowAction", back_populates="step",
                             order_by="WorkflowAction.created_at",
                             cascade="all, delete-orphan")
```

**סטטוסי שלב:**
- `pending` — טרם התחיל
- `active` — בטיפול כרגע
- `completed` — הושלם
- `skipped` — דולג (שלב אופציונלי)

---

### 3.5 WorkflowAction — לוג פעולות

```python
class WorkflowAction(Base):
    __tablename__ = "workflow_actions"

    id          = Column(Integer, primary_key=True)
    step_id     = Column(Integer, ForeignKey("workflow_steps.id"))
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String, nullable=False)  # ראה טבלת סוגים למטה
    description = Column(Text, nullable=True)
    data        = Column(Text, nullable=True)     # JSON — נתונים נוספים
    created_at  = Column(DateTime, server_default=func.now())

    step = relationship("WorkflowStep", back_populates="actions")
    user = relationship("User", foreign_keys=[user_id])
```

**סוגי פעולות (action_type):**

| קוד | תיאור |
|-----|--------|
| `step_started` | שלב הופעל |
| `step_completed` | שלב הושלם |
| `step_skipped` | שלב דולג |
| `note_added` | הוספת הערה |
| `assignee_changed` | שינוי אחראי |
| `due_date_changed` | שינוי דדליין |
| `status_changed` | שינוי סטטוס |
| `document_attached` | מסמך צורף |
| `auto_advanced` | מעבר אוטומטי |
| `instance_paused` | Instance הושהה |
| `instance_resumed` | Instance חודש |
| `instance_cancelled` | Instance בוטל |

---

## 4. State Machine — לוגיקת מעברים

### 4.1 מצבי Instance

```
                    ┌──────────┐
                    │ created  │
                    └────┬─────┘
                         │ start()
                         ▼
          ┌──────── active ────────┐
          │          │             │
          │     complete_step()    │
          │          │             │
          ▼          ▼             │
       paused   next_step()        │
          │          │             │
          │          ▼             │
          └────▶ completed ◀───────┘
                                cancel()
                    ▲
                cancelled
```

### 4.2 מצבי Step

```
pending ──activate()──▶ active ──complete()──▶ completed
   │                                                │
   └──────────skip()──────────────────────────▶ skipped
```

### 4.3 Engine — פונקציות מרכזיות

```python
class FlowEngine:

    @staticmethod
    def create_instance(template_id, patient_id, created_by,
                        title=None, linked_claim_id=None, db=None):
        """
        יוצר instance חדש מתבנית.
        מעתיק את כל ה-step_templates ל-WorkflowStep.
        מחשב due_date לכל שלב לפי duration_days.
        מפעיל את השלב הראשון אוטומטית.
        """

    @staticmethod
    def advance_step(instance_id, step_id, user_id,
                     notes=None, result_data=None, db=None):
        """
        מסמן שלב כהושלם ומפעיל את השלב הבא.
        רושם WorkflowAction מסוג step_completed ו-step_started.
        אם אין שלב הבא — מסמן instance כ-completed.
        """

    @staticmethod
    def skip_step(instance_id, step_id, user_id, reason=None, db=None):
        """
        מדלג על שלב אופציונלי ומפעיל את הבא.
        מעלה שגיאה אם השלב אינו אופציונלי.
        """

    @staticmethod
    def get_instance_summary(instance_id, db=None):
        """
        מחזיר סיכום מלא: instance + כל השלבים + progress %.
        """

    @staticmethod
    def check_overdue(db=None):
        """
        בודק steps עם due_date שעברה.
        מחזיר רשימת steps שצריך לשלוח עליהם התראה.
        """
```

---

## 5. API Routes

### Base URL: `/api/workflows`

### 5.1 Templates

| Method | Path | תיאור |
|--------|------|--------|
| GET | `/templates` | רשימת כל התבניות |
| POST | `/templates` | יצירת תבנית חדשה |
| GET | `/templates/{id}` | תבנית + שלביה |
| PUT | `/templates/{id}` | עדכון תבנית |
| DELETE | `/templates/{id}` | מחיקת תבנית (רק אם אין instances) |
| POST | `/templates/{id}/steps` | הוספת שלב לתבנית |
| PUT | `/templates/{id}/steps/{step_id}` | עדכון שלב |
| DELETE | `/templates/{id}/steps/{step_id}` | מחיקת שלב |

### 5.2 Instances

| Method | Path | תיאור |
|--------|------|--------|
| GET | `/instances` | כל ה-instances (עם פילטר patient_id, status) |
| POST | `/instances` | יצירת instance חדש מתבנית |
| GET | `/instances/{id}` | Instance מלא + שלבים + לוג |
| PUT | `/instances/{id}` | עדכון כותרת / linked_claim |
| POST | `/instances/{id}/pause` | השהיה |
| POST | `/instances/{id}/resume` | חידוש |
| POST | `/instances/{id}/cancel` | ביטול עם סיבה |
| GET | `/patients/{patient_id}/instances` | כל ה-workflows של מטופל |

### 5.3 Steps

| Method | Path | תיאור |
|--------|------|--------|
| POST | `/instances/{id}/steps/{step_id}/advance` | השלמת שלב + מעבר לבא |
| POST | `/instances/{id}/steps/{step_id}/skip` | דילוג על שלב אופציונלי |
| PUT | `/instances/{id}/steps/{step_id}` | עדכון assignee / due_date / notes |
| GET | `/instances/{id}/steps/{step_id}/actions` | לוג פעולות של שלב |
| POST | `/instances/{id}/steps/{step_id}/notes` | הוספת הערה |

---

## 6. תבניות מובנות (Built-in Templates)

### 6.1 הגשת תביעה ביטוחית

```
שלב 1: איסוף מסמכים (5 ימים)
  - אוסף מסמכים רפואיים רלוונטיים
  - מוציא חשבוניות / קבלות
  - צילום תעודות ביטוח

שלב 2: מילוי טפסי תביעה (2 ימים)
  - מורדים טפסי חברה ספציפיים
  - מילוי פרטים + חתימות

שלב 3: הגשת התביעה (1 יום)
  - שליחה לחברת הביטוח
  - תיעוד מספר אסמכתה

שלב 4: מעקב ועדכון (14 ימים)
  - בדיקת קבלת התביעה
  - מענה לשאלות חברת הביטוח

שלב 5: קבלת תשובה
  - עדכון סטטוס (אושר / נדחה / חלקי)
  - עדכון סכום מאושר בתביעה
```

### 6.2 ערר על דחיית תביעה

```
שלב 1: ניתוח סיבת הדחייה (3 ימים)
שלב 2: איסוף מסמכים תומכים (7 ימים)
שלב 3: קבלת חוות דעת רפואית (14 ימים)
שלב 4: ניסוח מכתב ערר (3 ימים)
שלב 5: הגשת הערר
שלב 6: שמיעת הערר [אופציונלי]
שלב 7: קבלת תשובה סופית
```

### 6.3 קבלת חוות דעת שנייה

```
שלב 1: חיפוש רופא מומחה (7 ימים)
שלב 2: העברת תיק רפואי
שלב 3: קביעת תור
שלב 4: ביקור אצל המומחה
שלב 5: קבלת חוות דעת כתובה
שלב 6: שילוב בתיק המטופל
```

### 6.4 הגשה לביטוח לאומי

```
שלב 1: בדיקת זכאות ראשונית
שלב 2: איסוף מסמכים (דוחות רפואיים, טפסי BL)
שלב 3: מילוי טפסי תביעה
שלב 4: הגשה למשרד ביטוח לאומי
שלב 5: ועדה רפואית [אופציונלי]
שלב 6: קבלת החלטה
שלב 7: ערעור [אופציונלי]
```

### 6.5 תהליך אשפוז מתוכנן

```
שלב 1: תיאום מנהלי עם בית החולים
שלב 2: קבלת אישורים מקופת חולים
שלב 3: הכנה טרום-אשפוז (בדיקות דם, הנחיות)
שלב 4: כניסה לאשפוז
שלב 5: שחרור + קבלת מסמכים
שלב 6: תיאום המשך טיפול
שלב 7: ביקור מעקב
```

---

## 7. ממשק משתמש (Frontend)

### 7.1 רכיבים ראשיים

**WorkflowPanel (לוח צד בדף מטופל)**
- רשימת כל ה-workflows הפעילים של המטופל
- כפתור "הפעל זרימה חדשה"
- סטטוס ו-% התקדמות לכל instance

**WorkflowTimeline (ציר זמן)**
- הצגה ויזואלית של כל השלבים
- שלב נוכחי מודגש
- שלבים שעברו / עתידיים בצבעים שונים
- due_date על כל שלב

**StepCard (כרטיס שלב)**
- שם השלב + תיאור + הנחיות
- כפתורי "השלם" / "דלג"
- שדה הערות
- שיוך אחראי
- לוג פעולות מתקפל

**WorkflowTemplateEditor (עורך תבניות)**
- Drag & Drop לסידור שלבים
- הגדרת תפקיד אחראי לכל שלב
- מספר ימים צפוי
- סימון שלב כאופציונלי

### 7.2 שילוב בדפי קיימים

- **PatientDetail** — WorkflowPanel בעמודה הצדדית
- **PatientClaims** — כפתור "הפעל זרימת תביעה" ליד כל תביעה
- **ManagerDashboard** — ווידג'ט workflows עם דדליינים קרובים

---

## 8. מבנה קבצים

### Backend
```
backend/
├── models.py              ← + WorkflowTemplate, WorkflowStepTemplate,
│                              WorkflowInstance, WorkflowStep, WorkflowAction
├── flow_engine.py         ← FlowEngine class (לוגיקת State Machine)
├── routes/
│   └── workflows.py       ← כל ה-API routes
└── data/
    └── workflow_templates_seed.py  ← 5 תבניות מובנות
```

### Frontend
```
frontend/src/
├── pages/manager/
│   ├── WorkflowsPage.jsx           ← דף ניהול תבניות
│   └── WorkflowInstancePage.jsx    ← דף הרצה ספציפית
└── components/workflows/
    ├── WorkflowPanel.jsx           ← פאנל צד בדף מטופל
    ├── WorkflowTimeline.jsx        ← ציר זמן ויזואלי
    ├── StepCard.jsx                ← כרטיס שלב
    ├── WorkflowTemplateEditor.jsx  ← עורך תבניות
    └── NewWorkflowModal.jsx        ← מודל יצירת instance חדש
```

---

## 9. אבטחה והרשאות

| פעולה | הרשאה נדרשת |
|-------|-------------|
| צפייה בתבניות | manager / admin |
| יצירת / עריכת תבניות | manager / admin |
| מחיקת תבנית | admin בלבד |
| יצירת instance | manager |
| השלמת / דילוג שלב | מנהל המטופל / אדמין |
| ביטול instance | manager / admin |
| צפייה בלוג | manager / admin |

---

## 10. הרחבות עתידיות

- **Webhooks** — שליחת POST חיצוני כשמתרחש מעבר שלב
- **Conditional Branches** — זרימות מסתעפות לפי תוצאה (אושר / נדחה → זרימה שונה)
- **SLA Monitoring** — דוח עמידה בזמנים לפי חברת ביטוח
- **Templates Marketplace** — שיתוף תבניות בין מנהלי אירוע
- **Mobile Push Notifications** — התראות לנייד על דדליינים

---

*מסמך זה מלווה את פיתוח Flow Engine ב-Orly Medical ומתעדכן עם כל שינוי משמעותי.*
