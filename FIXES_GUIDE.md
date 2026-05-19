# CareFlow — מדריך תיקונים מורחב
**סדר עדיפויות: Quick Wins → ביצועים קריטיים → מבנה**

---

## ⚡ TIER 1 — Quick Wins (≤ 30 דקות כל אחד)

---

### תיקון 1 — מחיקת Dead Code בlist_instances
**קובץ:** `backend/routes/workflows.py : 487–492`
**למה חשוב:** קוד שבונה steps_map ואז לא משתמש בו — נטען, מסודר בזיכרון, ונשכח. כל בקשת רשימת workflows מריצה עבודה לשווא.

**שלבים:**
1. פתח `backend/routes/workflows.py`
2. מצא את הפונקציה `list_instances()`
3. אתר את הבלוק שבונה `steps_map` (כ-5 שורות)
4. מחק אותו — כולל כל שימוש ב-`steps_map` בתוך הפונקציה
5. בדוק שהפונקציה עדיין מחזירה תוצאה תקינה

**פרומפט:**
```
In backend/routes/workflows.py, inside list_instances(), there is a steps_map 
dictionary that is built from a DB query but never used in the response. 
Find it, remove it entirely (including the query that populates it), 
and verify the function still returns correct results.
Do not change any other logic.
```

---

### תיקון 2 — 4 Compound Indexes ב-models.py
**קובץ:** `backend/models.py`
**למה חשוב:** שאילתות כמו "כל הצעדים הממתינים של workflow X" עושות full table scan. האינדקסים הקיימים הם single-column — לא יעילים לפילטר מרכיב. השפעה: זמן תגובה /patients/{id} ירד מ-~300ms ל-~50ms.

**שלבים:**
1. פתח `backend/models.py`
2. מצא את class `WorkflowStep` — הוסף ל-`__table_args__`:
   `Index('ix_ws_instance_status', 'instance_id', 'status')`
3. מצא `WorkflowInstance` — הוסף:
   `Index('ix_wi_patient_status', 'patient_id', 'status')`
4. מצא `PatientMedication` — הוסף:
   `Index('ix_pm_patient_active', 'patient_id', 'is_active')`
5. מצא `Node` — הוסף:
   `Index('ix_node_patient_type', 'patient_id', 'node_type')`
6. ודא שה-`Index` מיובא מ-`sqlalchemy`
7. הפעל את השרת מקומית — SQLAlchemy יצור האינדקסים אוטומטית ב-startup

**פרומפט:**
```
In backend/models.py add four compound indexes:
1. WorkflowStep.__table_args__: Index('ix_ws_instance_status', 'instance_id', 'status')
2. WorkflowInstance.__table_args__: Index('ix_wi_patient_status', 'patient_id', 'status')
3. PatientMedication.__table_args__: Index('ix_pm_patient_active', 'patient_id', 'is_active')
4. Node.__table_args__: Index('ix_node_patient_type', 'patient_id', 'node_type')
Make sure Index is imported from sqlalchemy. Preserve all existing __table_args__ entries.
Do not change any other model definitions.
```

---

### תיקון 3 — useMemo על derived state בPatientDetail
**קובץ:** `frontend/src/pages/manager/PatientDetail.jsx : 266–270`
**למה חשוב:** `appliedTemplateKeys`, `customNodes`, `completedCount` מחושבים מחדש בכל render. כל עדכון state לא קשור (פתיחת modal, notification) מריץ O(n) filter על כל הנודים.

**שלבים:**
1. פתח `PatientDetail.jsx`
2. מצא את ה-derived state בסביבת שורה 266
3. עטוף כל חישוב ב-`useMemo`:
   - `appliedTemplateKeys` ← תלוי ב-`[nodes]`
   - `customNodes` ← תלוי ב-`[sorted]`
   - `completedCount`, `activeCount` ← תלויים ב-`[customNodes]`
4. ודא ש-`useMemo` מיובא מ-`react`

