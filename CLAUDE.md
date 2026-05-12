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
- **Audit Log:** `UserActivityLog` + middleware שמיירט 17 פעולות (login, view/edit/delete patient, documents, claims, admin) + `GET /api/admin/activity` + טאב "לוג פעילות" ב-AdminPage
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

### עדיפות עליונה (סדר עדכני — 2026-05-05)
- [x] **מסעות לפי אינדיקציה** — בוצע (2026-04-30)
- [x] **מפה פיננסית ומימון המסע** — בוצע (2026-05-04): FinancialFund + PatientFundApplication, 15 קרנות ישראליות, routes/financial_map.py, FinancialMapTab.jsx
- [x] **מסעות מועשרים + lung_cancer** — בוצע (2026-05-05): 13 תבניות עם trigger/roi/estimated_cost/coverage_categories/overlay_global. Node מקבל overlay_global, estimated_cost, coverage_categories.
- [x] **PatientLayout — ניווט מטופל** — בוצע (2026-05-05): כל טאבי המטופל תחת ManagerPatientLayout (nested routing). כותרת + טאבים קבועים בראש, Outlet לתוכן.
- [x] **צוות מטפלים** — בוצע (2026-05-05): PatientCareTeamMember model, routes/care_team.py, CareTeamSection.jsx בתוך "פרטים וצמתים". 8 תפקידים, CRUD מלא.
- [x] **דף מעקב פגישה** — בוצע (2026-05-05): PatientMeeting model, routes/meetings.py, PatientMeetings.jsx — טאב "פגישות" חדש. סוג פגישה, action items, צ'ק-ליסט מסמכים, מעקב כספי.
- [x] **מעקב טופס 17** — בוצע (2026-05-05): PatientForm17 model, routes/form17.py, Form17Section.jsx בתחתית "תביעות".
- [x] **נורות אדומות** — בוצע (2026-05-05): PatientRedFlag model, routes/red_flags.py, RedFlagsBanner.jsx מעל תוכן הטאב — רפואי/פיננסי/שחיקת מטפל.
- [x] **מערכת דוחות — דוח מפה פיננסית** — בוצע (2026-05-08): routes/reports.py (PDF ב-ReportLab + RTL + שמירה כמסמך), ReportsPage.jsx + כפתור ב-FinancialMapTab, Dockerfile עם fonts-dejavu-core, requirements: reportlab+python-bidi, symlink pdf_builder.py בbackend. 3 endpoints: GET /api/patients/{id}/reports/financial-map, /reports, /api/reports/recent.
- [x] **פורטל מטופל** — בוצע (2026-05-08): PatientRequest model + routes/patient_portal.py, PatientSummary.jsx בנוי מחדש — 5 טאבים (ציר זמן, תביעות, מסמכים+הורדה, מצב כספי, פניות), PatientRequestsPanel ב-PatientMeetings למנהל
- [x] **ביקורת אבטחה ותיקונים (2026-05-12)** — 36 מתוך 38 ממצאים טופלו. ראה פירוט בסעיף "ביקורת מערכת" למטה.
- [ ] **דשבורד ניהולי** — סקירת כל המלווים, עומס תיקים, סטטוסים, פערים, התראות אסקלציה (עדיפות עליונה)
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
- **Railway CLI login** — לאחר עדכון גרסה (4.44 → 4.57+) config נמחק. לאחר `railway login` צריך גם `railway link --project medical-event-manager`. גרסה נוכחית: 4.57.4.
- **railway.toml** — קיים בשורש הפרויקט. אין לציין `builder = "NIXPACKS"` כשיש Dockerfile — גורם לבלבול. הגדרות: healthcheckPath, healthcheckTimeout=120, restartPolicyType=ON_FAILURE, numReplicas=1.
- **SQLite WAL mode** — מופעל אוטומטית בכל חיבור ב-`database.py` (PRAGMA journal_mode=WAL + synchronous=NORMAL + busy_timeout=5000 + foreign_keys=ON)
- **API service layer** — `frontend/src/services/api.js`. axios instance עם auth interceptor, entity methods (patients, tasks, auth, documents, medications). ייבוא: `import api, { patients, tasks } from '../../services/api'`
- **JWT library** — PyJWT 2.10.1 (הוחלף מ-python-jose שיש לו CVEs). import: `import jwt as pyjwt; from jwt import PyJWTError as JWTError`
- **JWT revocation** — `RevokedToken` table + `jti` claim בכל token. `POST /api/auth/logout` מוסיף jti ל-blacklist. `get_current_user` בודק revocation.
- **Field encryption** — `field_encrypt.py` (Fernet/AES). env var: `FIELD_ENCRYPTION_KEY` (מוגדר ב-Railway). משמש ל-totp_secret. prefix `enc:` על ערכים מוצפנים; ערכים ישנים עוברים כ-plaintext (backward compat).
- **Tasks sync** — GET /api/tasks/my הוא read-only. כתיבה עוברת דרך POST /api/tasks/sync.
- **X-Forwarded-For** — נאמן רק מ-Railway internal network (100.64.x.x). מניעת IP spoofing לעקיפת rate limits.
- **reset_users_once** — דורש `ALLOW_USER_RESET=1` בenv. ללא זה — מדלג על המחיקה ויוצר flag file.
- **CSP header** — Content-Security-Policy מוגדר ב-SecurityHeadersMiddleware. default-src 'self', script-src 'self' 'unsafe-inline'.
- **Calendar tokens** — ברירת מחדל TTL 365 יום. backfill אוטומטי לטוקנים ישנים ללא תפוגה.
- **Admin temp password** — נשלח למייל בלבד (send_temp_password ב-email_utils.py). אינו מוחזר ב-API response.
- **Tasks pagination** — GET /api/tasks/my מחזיר `{"total": N, "items": [...]}` עם limit/offset params.
- **Drug search** — משתמש ב-`ilike()` DB-level pre-filter + LIMIT 100, לא `.all()`. scoring algorithm שמור לדירוג.
- **slowapi בroutes** — להשתמש ב-`from slowapi.util import get_ipaddr` (לא `get_remote_address` שלא קיים ב-0.1.9). ליצור `limiter = Limiter(key_func=get_ipaddr)` בתוך כל route file שצריך rate limiting.
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

