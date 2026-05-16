#!/bin/bash
# Deploy לפרודקשן ב-Railway
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "🚀 מבצע deploy ל-Railway..."
railway up --detach

echo ""
echo "✅ Deploy הופעל. לצפייה בלוגים:"
echo "   https://railway.com/project/b2243ab9-6433-49fd-a0a3-3c525d543eaf/service/91f1964e-b4fa-45ff-b526-39710275a706?environmentId=99edf810-2a69-48b7-920d-eca9597417ce"
