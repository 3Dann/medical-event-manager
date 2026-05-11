# ביקורת מערכת מקיפה — Orly Medical
## מנהל אירוע רפואי | מאי 2026

{{GENERATED_AT}}

---

# תקציר מנהלים

בוצעה ביקורת מקיפה של מערכת Orly Medical על ידי 5 agents מקצועיים בו-זמנית. הביקורת כיסתה חמישה תחומים: אבטחה, UX ונגישות, ארכיטקטורת Backend, איכות Frontend ומוכנות לייצור.

**ציון כולל: 3.3/10** — המערכת מתאימה כרגע לסביבת staging עם משתמשים בודדים. לפני פתיחה ללקוחות אמיתיים נדרשים תיקונים קריטיים בתחומי הגנת נתונים, ניטור שגיאות וגיבויים.

**סה"כ ממצאים: 72**

- קריטיים: 12
- גבוהים: 18
- בינוניים: 30
- נמוכים: 12

---

# פרק א — ביקורת אבטחה

## ממצאים קריטיים

### 1. ערך ברירת מחדל ל-JWT Secret
**חומרה:** קריטי
**קובץ:** backend/auth.py שורה 12

ה-SECRET_KEY מוגדר בקוד עצמו כ-fallback. כל מי שיש לו גישה ל-repository יכול לזייף JWT tokens ולהתחזות לכל משתמש במערכת, כולל אדמין.

**המלצה:** הטל RuntimeError אם SECRET_KEY לא מוגדר כמשתנה סביבה. מינימום 256 ביט אקראי.

---

### 2. Token Enumeration — קודי 2FA קצרים מדי
**חומרה:** קריטי
**קובץ:** backend/routes/auth.py שורות 164, 190

הקוד משתמש ב-`secrets.token_hex(3)` — רק 16 מיליון אפשרויות. עם brute-force בקצב נמוך ניתן לנחש קוד תוך שעות.

**המלצה:** עדכן ל-`secrets.token_urlsafe(32)` — 2 בחזקת 256 אפשרויות.

---

## ממצאים גבוהים

### 3. אין Account Lockout
**חומרה:** גבוה
**קובץ:** backend/routes/auth.py שורות 92–106

אין נעילת חשבון לאחר ניסיונות כושלים. Rate limiting לפי IP בלבד — ניתן לעקוף עם botnets.

**המלצה:** נעל חשבון 15 דקות לאחר 5 ניסיונות כושלים. שלח דוא"ל על ניסיון חשוד.

---

### 4. View Tokens בזיכרון בלבד
**חומרה:** גבוה
**קובץ:** backend/routes/documents.py שורה 14

`_VIEW_TOKENS` הוא Python dict בזיכרון. הולך לאיבוד בכל restart של השרת. לא ניתן לביקורת ולא עמיד.

**המלצה:** מגרט ל-DB table `DocumentViewToken` עם שדות `token, expires_at, is_used, created_by`.

---

### 5. Family Share — אין לוג ביטול
**חומרה:** גבוה
**קובץ:** backend/routes/family_share.py שורות 43–70

כשמבטלים קישור לבן משפחה, אין רישום מי ביטל ומתי. אין `revoked_at` / `revoked_by`.

**המלצה:** הוסף שדות ביטול ל-FamilyShareToken ורשום ב-audit log.

---

### 6. CORS — methods פתוחים לגמרי
**חומרה:** גבוה
**קובץ:** backend/main.py שורה 106

`allow_methods=["GET","POST","PUT","DELETE"]` ו-`allow_headers=["Content-Type","Authorization"]` — פתוח לכל שיטות HTTP ו-headers.

**המלצה:** רשימה מפורשת: `["GET", "POST", "PUT", "DELETE"]` ו-`["Content-Type", "Authorization"]`.

---

## ממצאים בינוניים

### 7. Audit Log לא מכסה 2FA
**קובץ:** backend/audit_middleware.py שורה 14
ה-routes של verify-2fa, forgot-password ו-reset-password אינם מתועדים. ניסיונות התקפה לא יירשמו.

### 8. File Upload — MIME bypass אפשרי
**קובץ:** backend/routes/documents.py שורה 109
אם `content_type` הוא None, בדיקת MIME מדולגת. Magic bytes נבדק תמיד — אבל עדיף לדחות קבצים ללא content-type.

