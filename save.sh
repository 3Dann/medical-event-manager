#!/bin/bash
# שמירה מהירה לגיטהאב
cd "$(dirname "$0")"
git add -A
git commit -m "auto: $(date '+%Y-%m-%d %H:%M') [skip ci]"
git push origin main
echo "✅ הקוד נשמר בגיטהאב"
echo ""
echo "⚠️  Railway לא עודכן — להפעלה בפרודקשן הרץ:"
echo "   ./deploy.sh"
