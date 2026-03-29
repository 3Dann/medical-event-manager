#!/bin/bash
echo "🏥 מנהל האירוע הרפואי — הפעלה"
echo "================================"

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