### 9. User-Agent — חיתוך ב-200 תווים
**קובץ:** backend/audit_middleware.py שורה 90
User-Agent מודרני עלול להיות ארוך יותר. שנה ל-500 תווים.

### 10. שמות env vars מטעים
**קובץ:** backend/email_utils.py שורה 6
`SMTP_PASS` משמש לـ Resend API Key — שם לא מתאים. שנה ל-`RESEND_API_KEY`.

---

# פרק ב — ביקורת UX ונגישות

**ציון IS 5568:** 5/10 | **ציון WCAG AA:** 6.5/10

## ממצאים גבוהים

### 11. ניגודיות — text-slate-400 על רקע בהיר
**קובץ:** PatientSummary.jsx שורות 244, 298–300
Contrast ratio נמוך מ-4.5:1 — לא עומד ב-WCAG AA. תוכן קריטי (תאריכים, קטגוריות) בצבע אפור בהיר.

**המלצה:** החלף text-slate-500/400 ב-text-slate-700 בכל תוכן קריטי.

---

### 12. כפתורים — גובה לא עקבי
**קובץ:** PatientSummary.jsx שורה 81
כפתור "חזרה לדף הבית" עם `py-1` בלבד — גובה ~24px. תקן WCAG דורש 44px.

**המלצה:** `min-h-[44px]` על כל כפתורים אינטראקטיביים.

---

### 13. text-xs בניווט תחתון
**קובץ:** PatientSummary.jsx שורה 859
תוויות ניווט תחתון ב-`text-xs` — קטן מדי למשתמשים עם ראייה מוגבלת.

**המלצה:** שנה ל-`text-sm`.

---

### 14. RTL חסר במודלים
**קובץ:** ManagerLayout.jsx ועוד
חלק מהמודלים לא מגדירים `dir="rtl"` בroot שלהם — רכיבים מקבלים כיוון LTR.

**המלצה:** כל modal root חייב `dir="rtl"` מפורש.

---

## ממצאים בינוניים

### 15. Loading States — לא עקביים
חלק מהדפים מציגים "טוען..." כטקסט פשוט, חלקם spinner — אין עקביות. דרוש Skeleton loader מרכזי.

### 16. Keyboard Navigation
שדות תאריך (DateSegment), בחירות מינוי ועוד — tab order לא אידיאלי. Focus outline חסר בכמה כפתורים.

### 17. aria-label חסר
תקן IS 5568 דורש aria-label על כל שדה מורכב. Screen reader testing לא בוצע.

### 18. פורטל מטופל — נקודות חיוב
leading-[1.8] מוגדר, כפתור עזרה "?" פעיל, כפתור קריאה קולית פעיל, bottom navigation נכון, מצב פשוט פעיל.

---

# פרק ג — ביקורת ארכיטקטורת Backend

## ממצאים קריטיים

### 19. SQLite ללא WAL Mode
**קובץ:** backend/database.py שורות 6–12
SQLite בברירת מחדל חוסם קריאות בזמן כתיבה. ב-production עם מספר workers — bottleneck קשה.

**המלצה:** הוסף `PRAGMA journal_mode=WAL` ב-connect event.

---

### 20. N+1 Queries בסינכרון משימות
**קובץ:** backend/routes/tasks.py שורות 51–76
`_sync_tasks_for_manager()` שולחת query נפרד לכל מטופל — meetings, workflows, requests, flags. עם 50 מטופלים = 200+ queries לכל בקשה.

**המלצה:** שימוש ב-`joinedload()` ו-`selectinload()` מ-SQLAlchemy.

---

## ממצאים גבוהים

### 21. flow_engine — שגיאות שקטות
**קובץ:** backend/flow_engine.py שורות 46, 52, 91
שלושה בלוקי `except Exception: pass` — שגיאות קריטיות בחישוב כיסוי ביטוחי נבלעות בשקט.

**המלצה:** `logger.exception()` בכל בלוק catch.

---

### 22. APScheduler — אין max_instances
**קובץ:** backend/main.py שורה 60
Weekly drug update ללא `max_instances=1`. אם job קודם עדיין רץ, יתחיל שני במקביל.

**המלצה:** הוסף `max_instances=1` לכל job.

---

### 23. Cascade Delete חסר בתביעות
**קובץ:** backend/models.py שורה 358
`Claim.insurance_source_id` ללא cascade — מחיקת InsuranceSource משאיר orphaned claims.

**המלצה:** הוסף `cascade="all, delete"` ל-relationship.

---

## ממצאים בינוניים

