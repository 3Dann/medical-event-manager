# CLAUDE.md — Orly Medical: מנהל אירוע רפואי

קובץ זה מסונכרן ב-git ומספק הקשר לכל שיחה חדשה, בכל מכונה.

---

## מי המשתמש

Danny — מפתח הפרויקט. עובד בין iMac (DannyT@danys-imac.local) לבין Windows laptop.
git user: 3Dann

---

## מה המערכת

מערכת ניהול אירוע רפואי (Case Management) עבור מנהלי אירוע רפואי.
מנהלת מסע המטופל מרגע האבחון ועד החלמה: ביטוחים, תביעות, מסמכים, אסטרטגיה פיננסית-רפואית, וזרימות עבודה.

**Production:** `https://app-production-5817.up.railway.app`

---

## Stack

| שכבה | טכנולוגיה |
|------|-----------|
| Backend | FastAPI (Python) + SQLAlchemy + SQLite |
| Frontend | React + Vite + Tailwind CSS |
| Auth | JWT + 2FA (TOTP / Email) |
| Deploy | Railway (Volume ב-`/data` לDB ולמסמכים) |

---

## מבנה הפרויקט

```
medical-event-manager/
├── backend/
│   ├── main.py               # FastAPI app, CORS, route registration, seed functions
│   ├── models.py             # SQLAlchemy models (445 שורות)
│   ├── auth.py               # JWT, bcrypt, decorators
│   ├── database.py           # DB session
│   ├── flow_engine.py        # Flow Engine logic (510 שורות)
│   ├── coverage_advisor.py   # כיסוי ביטוחי לכל שלב (289 שורות)
│   ├── workflow_suggest.py   # המלצות זרימות לפי מטופל (290 שורות)
│   └── routes/
│       ├── auth.py, patients.py, insurance.py, claims.py
│       ├── strategy.py, responsiveness.py, documents.py
│       ├── doctors.py, admin.py, public.py, learning.py
│       ├── import_data.py, private_import.py
│       └── workflows.py      # כל ה-API של מנוע הזרימה (685 שורות)
├── frontend/src/
│   ├── pages/manager/
│   │   ├── ManagerDashboard.jsx
│   │   ├── PatientDetail.jsx     # 5 טאבים + WorkflowPanel תחתון
│   │   ├── PatientClaims.jsx, PatientInsurance.jsx
│   │   ├── PatientDocuments.jsx
│   │   ├── PatientStrategy.jsx   # אסטרטגיה + מנוע זרימה (677 שורות)
│   │   ├── WorkflowsPage.jsx     # תצוגת תבניות בלבד (125 שורות)
│   │   ├── DoctorsDatabase.jsx, ResponsivenessPage.jsx
│   │   ├── FeedbackInbox.jsx, AdminPage.jsx, ProfilePage.jsx
│   │   └── ManagerLayout.jsx
│   └── components/workflows/
│       ├── WorkflowPanel.jsx     # פאנל מלא עם advance/skip/pause/cancel (290 שורות)
│       ├── StepCard.jsx          # כרטיס שלב עם כפתורי פעולה (145 שורות)
│       └── NewWorkflowModal.jsx  # יצירת instance חדש (112 שורות)
```

---

## מה קיים ועובד

### Backend — כל ה-routes רשומים ופועלים:
- **אימות:** JWT, 2FA (TOTP+Email), שחזור סיסמה, הגנת נתיבים
- **מטופלים:** CRUD מלא, חיפוש/סינון, שיוך קופ"ח+ביטוח
- **מסע מטופל:** ציר זמן עם 5 שלבים קבועים + צמתים מותאמים אישית
- **ביטוחים:** מקורות ביטוח, כיסויים לפי קטגוריה
- **תביעות:** CRUD, סטטוסים, draft→approve flow, קישור לworkflow step
- **אסטרטגיה:** המלצות תביעות, מטריצת כיסויים, תובנות learning
- **מסמכים:** העלאה עד 20MB, קטגוריות, הורדה/מחיקה
- **רופאים:** ~370 רשומות, חיפוש/סינון, ייצוא Excel
- **ציוני רספונסיביות:** דירוג חברות ביטוח
- **Flow Engine:** templates, instances, steps, advance/skip/pause/cancel/notes, coverage per step, audit log, suggestions

### Frontend:
- **PatientDetail:** פאנל WorkflowPanel תחתון עם כל הפעולות (advance/skip/pause/cancel)
- **PatientStrategy → טאב "זרימות מנוע":** מציג instances לפי מטופל, draft claims לאישור, המלצות זרימה
- **WorkflowsPage:** תצוגת תבניות בלבד — read-only

---

## מה חסר / צעדים הבאים

### עדיפות גבוהה
- [ ] **WorkflowsPage** — כרגע רק מציגה תבניות. צריכה: ניהול תבניות (עריכה/יצירה), רשימת כל ה-instances בארגון, סינון/חיפוש
- [ ] **מערכת התראות** (FR-NOT) — notification bell, התראות על דדליינים, חידוש ביטוחים

### עדיפות בינונית
- [ ] **דוחות וייצוא** (FR-REP) — דוח סיכום מטופל PDF/Excel, גרף ציר זמן
- [ ] **SMTP אמיתי** — כרגע 2FA ותזכורות ללא שליחת mail אמיתית

### עדיפות נמוכה
- [ ] **פורטל מטופל** (FR-PAT) — מטופל מחובר רואה את מסעו האישי

---

## מודל נתונים — Flow Engine

```
WorkflowTemplate    — תבנית (שם, קטגוריה, condition_tags, specialty, is_builtin, is_journey)
WorkflowStepTemplate — שלבי תבנית (step_key, name, step_order, duration_days, coverage_categories, step_type, estimated_cost)
WorkflowInstance    — הרצה (template_id, patient_id, current_step, status, title, linked_claim_id)
WorkflowStep        — שלב בהרצה (instance_id, step_order, status: pending/active/completed/skipped, notes, due_date)
WorkflowAction      — audit log (step_id, action_type, triggered_by, timestamp, data)
WorkflowStepCoverage — כיסוי ביטוחי לשלב
```

**Journey Workflow:** כל מטופל מקבל instance של תבנית `is_journey=True` שמתאים לציר הזמן של מסע המטופל.

---

## החלטות ארכיטקטוניות חשובות

- **SQLite + Railway Volume** — DB שומר ב-`/data/medical_event_manager.db`; Volume מאפשר persistence
- **Seed functions** — `seed_workflow_templates()` ו-`seed_journey_workflows()` רצות ב-startup (idempotent)
- **Draft Claims Flow** — תביעות שנוצרות אוטומטית ע"י Flow Engine מקבלות status='draft' עד אישור ידני
- **ResizablePanel** — component מותאם לפאנלים ניתנים לשינוי גודל (horizontal/vertical)
- **Coverage Advisor** — מחשב כיסוי ביטוחי לכל שלב בזרימה לפי הביטוחים של המטופל
- **Workflow Suggest** — מנוע המלצות שממפה condition_tags של מטופל לתבניות מתאימות

---

## הרצה מקומית

```bash
./start.sh        # מריץ backend (port 8000) + frontend (port 5173)
```

Frontend מתחבר ל-backend דרך Vite proxy (מוגדר ב-vite.config.js).

---

## Deploy

כל push ל-main → Railway מ-deploy אוטומטית (~2 דקות).
```bash
git add . && git commit -m "תיאור" && git push
```