## ביקורת מערכת — מה בוצע (2026-05-12)

**סבב 1 (2026-05-12):** 36 מתוך 38 ממצאים טופלו.
**סבב 2 (2026-05-12):** 13 ממצאים חדשים מביקורת 5 סוכנים תוקנו (ראה רשימה למטה).
**סבב 4 (2026-05-12):** כל שאר הממצאים הפתוחים טופלו (ראה תיקוני סבב 4 למטה).
פתוח: PostgreSQL migration (נדחה בכוונה), billing/multi-tenancy (נדחה בכוונה), i18n הרחבה לשאר הדפים (עבודה של שבוע), screen reader audit (בדיקה ידנית).

### Backend
- **Sentry** — `sentry-sdk[fastapi]==2.27.0`, `SENTRY_DSN` ב-Railway, FastAPI/SQLAlchemy/Logging integrations
- **JWT RuntimeError** — `auth.py` קורס בהפעלה אם `SECRET_KEY` חסר מה-env
- **Account lockout** — `failed_login_attempts` + `locked_until` ב-User model; 5 כשלונות → נעילה 15 דקות
- **2FA codes** — `token_hex(3)` → `token_hex(4)` (8 תווים, 32-bit); reset token → `token_urlsafe(16)` (128-bit)
- **View tokens → DB** — `DocumentViewToken` model חדש; `_VIEW_TOKENS` dict הוסר לחלוטין
- **Family share revocation** — `revoked_at` + `revoked_by` ב-FamilyShareToken
- **CORS explicit** — `allow_methods` + `allow_headers` מפורשים (לא wildcard)
- **Audit log 2FA** — verify-2fa, forgot-password, reset-password נוספו ל-`_ROUTES`
- **MIME None rejection** — upload נדחה אם `content_type is None` (HTTP 400)
- **Cascade delete** — `Claim.insurance_source_id` עם `ondelete="SET NULL"`, `nullable=True`
- **User audit fields** — `last_login` + `last_activity`; מעודכנים ב-login ובכל request מאומת
- **Health check** — `/api/health` מריץ `SELECT 1`, מחזיר `{"status":"ok","db":"ok|error"}` תמיד HTTP 200
- **Rate limits** — document upload: 20/min; doctors Excel export: 10/min (slowapi)
- **N+1 → batch** — `_sync_tasks_for_manager` — 5 IN-clause queries במקום N×4
- **Drug search** — `ilike()` DB pre-filter + LIMIT 100
- **flow_engine errors** — `except: pass` → `logger.exception()`
- **APScheduler** — `max_instances=1` על כל 3 jobs
- **WAL mode** — database.py: WAL + synchronous=NORMAL + busy_timeout=5000
- **Backup** — `backup.py`: sqlite3.backup → gzip → R2 (אם מוגדר) + /data/backups/ מקומי, שומר 7 גיבויים. `POST /api/admin/backup` לטריגר ידני. Job יומי 03:00 UTC.
- **schema_versions** — טבלת מעקב migrations נוספה
- **railway.toml** — numReplicas=1, healthcheckPath, restartPolicy