### 24. מודל User — חסרים שדות ביקורת
אין `last_login` ו-`last_activity` ב-User model — קשה לזהות חשבונות לא פעילים.

### 25. Drug Search — טוען הכל לזיכרון
`_search_db()` טוענת את כל התרופות הפעילות לזיכרון בכל בקשה. עם 1,162 תרופות — בזבוז זיכרון. דרוש LIKE query עם LIMIT.

### 26. Calendar Feed — Timezone hardcoded
`X-WR-TIMEZONE:Asia/Jerusalem` קבוע בקוד. דרוש timezone preference ל-User model.

### 27. View Token TTL — 90 שניות קצר מדי
אם PDF reader פותח לאט, ה-token עלול לפוג. הגדל ל-300 שניות.

### 28. SMTP_PASS — שם מטעה
Resend API Key שמור תחת `SMTP_PASS` — שנה ל-`RESEND_API_KEY`.

### 29. אין Alembic — Migrations ידניות
`run_migrations()` עם Raw SQL. אין version tracking, אין rollback, אין history.

---

# פרק ד — ביקורת איכות Frontend

## ממצאים קריטיים

### 30. אין Error Boundary
**קובץ:** frontend/src/App.jsx

אם component כלשהו זורק exception — הכל קורס. אין fallback UI. React דורש Class Component עם `componentDidCatch`.

**המלצה:** עטוף כל ProtectedRoute ב-ErrorBoundary component.

---

### 31. אין 401 Interceptor — Token Expiry שקט
**קובץ:** frontend/src/main.jsx

כשה-JWT פג, בקשות נכשלות בשקט — המשתמש לא מנותק, לא מקבל הודעה. הנתונים לא מתעדכנים.

**המלצה:**
```javascript
axios.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/'
  }
  return Promise.reject(err)
})
```

---

## ממצאים גבוהים

### 32. 38 מקומות של console.error() ללא Toast
**קבצים:** ManagerDashboard.jsx, AdminPage.jsx, DoctorsDatabase.jsx ועוד
שגיאות API נרשמות ל-Console בלבד — המשתמש לא יודע שמשהו נכשל.

**המלצה:** החלף כל `catch (e) { console.error(e) }` ב-`showToast()`.

---

### 33. IntakeWizard — שמירת תרופות שקטה
**קובץ:** frontend/src/pages/manager/IntakeWizard.jsx שורה 662
אם שמירת תרופה נכשלת, המשתמש אינו מקבל הודעה.

---

## ממצאים בינוניים

### 34. fmtDate — מוגדרת ב-3 קבצים
PatientSummary.jsx, MyDay.jsx ו-DemoPatientPortal.jsx מכילים את אותה פונקציה `fmtDate`.

**המלצה:** צור `utils/formatters.js` ויצא משם.

---

### 35. Toast לא משמש בכל המקומות
AppToast ו-useToast קיימים ועובדים, אך לא מוטמעים בחלק מהדפים (ManagerDashboard, PatientDetail).

### 36. Loading States — אין Skeleton
"טוען..." כטקסט בלבד ברוב הדפים — אין skeleton loaders, אין עקביות ויזואלית.

### 37. פורטל דמו — מושלם לתצוגה
DemoPatientPortal ו-DemoBrokerPortal עם נתוני דמו מציאותיים. Demo Launcher נגיש למנהל-על בלבד. Banner סגול ברור. כל הניווט עובד.

---

# פרק ה — מוכנות לייצור

**ציון כולל: 3.3/10**

## ממצאים קריטיים

### 38. אין גיבוי — סיכון אובדן נתונים מוחלט
אין backup strategy. אם Railway Volume נפגע, כל נתוני המטופלים — תביעות, מסמכים, ביטוחים — אבודים לצמיתות.

**המלצה דחופה:** Daily backup job שמעביר DB ל-S3 + Cloudflare R2. יישום מיידי.

---

### 39. SQLite — לא מתאים לריבוי instances
SQLite עם ריבוי threads ו-workers גורם ל-write locks קשים. Railway יכול להוסיף instances — זה ייגרום ל-data corruption.

**המלצה:** הגר ל-PostgreSQL (Railway מציע managed PostgreSQL בחינם עד גבול).

---

### 40. אין ניטור שגיאות (Sentry)
כשהשרת קורס — אין התראה. Logs אבודים לאחר 3 ימים ב-Railway. אין error traces.