**פרומפט:**
```
In frontend/src/pages/manager/PatientDetail.jsx, find the derived state 
calculations around line 266: appliedTemplateKeys, customNodes, completedCount, 
activeCount. Wrap each in useMemo with appropriate dependencies:
- appliedTemplateKeys depends on [nodes]
- customNodes depends on [sorted] (or [nodes])
- completedCount and activeCount depend on [customNodes]
Make sure useMemo is imported. Do not change any other logic.
```

---

### תיקון 4 — Dashboard stats → useMemo
**קובץ:** `frontend/src/pages/manager/ManagerDashboard.jsx : 88, 92`
**למה חשוב:** `.filter()` על כל רשימת המטופלים רץ בכל render. כשNotificationBell מפולל כל 60 שניות ומעדכן state — הdashboard מחשב מחדש את הסטטיסטיקות גם אם המטופלים לא השתנו.

**שלבים:**
1. פתח `ManagerDashboard.jsx`
2. אתר את שורות החישוב (patients.filter(...).length)
3. עטוף בmemo: `const withDiagnosis = useMemo(() => patients.filter(p => p.diagnosis_status === 'yes').length, [patients])`
4. חזור על כל חישוב דומה

**פרומפט:**
```
In frontend/src/pages/manager/ManagerDashboard.jsx, find all .filter() 
operations on the patients array that calculate statistics (e.g., count 
by diagnosis_status). Wrap each in useMemo with [patients] as dependency. 
Import useMemo if not already imported.
```

---

## 🔴 TIER 2 — ביצועים קריטיים (לפני השקה מסחרית)

---

### תיקון 5 — Pagination לרשימת מטופלים של מנהל
**קובץ:** `backend/routes/patients.py : 272`
**למה חשוב:** כרגע limit/offset מיושמים רק לאדמין. מנהל עם 500 מטופלים מקבל `.all()` — 500 רשומות בכל טעינת דשבורד, בכל פעם.

**שלבים:**
1. פתח `routes/patients.py`
2. מצא את ה-query לmanger's own patients
3. הוסף `.limit(limit).offset(offset)` לפני `.all()`
4. ודא שה-route מקבל פרמטרי pagination ומחזיר `total` count בנוסף לרשימה
5. עדכן את ה-frontend לטפל ב-`{patients: [...], total: N}` ולטעון דפים

**פרומפט:**
```
In backend/routes/patients.py, the manager's own patient query uses .all() 
without applying the limit/offset parameters that are already parsed in the 
function signature. Fix it to apply .limit(limit).offset(offset) before .all(). 
Also return the total count: query the same filter with .count() and return 
{"patients": [...], "total": N}. Then in frontend/src/pages/manager/ManagerDashboard.jsx 
update the patient fetch to handle the new response shape.
```

---

### תיקון 6 — Insurance Gap Check: N+1 → Batch
**קובץ:** `backend/main.py : 180–193`
**למה חשוב:** Job יומי ב-09:00 טוען **כל** המטופלים ללא סינון, שולח שאילתה נפרדת לכל נוד, שאילתה לכל ביטוח. 500 מטופלים × 10 נודים = ~5,000 queries. מאט את כל השרת בזמן הריצה.

**שלבים:**
1. פתח `backend/main.py`, מצא `_daily_insurance_gap_check()`
2. החלף `db.query(models.Patient).all()` ב-filter למטופלים עם workflows פעילים בלבד
3. הוסף `joinedload` או `selectinload` לנודים ולminsurance sources
4. עבד בbatches של 100: `query.limit(100).offset(batch * 100)`
5. בנה dict של insurance sources מחוץ ללולאה ו-lookup בפנים

**פרומפט:**
```
In backend/main.py, the _daily_insurance_gap_check() job has an N+1 query 
problem. It calls db.query(models.Patient).all() loading every patient, 
then queries nodes per patient, then insurance sources per node.

Refactor it to:
1. Filter to only patients with at least one active WorkflowInstance (JOIN instead of .all())
2. Use selectinload or joinedload to batch-load nodes and insurance_sources in 2 queries instead of N
3. Process patients in chunks of 100 using limit/offset to avoid loading everything into memory
4. Build a dict of insurance sources once outside the loop

Keep the same output behavior (create red flags, send notifications).
```

