# CLAUDE.md — Orly Medical: מנהל אירוע רפואי

קובץ זה מסונכרן ב-git ומספק הקשר לכל שיחה חדשה, בכל מכונה.

---

## מי המשתמש

Danny — מפתח הפרויקט. עובד על MacBook Pro M5 Pro (hostname: `mac`).
git user: 3Dann

---

## מה המערכת

מערכת ניהול אירוע רפואי (Case Management) עבור מנהלי אירוע רפואי.
מנהלת מסע המטופל מרגע האבחון ועד החלמה: ביטוחים, תביעות, מסמכים, תרופות, אסטרטגיה פיננסית-רפואית, וזרימות עבודה.

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
│   ├── main.py               # FastAPI app, CORS, route registration, seed + migrations
│   ├── models.py             # SQLAlchemy models — כולל DrugEntry, PatientMedication
│   ├── auth.py               # JWT, bcrypt, decorators
│   ├── database.py           # DB session
│   ├── drug_list.py          # רשימת 1,162 תרופות + HEBREW_NAMES dict
│   ├── drug_updater.py       # seed_drugs(), run_drug_update() מ-openFDA, COMMON_DOSAGES
│   ├── flow_engine.py        # Flow Engine logic
│   ├── coverage_advisor.py   # כיסוי ביטוחי לכל שלב
│   ├── workflow_suggest.py   # המלצות זרימות לפי מטופל
│   └── routes/
│       ├── auth.py, patients.py, insurance.py, claims.py
│       ├── strategy.py, responsiveness.py, documents.py
│       ├── doctors.py, admin.py, public.py, learning.py
│       ├── import_data.py, private_import.py
│       ├── medications.py    # CRUD תרופות מטופל + חיפוש DB + openFDA enrich
│       └── workflows.py
├── frontend/src/
│   ├── pages/manager/
│   │   ├── ManagerDashboard.jsx
│   │   ├── PatientDetail.jsx         # 6 טאבים כולל תרופות + WorkflowPanel תחתון
│   │   ├── PatientMedications.jsx    # רשימת תרופות + אינטראקציות + זיהוי ממסמכים
│   │   ├── PatientClaims.jsx, PatientInsurance.jsx
│   │   ├── PatientDocuments.jsx
│   │   ├── PatientStrategy.jsx
│   │   ├── WorkflowsPage.jsx
│   │   ├── IntakeWizard.jsx          # 7 שלבים מורחב: דמוגרפיה, כתובת, קשר חירום,
│   │   │                             #   מידע רפואי, תרופות, הערכות תפקודיות, חתימות
│   │   ├── AdminPage.jsx             # כולל Drug Database panel
│   │   ├── DoctorsDatabase.jsx, ResponsivenessPage.jsx
│   │   ├── FeedbackInbox.jsx, ProfilePage.jsx
│   │   └── ManagerLayout.jsx
│   └── components/
│       ├── MedicationAutocomplete.jsx  # חיפוש תרופות מ-DB + openFDA enrich ברקע
│       ├── DrugFormComponents.jsx      # MedicationCard, MedRow, IndicationCombobox,
│       │                               #   DosageCombobox, DropdownPortal, DRUG_INDICATION_MAP
│       ├── AddressAutocomplete.jsx
│       └── workflows/
│           ├── WorkflowPanel.jsx
│           ├── StepCard.jsx
│           └── NewWorkflowModal.jsx
```

---

## מה קיים ועובד

### Backend:
- **אימות:** JWT, 2FA (TOTP+Email), שחזור סיסמה, הגנת נתיבים
- **מטופלים:** CRUD מלא, חיפוש/סינון, שיוך קופ"ח+ביטוח
- **מסע מטופל:** ציר זמן עם 5 שלבים קבועים + צמתים מותאמים אישית
- **ביטוחים:** מקורות ביטוח, כיסויים לפי קטגוריה, ייבוא PDF/Excel (private_import)
- **תביעות:** CRUD, סטטוסים, draft→approve flow, קישור לworkflow step
- **אסטרטגיה:** המלצות תביעות, מטריצת כיסויים, תובנות learning
- **מסמכים:** העלאה עד 20MB, קטגוריות, הורדה/מחיקה
- **רופאים:** ~370 רשומות, חיפוש/סינון, ייצוא Excel
- **ציוני רספונסיביות:** דירוג חברות ביטוח
- **Flow Engine:** templates, instances, steps, advance/skip/pause/cancel/notes, coverage per step, audit log, suggestions
- **מערכת תרופות** (חדש):
  - `DrugEntry` table — 1,162 תרופות, seed מ-drug_list.py, עדכון שבועי מ-openFDA
  - `PatientMedication` table — תרופות לפי מטופל עם מינון, תדירות, התוויה, תאריכים
  - חיפוש חכם: prefix → word-boundary → Hebrew prefix → Hebrew contains, ממוין
  - מיפוי עברי: 842 שמות עבריים
  - אינטראקציות: 25+ כללים קליניים מובנים + Drugs.com + openFDA interactions
  - zהעשרת openFDA: indication, dosages, interactions — cache 30 יום ב-DrugEntry
  - זיהוי תרופות ממסמכי PDF — regex מחלץ שם + מינון + תדירות
  - עדכון ידני מ-Admin panel + weekly job ב-APScheduler

### Frontend:
- **IntakeWizard** (7 שלבים): פרטים אישיים, כתובת, קשר חירום, מידע רפואי, תרופות, הערכות תפקודיות (ADL/IADL/MMSE), חתימות דיגיטליות. שומר תרופות ישירות ל-`patient_medications` table.
- **PatientDetail** (6 טאבים): פרטים+צמתים, ביטוחים, תביעות, אסטרטגיה, **תרופות**, מסמכים
- **PatientMedications**: רשימה אופקית (MedRow), modal הוספה/עריכה (MedicationCard), בדיקת אינטראקציות ברקע אחרי כל שינוי, אינדיקטור "בודק...", זיהוי ממסמכים
- **MedicationCard** (משותף לIntakeWizard ולPatientMedications): autocomplete שם, DosageCombobox, IndicationCombobox, תדירות, התוויה אוטומטית מ-DRUG_INDICATION_MAP, שדות נוספים collapsible (תאריכים/הערות/פעיל)
- **AdminPage**: Drug Database panel — סה"כ תרופות, לפי מקור, עדכון אחרון, כפתור "עדכן עכשיו"
- **PatientDetail:** פאנל WorkflowPanel תחתון עם כל הפעולות
- **PatientStrategy → טאב "זרימות מנוע":** instances לפי מטופל, draft claims, המלצות זרימה
- **WorkflowsPage:** תצוגת תבניות בלבד — read-only

---

## מה חסר / צעדים הבאים

### עדיפות עליונה (סדר עדכני — 2026-04-30)
- [ ] **מסעות לפי אינדיקציה** — 10-15 מחלות עם צמתי קבלת החלטות, וידע קליני מובנה, תבניות מובנות לפי תחום
- [ ] **מפה פיננסית ומימון המסע** — הרחבת המפה הפיננסית הקיימת: תחזית עלויות, מימון חוץ-ביטוחי, קרנות סיוע, הלוואות מיוחדות, זכאויות סוציאליות
- [ ] **פורטל מטופל** — כניסה עצמאית, ציר זמן read-only, מסמכים, סטטוס תביעות, שליחת בקשות
- [ ] **דשבורד ניהולי** — סקירת כל המלווים, עומס תיקים, סטטוסים, פערים, התראות אסקלציה
- [ ] **ניהול משימות חוצה-תיקים** — "היום שלי" לכל המלווים, תעדוף קלנדרי, Google Calendar
- [ ] **מערכת בקרת משתמשים (User Activity & Permissions)** — ראה פירוט למטה

### פירוט: מערכת בקרת משתמשים

**מטרה:** מעקב אחרי כל פעולה של כל משתמש, וניהול הרשאות הורדת נתונים.

**רכיב 1 — Audit Log (לוג ביקורת):**
- טבלת `UserActivityLog` — user_id, action_type, resource_type, resource_id, ip_address, user_agent, timestamp, metadata (JSON)
- כיסוי אירועים: התחברות/יציאה, צפייה במטופל, עריכה, יצירה, מחיקה, הורדת מסמך, ייצוא נתונים, הרצת workflow, שינוי הרשאות
- middleware ב-FastAPI שמתעד אוטומטית כל request (ניתן לסנן לפי route)

**רכיב 1 — Audit Log ✅ בוצע (2026-04-30):**
- `UserActivityLog` table ב-`models.py`
- `audit_middleware.py` — Starlette middleware שמיירט אוטומטית 17 סוגי פעולות
- `routes/audit.py` — `GET /api/admin/activity` עם פילטרים (user/action/date)
- טאב "לוג פעילות" ב-AdminPage — פילטרים, pagination, badge סטטוס HTTP

**רכיב 2 — Session Management (ממתין):**
- טבלת `ActiveSession` — token_jti, user_id, login_at, last_seen, ip_address, user_agent, is_active
- API: רשימת sessions פעילים, ביטול session מרחוק (logout כפוי), timeout אוטומטי לאחר חוסר פעילות
- Admin view: מי מחובר כרגע, מאיפה, כמה זמן

**רכיב 3 — הרשאות הורדה (ממתין):**
- הרחבת מודל ה-User הקיים: שדה `permissions` (JSON או טבלת `UserPermission`)
- הרשאות גרנולריות: `export_patient_pdf`, `export_claims_excel`, `export_doctors`, `download_documents`, `view_financials`
- enforcement בכל endpoint של הורדה — בדיקת הרשאה לפני שליחת קובץ

**רכיב 4 — Admin Dashboard (בקרה) — ממתין:**
- תצוגת "משתמשים מחוברים עכשיו" (תלוי ב-Session Management)
- ייצוא לוג לאדמין בלבד

**טכנולוגיה:** FastAPI middleware + SQLAlchemy + JWT blacklist לביטול sessions

---

### עדיפות גבוהה
- [ ] **WorkflowsPage** — ניהול תבניות (עריכה/יצירה), רשימת כל ה-instances בארגון, סינון/חיפוש
- [ ] **מערכת התראות** — notification bell, דדליינים, חידוש ביטוחים
- [ ] **העשרת מאגר רופאים** — זמני קבלה, WhatsApp, תשלום פרטי, נגישות, כוכבית קשר פעיל
- [ ] **פורטל ברוקר/סוכן** — תפקיד ייעודי, מבט על מטופלים, סטטוס תביעות, התחשבנות
- [ ] **דוחות אוטומטיים** — אחרי אינטייק, חודשי, למשפחה, סיום התקשרות

### עדיפות בינונית
- [ ] **דוחות וייצוא** — PDF/Excel מטופל, גרף ציר זמן
- [ ] **SMTP אמיתי** — כרגע mail אינו נשלח בפועל
- [ ] **התראות פערי ביטוח** — זיהוי אוטומטי כיסוי חסר (סיעוד, אובדן כושר)
- [ ] **מאגר מכונים ומעבדות** — MRI, CT, בדיקות דם פרטי, שיקום

### עדיפות נמוכה
- [ ] **מחקרים קליניים** — רשימה עדכנית לפי אינדיקציה
- [ ] **מודל עסקי/חיוב** — דמי מנוי, עמלת ברוקר, חיוב מרכזי
- [ ] **תפקידי ניהול נוספים** — מנהל רפואי / משפטי / פיננסי

---

## מודל נתונים מורחב

### מערכת תרופות
```
DrugEntry           — מאגר תרופות (name unique, generic_name, hebrew_name, dosage_form,
                      common_dosages JSON, openfda_indication, openfda_dosages JSON,
                      openfda_interactions text, openfda_fetched_at, source, is_active)