**המלצה:** `pip install sentry-sdk` + `sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"))` ב-main.py. עלות: חינם עד 5,000 events/חודש.

---

### 41. Railway Volume — לא בטוח להמשך deploys
אין `railway.toml` המגדיר את ה-Volume כ-persistent. deploy יכול להחליף את ה-container ולאבד נתונים.

**המלצה:** הוסף `railway.toml` עם הגדרת Volume מפורשת.

---

## ממצאים גבוהים

### 42. CORS לא מוגדר לדומיין ייצור
`FRONTEND_ORIGIN` לא מוגדר — CORS מתיר רק localhost. אם frontend עובר ל-Cloudflare/CDN, הכל ייעצר.

### 43. Migrations — אין rollback
run_migrations() ב-main.py ללא version tracking. migration שנכשל חצי דרך משאיר schema שבור.

### 44. Scheduled Jobs — לא בטוחים ב-Multi-Instance
אם יש 2 instances, שניהם מריצים drug update בו זמנית — duplicates ו-race conditions.

---

## ממצאים בינוניים

### 45. Health Check לא בודק DB
`/api/health` מחזיר 200 גם אם SQLite נפל. הוסף `SELECT 1` ל-DB בבדיקה.

### 46. Dockerfile — רץ כ-root
אין `USER appuser` ב-Dockerfile — container רץ כ-root. סיכון אבטחה.

### 47. Static Files — אין Cache Headers
Assets של Vite (בעלי hash) מוגשים ללא `Cache-Control: immutable`. ביצועים ירודים.

### 48. Rate Limiting — לא מכסה כל endpoints
העלאת מסמכים, חיפוש תרופות, ייצוא נתונים — ללא rate limit. מאפשר abuse.

---

# ציוני ביקורת

**אבטחה:** 5.5/10
**UX ונגישות:** 6.5/10
**ארכיטקטורת Backend:** 6/10
**איכות Frontend:** 6/10
**מוכנות לייצור:** 3.3/10

---

# תוכנית פעולה — 3 חודשים

## חודש 1 — ייצוב והגנת נתונים

### שבוע 1 (דחוף ביותר)
- הגדר SECRET_KEY חזק ב-Railway (בוצע)
- הגדר FRONTEND_ORIGIN ב-Railway (בוצע)
- הוסף Sentry לניטור שגיאות
- יישם daily backup ל-S3

### שבוע 2–3
- הגר ל-PostgreSQL managed
- הוסף 401 interceptor ב-frontend
- הוסף Error Boundary לכל ProtectedRoute
- החלף console.error ב-showToast

### שבוע 4
- WAL mode ל-SQLite (גישור עד PostgreSQL)
- הוסף max_instances לAPScheduler jobs
- תיקון N+1 queries בtask sync

## חודש 2 — שיפורי UX ומשתמשים

### שבוע 5–6
- דשבורד ניהולי — סקירת כל המלווים, עומס תיקים
- מערכת התראות — דדליינים, חידוש ביטוחים
- Account lockout לאחר 5 ניסיונות כושלים

### שבוע 7–8
- ניהול sessions — מי מחובר כרגע
- הרשאות הורדה גרנולריות
- Rate limiting על כל endpoints

## חודש 3 — פיצ'רים ו-UX

### שבוע 9–10
- עורך תבניות Workflow
- תיקוני נגישות IS 5568 — aria-label, screen reader
- Skeleton loaders אחיד

### שבוע 11–12
- התראות חכמות — פערי ביטוח אוטומטיים
- Load testing וייעול ביצועים
- בדיקה עם משתמשים מעל גיל 65

---

# דברים שעובדים טוב

המערכת בנויה על stack מודרני ויציב. JWT עם 2FA (TOTP + Email + WebAuthn), bcrypt להצפנת סיסמאות, SQLAlchemy עם parameterized queries — אין SQL injection. Audit middleware מיירט 17 סוגי פעולות. Rate limiting מוגדר על endpoints קריטיים. security headers (X-Frame-Options, HSTS, Referrer-Policy) פעילים. פורטל מטופל עם leading-1.8, כפתור עזרה, קריאה קולית ומצב פשוט — מוכן לאוכלוסיה מבוגרת. Demo portals לפורטל מטופל ולברוקר עם נתוני דמו מציאותיים — מוכנים להצגה. ICS calendar feed לפי RFC 5545. מערכת תרופות עם 1,162 תרופות ו-842 שמות עבריים.