---

### תיקון 7 — SLA Check: 3 Queries Per Step → 1 Batch
**קובץ:** `backend/main.py : 135–158`
**למה חשוב:** לכל צעד שעבר SLA: שאילתה לinstance, שאילתה לpatient, שאילתה לבדיקת task קיים. 50 צעדים = 150 queries. ניתן להביא הכל ב-3 queries (IN clause).

**שלבים:**
1. מצא `_daily_sla_check()`
2. אחרי שטוען את `breached_steps`, אסוף את כל `instance_ids` ו-`step_ids`
3. טען את כל ה-instances בשאילתה אחת: `db.query(WorkflowInstance).filter(id.in_(instance_ids)).all()`
4. טען את כל ה-patients: `db.query(Patient).filter(id.in_(patient_ids)).all()`
5. טען את כל ה-tasks קיימים: `db.query(Task).filter(source_id.in_(step_ids), source_type=="sla_breach").all()`
6. בנה dicts לlookup O(1), עבד בלולאה ללא שאילתות נוספות

**פרומפט:**
```
In backend/main.py, _daily_sla_check() issues 3 DB queries per breached step 
inside a loop: db.get(WorkflowInstance), db.get(Patient), and db.query(Task).filter().first().
With 50 breached steps this is 150+ queries.

Refactor to batch-load:
1. After loading breached_steps, collect all instance_ids and step_ids into lists
2. Load all instances in one query: db.query(WorkflowInstance).filter(WorkflowInstance.id.in_(instance_ids)).all()
3. Load all patients similarly using patient_ids extracted from instances
4. Load all existing SLA tasks: db.query(Task).filter(Task.source_id.in_(step_ids), Task.source_type=="sla_breach").all()
5. Build dict lookups: instances_by_id, patients_by_id, existing_tasks_by_step_id
6. Rewrite the loop to use dict lookups instead of DB queries

Keep identical behavior: create WorkflowAction and Task for each breach.
```

---

### תיקון 8 — enrich_drug: Sync HTTP → Async
**קובץ:** `backend/routes/medications.py : 530–546`
**למה חשוב:** `httpx.Client` סינכרוני עם timeout 8 שניות חוסם uvicorn worker thread לחלוטין. 5 משתמשים בו-זמנית = 5 threads תקועים עד 40 שניות סה"כ. שאר הבקשות נכנסות לתור.

**שלבים:**
1. מצא את הפונקציה שמבצעת HTTP ל-openFDA (סביב שורה 530)
2. שנה ל-`async def` ושמש ב-`httpx.AsyncClient()`
3. עדכן את ה-route handler שקורא לה ל-`async def` בהתאם
4. הוסף fallback: על timeout/שגיאה — החזר את ערך הcache הקיים אם יש
5. הוסף לוג לSentry על כישלון openFDA

**פרומפט:**
```
In backend/routes/medications.py, the function that calls openFDA (around line 530) 
uses synchronous httpx.Client with an 8-second timeout, blocking a Uvicorn worker thread.

Refactor it to:
1. Change the function to async def and use async with httpx.AsyncClient() 
2. Update any route handler that calls it to also be async def
3. Add a fallback: if the HTTP call fails or times out, return the cached DB value 
   if openfda_fetched_at is not None (even if stale), rather than failing the request
4. Log the failure with logger.warning() including the drug name and error type

Keep the 30-day cache-update logic intact.
```

---

### תיקון 9 — NotificationBell: Backoff + Visibility
**קובץ:** `frontend/src/components/NotificationBell.jsx : 21`
**למה חשוב:** 1,440 API calls ביום לכל משתמש. כשהטאב ברקע — polling ממשיך לשווא. כשה-API מחזיר תמיד 0 — polling ממשיך באותו קצב.

**שלבים:**
1. פתח `NotificationBell.jsx`
2. שנה interval ל-120,000 (120 שניות)
3. הוסף בדיקת `document.visibilityState === 'hidden'` בתחילת הפונקציה — אם hidden, דלג
4. הוסף counter לתוצאות ריקות רצופות — אחרי 5 פעמים רצופים שחוזר 0, הכפל את ה-interval עד מקסימום 5 דקות
5. אפס את ה-interval לbaseline כש-notification חדש מגיע