### Frontend
- **ErrorBoundary.jsx** — class component עם Hebrew fallback UI, עוטף את AppRoutes
- **401 interceptor** — main.jsx: localStorage.clear() + redirect ל-/login על 401 (עם guard למניעת loop)
- **console.error → toast** — 0 silent catch blocks נשארו
- **IntakeWizard silent save** — `.catch(() => {})` → `showToast` עם שם התרופה
- **fmtDate → formatters.js** — `frontend/src/utils/formatters.js` עם `fmtDate` + `fmtDateShort`; 7 הגדרות כפולות הוסרו
- **Skeleton.jsx** — SkeletonLine, SkeletonCard, SkeletonTable עם animate-pulse + aria-busy
- **RTL modals** — 12 modal overlays קיבלו `dir="rtl"`
- **PatientSummary UX** — text-slate-500 → text-slate-700; כפתור חזרה min-h-[44px]; nav text-xs → text-sm
- **IntakeWizard aria-label** — FIELD_LABELS map; כל `inp()` מוסיף `aria-label` + `aria-invalid` אוטומטית

### שירותים חיצוניים שנוספו
- **Sentry** — `SENTRY_DSN` ב-Railway (free tier, 5K events/month)
- **boto3** — `boto3==1.38.7` ב-requirements.txt לגיבוי R2 (R2 env vars טרם הוגדרו)
- **FIELD_ENCRYPTION_KEY** — ב-Railway. מפתח Fernet ל-field-level encryption. אסור לאבד!

### תיקוני סבב 3 — ממצאים מ-5 סוכנים, עגול שני (2026-05-12)
- **Password strength** — `_validate_password()` ב-routes/auth.py: 8 תווים מינימום, upper+lower+digit
- **404 page** — `NotFoundPage.jsx` — `*` route כבר לא מפנה ל-/ בשקט
- **Accessibility statement** — `AccessibilityPage.jsx` ב-route `/negishot`
- **Skip-to-content** — `<a href="#main-content">` ב-App.jsx, `<main id="main-content">`
- **React.lazy** — כל 27 דפי manager/patient lazy loaded. Bundle ראשי ירד מ-1221kb ל-390kb.
- **API service layer** — `frontend/src/services/api.js` עם axios instance + auth interceptor + entity methods
- **Patient card → button** — ManagerDashboard card הוחלף ל-`<button>` עם aria-label
- **Semantic landmarks** — `<header>` ב-ManagerDashboard, `<nav>` ב-PatientStrategy tabs
- **ADL/IADL radio accessibility** — `<fieldset>/<legend>`, `role="radiogroup"`, `sr-only` במקום `hidden`, `name` attribute
- **DateSegment keyboard nav** — `role="listbox/option"`, `aria-selected`, `tabIndex`, Enter/Space/Escape handlers
- **i18n IntakeWizard** — `useTranslation` + שמות שלבים מ-locale, כותרת מתורגמת
- **i18n PatientStrategy** — `useTranslation` + `<nav>` עם aria-label על טאבים
- **patient god-object** — נדחה לסבב נפרד (שינוי schema ב-DB דורש migration ייעודי)

### תיקוני סבב 2 — ממצאים חדשים מ-5 סוכנים (2026-05-12)
- **Admin temp password** → נשלח במייל בלבד (`send_temp_password`). לא ב-response.
- **CSP header** → `Content-Security-Policy` ב-SecurityHeadersMiddleware
- **X-Forwarded-For** → נאמן רק מ-Railway internal (100.64.x.x)
- **PRAGMA foreign_keys=ON** → database.py
- **Calendar token TTL** → 365 יום כברירת מחדל + backfill לישנים
- **GET /tasks/my read-only** → POST /tasks/sync לסנכרון
- **reset_users_once** → דורש `ALLOW_USER_RESET=1`
- **PyJWT** → הוחלף מ-python-jose (CVEs)
- **Pagination** → tasks endpoint מחזיר `{total, items, limit, offset}`
- **Logout + JWT revocation** → `RevokedToken` table + `jti` claim + `POST /api/auth/logout`
- **TOTP encryption** → `field_encrypt.py` (Fernet). `FIELD_ENCRYPTION_KEY` ב-Railway.
- **ManagerDashboard** → `useToast` + `AppToast` נוספו (תוקן קריסה)
- **Tests** → `test_field_encrypt.py`, `test_backup.py`, `formatters.test.js`

---

## סנכרון זיכרון בין מכונות

CLAUDE.md הוא מנגנון הזיכרון הבין-מכונתי. בסוף כל שיחה:
1. Claude מעדכן קובץ זה עם מה שנעשה / הוחלט
2. commit + push
3. בהפעלה הבאה (בכל מכונה) — `start.sh` עושה `git pull` אוטומטית