PatientMedication   — תרופות מטופל (patient_id, name, generic_name, dosage, frequency,
                      indication, start_date, end_date, notes, is_active)

DrugUpdateLog       — לוג עדכוני מאגר (started_at, completed_at, status, drugs_added,
                      drugs_updated, source, message)
```

### Flow Engine
```
WorkflowTemplate    — תבנית (שם, קטגוריה, condition_tags, specialty, is_builtin, is_journey)
WorkflowStepTemplate — שלבי תבנית (step_key, name, step_order, duration_days, coverage_categories, step_type, estimated_cost)
WorkflowInstance    — הרצה (template_id, patient_id, current_step, status, title, linked_claim_id)
WorkflowStep        — שלב בהרצה (instance_id, step_order, status: pending/active/completed/skipped, notes, due_date)
WorkflowAction      — audit log (step_id, action_type, triggered_by, timestamp, data)
WorkflowStepCoverage — כיסוי ביטוחי לשלב
```

**Journey Workflow:** כל מטופל מקבל instance של תבנית `is_journey=True`.

---

## החלטות ארכיטקטוניות חשובות

- **SQLite + Railway Volume** — DB שומר ב-`/data/medical_event_manager.db`
- **Seed functions** — רצות ב-startup, idempotent: workflow templates, journey workflows, drug list
- **Drug search** — DB מקומי (1,162 תרופות) עם scoring לפי prefix/word-boundary/Hebrew; openFDA ברקע לעשרת נתונים ו-cache
- **MedicationCard** — component משותף ל-IntakeWizard ול-PatientMedications; כולל DosageCombobox עם הצעות, IndicationCombobox, DRUG_INDICATION_MAP לאוטו-fill, שדות נוספים collapsible
- **DropdownPortal** — כל dropdown (תרופות, מינון, התוויה) מרונדר ב-createPortal עם `position:fixed` כדי לחמוק מ-overflow:auto של modals
- **Interaction check** — רץ ברקע אחרי כל שינוי ברשימת תרופות, אינטראקציות נשארות מוצגות בזמן refresh
- **openFDA enrich** — endpoint `/api/medications/enrich?name=X` מחזיר indication, dosages, interactions; cache 30 יום ב-DrugEntry
- **Draft Claims Flow** — תביעות שנוצרות ע"י Flow Engine מקבלות status='draft' עד אישור ידני
- **Coverage Advisor** — מחשב כיסוי ביטוחי לכל שלב בזרימה
- **Workflow Suggest** — מנוע המלצות שממפה condition_tags של מטופל לתבניות
- **Railway deploy** — webhook GitHub שבור; להשתמש ב-`railway up --detach` ידנית עד reconnect ב-Dashboard
- **DNS** — דומיין `ormed.co.il` מנוהל ב-Cloudflare (הועבר מ-LiveDNS ב-2026-04-28). לכניסה: dash.cloudflare.com
- **מייל** — Resend API (לא SMTP). `email_utils.py` משתמש ב-`resend` Python library עם API key ב-`SMTP_PASS`. שולח מ-`noreply@ormed.co.il`. דומיין מאומת ב-Resend כולל DKIM, SPF, MX ו-DMARC.
- **i18n** — כל תוכן דף הנחיתה מתורגם לפי שפה נבחרת. עורך דף הנחיתה תומך ב-10 שפות + כפתור "תרגם הכל מעברית" שמשתמש ב-Claude Haiku API. נתוני עורך שמורים ב-`{ by_lang: { he: {...}, en: {...}, ... } }`. כיוון תמיד RTL — רק תוכן משתנה לפי שפה.

---

## הרצה מקומית

```bash
./start.sh        # מריץ backend (port 8000) + frontend (port 5173)
```

Frontend מתחבר ל-backend דרך Vite proxy (מוגדר ב-vite.config.js).

---

## Deploy

```bash
railway up --detach   # deploy ידני (webhook GitHub שבור)
```

---

## סנכרון זיכרון בין מכונות

CLAUDE.md הוא מנגנון הזיכרון הבין-מכונתי. בסוף כל שיחה:
1. Claude מעדכן קובץ זה עם מה שנעשה / הוחלט
2. commit + push
3. בהפעלה הבאה (בכל מכונה) — `start.sh` עושה `git pull` אוטומטית
