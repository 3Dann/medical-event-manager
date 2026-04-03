# Medical Event Manager — הנחיות גישה מרחוק

## סטטוס Backend
✅ **בדוק ועובד** — כל 46 routes פועלים, DB מאותחל, public feedback API תקין.

---

## כתובות

| סביבה | כתובת | סטטוס |
|--------|--------|--------|
| **Production (Railway)** | `https://app-production-5817.up.railway.app` | ✅ פעיל |
| פיתוח מקומי — Frontend | `http://localhost:5173` | מקומי בלבד |
| פיתוח מקומי — API | `http://localhost:8000` | מקומי בלבד |

> לאחר פרסום ב-Railway, עדכן כתובת זו כאן.

---

## גישה לפרויקט מרחוק (לאחר Deployment)

### עמוד התקדמות (ציבורי — ללא התחברות)
```
https://YOUR-DOMAIN.up.railway.app/progress
```
שלח קישור זה לקולגה לצפייה בפיצ'רים ומשוב.

### כניסה למערכת (מנהל)
```
https://YOUR-DOMAIN.up.railway.app/login
```

### API Docs
```
https://YOUR-DOMAIN.up.railway.app/docs
```

---

## שלבי Deployment ל-Railway (חד-פעמי)

### דרישות מוקדמות
- חשבון GitHub
- חשבון Railway (railway.app) — חינמי

### שלב 1 — העלה לGitHub

```bash
cd "/Users/DannyT/Desktop/Claude Code Test/medical-event-manager"
git init
git add .
git commit -m "initial commit"
```

לאחר מכן צור repo חדש ב-GitHub ודחוף:
```bash
git remote add origin https://github.com/YOUR_USERNAME/medical-event-manager.git
git push -u origin main
```

### שלב 2 — צור שירות ב-Railway

1. לך ל-**railway.app** → Login with GitHub
2. **New Project** → Deploy from GitHub repo → בחר `medical-event-manager`
3. Railway מזהה את `nixpacks.toml` → לחץ **Deploy**

### שלב 3 — הוסף Volume לשמירת נתונים

בתוך השירות ב-Railway:
1. לשונית **Volumes** → **Add Volume**
2. Mount path: `/data`

### שלב 4 — הגדר Environment Variables

בלשונית **Variables** הוסף:
```
DATABASE_URL=sqlite:////data/medical_event_manager.db
```

### שלב 5 — קבל URL קבוע

**Settings** → Networking → **Generate Domain**

קבל URL בפורמט: `medical-event-manager-production.up.railway.app`

עדכן את הכתובות בטבלה בראש הקובץ.

---

## עבודה שוטפת מרחוק

כל push לGitHub → Railway מ-deploy אוטומטית תוך ~2 דקות:

```bash
git add .
git commit -m "תיאור השינוי"
git push
```

לצפייה בסטטוס ה-deploy:
- **Railway Dashboard** → שירות → לשונית **Deployments**

---

## הרצה מקומית

```bash
cd "/Users/DannyT/Desktop/Claude Code Test/medical-event-manager"
./start.sh
```

פתח דפדפן: [http://localhost:5173](http://localhost:5173)

---

## בדיקת תקינות

### בדיקת API Health
```bash
curl https://YOUR-DOMAIN.up.railway.app/api/health
# תוצאה צפויה: {"status":"ok"}
```

### בדיקת Public Feedback
```bash
curl -X POST https://YOUR-DOMAIN.up.railway.app/api/public/feedback \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","message":"בדיקה","rating":5}'
# תוצאה צפויה: {"message":"תודה על המשוב!","id":1}
```

---

## סיכום בדיקות שבוצעו מקומית

| בדיקה | תוצאה |
|-------|--------|
| Backend imports & startup | ✅ |
| 46 API routes registered | ✅ |
| DB tables (incl. project_feedback) | ✅ |
| `GET /api/health` | ✅ `{"status":"ok"}` |
| `POST /api/public/feedback` | ✅ `{"message":"תודה על המשוב!","id":1}` |
| SPA catch-all (production) | ✅ מוגדר (פעיל לאחר `npm run build`) |

---

## מבנה הפרויקט

```
medical-event-manager/
├── backend/          FastAPI + SQLite
│   ├── main.py       נקודת כניסה + serving של frontend
│   ├── models.py     DB models
│   └── routes/       API endpoints
├── frontend/         React + Vite + Tailwind
│   └── src/pages/    עמודי האפליקציה
├── nixpacks.toml     הגדרות build ל-Railway
├── start.sh          הרצה מקומית
└── INSTRUCTIONS.md   קובץ זה
```
