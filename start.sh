#!/bin/bash
echo "🏥 מנהל האירוע הרפואי — הפעלה"
echo "================================"

# ── סנכרון מ-GitHub ──────────────────────────────────────────
echo ""
echo "▶ מסנכרן קוד מ-GitHub..."
PULL_RESULT=$(git pull origin main 2>&1)
if echo "$PULL_RESULT" | grep -q "Already up to date"; then
  echo "  ✓ הקוד עדכני — אין שינויים חדשים"
else
  echo "  ✓ עודכן:"
  echo "$PULL_RESULT"
  # עדכון תלויות אם requirements.txt השתנה
  if echo "$PULL_RESULT" | grep -q "requirements.txt"; then
    echo "  → שינויים ב-requirements.txt — מעדכן תלויות..."
    cd backend && source venv/bin/activate && pip install -r requirements.txt -q && cd ..
  fi
  # עדכון npm אם package.json השתנה
  if echo "$PULL_RESULT" | grep -q "package.json"; then
    echo "  → שינויים ב-package.json — מעדכן npm..."
    cd frontend && npm install --silent && cd ..
  fi
fi

# Backend
echo ""
echo "▶ מפעיל Backend (FastAPI)..."
cd backend

if [ ! -d "venv" ]; then
  echo "  יוצר virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "  ✓ Backend פועל על http://localhost:8000"
echo "  ✓ API Docs: http://localhost:8000/docs"

# Frontend
echo ""
echo "▶ מפעיל Frontend (React)..."
cd ../frontend

if [ ! -d "node_modules" ]; then
  echo "  מתקין תלויות (npm install)..."
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend פועל על http://localhost:5173"

echo ""
echo "================================"
echo "✅ המערכת פועלת!"
echo "   פתח את הדפדפן: http://localhost:5173"
echo ""
echo "להפסקה: Ctrl+C"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