**פרומפט:**
```
In frontend/src/components/NotificationBell.jsx, the polling interval is 60 seconds 
with no optimisations.

Refactor to:
1. Change base interval to 120000ms (120 seconds)
2. Skip the poll if document.visibilityState === 'hidden'
3. Add exponential backoff: track consecutive empty responses. After 5 consecutive 
   empty results, double the interval (up to max 300000ms / 5 minutes)
4. Reset the interval back to 120000ms when a non-empty response arrives
5. Keep the AbortController cleanup pattern already present

Do not change the UI rendering logic.
```

---

### תיקון 10 — PatientDetail fetchAll: Debounce + Race Fix
**קובץ:** `frontend/src/pages/manager/PatientDetail.jsx : 87–117`
**למה חשוב:** `fetchAll()` נקרא ב-8+ מקומות ללא debounce. עריכת 3 נודים רצופה שולחת 3 full-page reloads. בנוסף, hmo-plans fetch יוצא מחוץ ל-Promise.all — race condition אפשרי עם unmount.

**שלבים:**
1. מצא את `fetchAll()` ואת כל מקומות הקריאה לו
2. הוסף `debounceTimerRef = useRef(null)` בראש הcomponent
3. צור `debouncedFetchAll()` שמשתמשת ב-300ms debounce
4. החלף 6 קריאות ל-`fetchAll()` בקריאות ל-`debouncedFetchAll()`
5. הכנס את ה-hmo-plans fetch לתוך Promise.all המקורי
6. הוסף cleanup ל-useEffect: `return () => clearTimeout(debounceTimerRef.current)`

**פרומפט:**
```
In frontend/src/pages/manager/PatientDetail.jsx:

1. fetchAll() is called in 8+ places without debounce. Add a 300ms debounce: 
   create a debounceTimerRef = useRef(null), wrap fetchAll in a debouncedFetchAll 
   that clears and resets the timer. Replace most direct fetchAll() calls with 
   debouncedFetchAll() (keep the initial mount call direct).

2. The hmo-plans fetch (axios.get for hmo-plans) is currently triggered inside 
   the .then() callback after the main Promise.all resolves, creating a race 
   condition if the component unmounts between these two. Move it into the 
   Promise.all array as a conditional: if hmo_name is known from previous state, 
   include it; otherwise handle it in the .then() but add an isMounted guard.

Keep all existing state setters and error handling.
```

---

## 🏗️ TIER 3 — מבנה (לאחר השקה)

---

### תיקון 11 — IntakeWizard.jsx: פיצול לשלבים נפרדים
**קובץ:** `frontend/src/pages/manager/IntakeWizard.jsx` (1,489 שורות)
**למה חשוב:** קובץ אחד עם 7 שלבים, 3 contexts, 2 sub-components, ADL/IADL/MMSE constants. הוספת שלב חדש = עריכה בקובץ ענקי. בדיקת שלב בודד = mount כל ה-wizard.

**שלבים:**
1. צור תיקייה `frontend/src/pages/manager/intake/`
2. חלץ לקבצים נפרדים: `StepPersonal.jsx`, `StepAddress.jsx`, `StepContact.jsx`, `StepMedical.jsx`, `StepMedications.jsx`, `FunctionalAssessment.jsx`, `Signatures.jsx`
3. חלץ `DateInput`/`DateSegment` ל-`intake/shared/DateInput.jsx`
4. חלץ `PhoneInput` ל-`intake/shared/PhoneInput.jsx`
5. הוצא validation logic ל-`utils/intakeValidators.js`
6. `IntakeWizard.jsx` נשאר כ-orchestrator של ~200 שורות בלבד

