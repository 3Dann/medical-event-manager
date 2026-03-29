#!/bin/bash
# שמירה מהירה לגיטהאב
cd "$(dirname "$0")"
git add -A
git commit -m "שמירה אוטומטית — $(date '+%Y-%m-%d %H:%M')"
git push origin main
echo "✅ הקוד נשמר בגיטהאב"