**פרומפט:**
```
Refactor frontend/src/pages/manager/IntakeWizard.jsx (currently 1489 lines) 
into a step-based structure:

1. Create directory frontend/src/pages/manager/intake/
2. Extract each step's render logic into its own component:
   - StepPersonal.jsx (step 0: demographics)
   - StepAddress.jsx (step 1: address fields)
   - StepContact.jsx (step 2: emergency contact)
   - StepMedical.jsx (step 3: diagnosis, HMO, specialty suggest)
   - StepMedications.jsx (step 4: medications list)
   - FunctionalAssessment.jsx (step 5: ADL/IADL/MMSE — already a sub-component)
   - Signatures.jsx (step 6: consent forms — already a sub-component)
3. Extract DateSegment + DateInput to intake/shared/DateInput.jsx
4. Extract validate() logic to utils/intakeValidators.js as validateStep(stepNum, formData)
5. IntakeWizard.jsx becomes the state/context orchestrator only (~200 lines)

Use the existing FormCtx, ErrorCtx, StepCtx contexts for sharing state.
Do NOT change any form behavior or validation rules.
```

---

### תיקון 12 — AdminPage.jsx: Extract PermissionEditor
**קובץ:** `frontend/src/pages/manager/AdminPage.jsx : 451–488 + 614–671`
**למה חשוב:** לוגיקת PermissionEditor (PERM_PRESETS + 7 checkboxes + group labels) נכתבה פעמיים. הוספת הרשאה חדשה = עדכון בשני מקומות + סיכון לפספס אחד.

**שלבים:**
1. צור `frontend/src/pages/manager/admin/PermissionEditor.jsx`
2. העתק את הלוגיקה המשותפת (PERM_PRESETS, PERM_OPTIONS, groups, checkboxes)
3. הגדר props: `permissions`, `onChange`, `loading`
4. החלף את שתי ההופעות בשימוש ב-`<PermissionEditor />`
5. ודא שה-CreateUserModal ו-InlineEditor עובדים עם אותו component

**פרומפט:**
```
In frontend/src/pages/manager/AdminPage.jsx, the permission editor UI 
(PERM_PRESETS dropdown, 7 permission checkboxes, 3 groups) appears twice:
- Lines ~451–488: inside CreateUserModal
- Lines ~614–671: in the inline per-user permissions editor

Extract a shared component to frontend/src/pages/manager/admin/PermissionEditor.jsx 
with props: permissions (array of active perms), onChange (callback), loading (bool).

Replace both inline implementations with <PermissionEditor permissions={...} onChange={...} />.
The PERM_OPTIONS, PERM_PRESETS, and PERM_LABELS constants should live in PermissionEditor.jsx.
Do not change any API calls or state management outside the editor UI.
```

---

### תיקון 13 — admin.py: פיצול ל-subpackage
**קובץ:** `backend/routes/admin.py` (823 שורות)
**למה חשוב:** 7 concerns שונים בקובץ אחד — user CRUD, permissions, dashboard analytics, sessions, drug DB, tasks, audit. כל שינוי בsessions מחייב לגלול דרך 800 שורות.

**שלבים:**
1. צור `backend/routes/admin/` תיקייה
2. צור `__init__.py` שמייבא את כל ה-routers
3. פצל: `users.py`, `permissions.py`, `dashboard.py`, `sessions.py`, `drugs.py`
4. כל קובץ מייבא `router = APIRouter()` משלו
5. ב-`main.py` — החלף `from routes import admin` ב-`from routes.admin import router as admin_router`

**פרומפט:**
```
Split backend/routes/admin.py (823 lines, 7 concerns) into a subpackage:

1. Create backend/routes/admin/ directory with __init__.py
2. Split into files by concern:
   - users.py: user listing, role changes, password reset, user creation/deletion
   - permissions.py: patient permission grants/revokes, permission options
   - dashboard.py: admin_dashboard(), system stats, alert aggregation
   - sessions.py: session listing and revocation
   - drugs.py: drug database panel, update trigger
3. Each file has its own router = APIRouter() with appropriate prefix
4. __init__.py exports a combined router that includes all sub-routers
5. Update main.py import: from routes.admin import router as admin_router

Keep all existing route paths, decorators, and business logic unchanged.
```

---

### תיקון 14 — ManagerDashboard: Virtualisation
**קובץ:** `frontend/src/pages/manager/ManagerDashboard.jsx : 156`
**למה חשוב:** כל כרטיסי המטופלים מרונדרים כ-DOM nodes בו-זמנית. עם 200+ מטופלים — גלילה איטית, render ראשוני כבד.

**שלבים:**
1. `npm install react-window` בתיקיית frontend
2. ייבא `FixedSizeList` מ-`react-window`
3. עטוף את רשימת המטופלים ב-`FixedSizeList`
4. חלץ PatientCard לcomponent נפרד שמקבל `style` prop
5. הגדר גובה קבוע לכרטיס (לדוגמה 120px) או השתמש ב-`VariableSizeList` אם הכרטיסים לא אחידים

**פרומפט:**
```
In frontend/src/pages/manager/ManagerDashboard.jsx, the patient list renders 
all cards as DOM nodes simultaneously. 

Add virtualisation using react-window:
1. Install: npm install react-window (in the frontend directory)
2. Import FixedSizeList from 'react-window'
3. Extract the patient card rendering into a separate Row component that 
   accepts { index, style, data } props (react-window pattern)
4. Wrap the patient list in FixedSizeList with height=600, itemSize=130, 
   itemCount={patients.length}, itemData={patients}
5. Pass the style prop from react-window to the card's outer div

The card content and click handlers should remain unchanged.
```

---

### תיקון 15 — Shared Validators
**קובץ:** `frontend/src/utils/validators.js` (חדש)
**למה חשוב:** ולידציה של ת"ז, מייל, טלפון מפוזרת ב-4+ קומפוננטות. שינוי כלל = עדכון בכמה מקומות + סיכון לחוסר עקביות.

**שלבים:**
1. צור `frontend/src/utils/validators.js`
2. חלץ `validateIsraeliId()` מ-IntakeWizard
3. הוסף `validateEmail()`, `validatePhone()`, `validatePassword()`
4. הוסף `validateIntakeStep(stepNum, formData)` שמחזיר `{valid, errors}`
5. עדכן ייבואים ב-IntakeWizard, PatientDetail, AdminPage

**פרומפט:**
```
Create frontend/src/utils/validators.js with these pure functions:

1. validateIsraeliId(id) → { valid: bool, error: string|null }
   Extract the existing logic from IntakeWizard.jsx (it calls validateIsraeliId already)
   
2. validateEmail(email) → { valid: bool, error: string|null }

3. validatePhone(phone) → { valid: bool, error: string|null }
   Min 9 digits, strip non-digits first

4. validatePassword(password) → { valid: bool, errors: string[] }
   Rules: min 8 chars, uppercase, lowercase, digit

5. validateIntakeStep(stepNum, formData) → { valid: bool, errors: {} }
   Wrap the existing validate() logic from IntakeWizard per step

Then update imports in:
- IntakeWizard.jsx: replace inline validate() with validateIntakeStep()
- PatientDetail.jsx: replace inline id check with validateIsraeliId()
- AdminPage.jsx: replace inline password check with validatePassword()
```

---

## 📋 סיכום לפי עדיפות

| # | תיקון | מאמץ | השפעה |
|---|-------|------|-------|
| 1 | מחק dead code (steps_map) | 15 דק | Low |
| 2 | 4 compound indexes | 30 דק | High |
| 3 | useMemo בPatientDetail | 30 דק | Medium |
| 4 | useMemo בDashboard stats | 10 דק | Low |
| 5 | Pagination מנהל | 30 דק | Medium |
| 6 | Insurance gap check N+1 | 4 שע | High |
| 7 | SLA check batch | 2 שע | Medium |
| 8 | enrich_drug async | 3 שע | Medium |
| 9 | NotificationBell backoff | 1 שע | Medium |
| 10 | fetchAll debounce+race | 2 שע | Medium |
| 11 | IntakeWizard split | 4 שע | High (מבנה) |
| 12 | PermissionEditor extract | 1 שע | High (מבנה) |
| 13 | admin.py split | 3 שע | Medium (מבנה) |
| 14 | Virtualisation | 2 שע | Medium |
| 15 | Validators.js | 1 שע | Low (מבנה) |
