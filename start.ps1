# ============================================================
# start.ps1 - הפעלה יומית - מנהל האירוע הרפואי
# מסנכרן קוד מ-GitHub ומפעיל Backend + Frontend
# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }

Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "   מנהל האירוע הרפואי" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

# ── סנכרון ─────────────────────────────────────────────────
Write-Step "מסנכרן קוד מ-GitHub..."
Set-Location $ROOT
$pullResult = git pull origin main 2>&1
if ($pullResult -match "Already up to date") {
    Write-OK "הקוד עדכני - אין שינויים חדשים"
} else {
    Write-OK "עודכן:"
    Write-Host $pullResult -ForegroundColor Yellow

    # אם יש שינויים ב-requirements.txt — עדכן תלויות
    if ($pullResult -match "requirements.txt") {
        Write-Step "מזוהים שינויים ב-requirements.txt - מעדכן תלויות..."
        Set-Location "$ROOT\backend"
        & "venv\Scripts\Activate.ps1"
        pip install -r requirements.txt -q
    }

    # אם יש שינויים ב-package.json — עדכן npm
    if ($pullResult -match "package.json") {
        Write-Step "מזוהים שינויים ב-package.json - מעדכן npm..."
        Set-Location "$ROOT\frontend"
        npm install --silent
    }
}

# ── Backend ─────────────────────────────────────────────────
Write-Step "מפעיל Backend..."
$backendCmd = "Set-Location '$ROOT\backend'; & 'venv\Scripts\Activate.ps1'; uvicorn main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd

Write-OK "Backend יפעל על http://localhost:8000"

# ── Frontend ────────────────────────────────────────────────
Write-Step "מפעיל Frontend..."
$frontendCmd = "Set-Location '$ROOT\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd

Write-OK "Frontend יפעל על http://localhost:5173"

# ── המתן ופתח דפדפן ─────────────────────────────────────────
Write-Host "`n  ממתין לעלות השרתים..." -ForegroundColor Gray
Start-Sleep -Seconds 4

Write-Step "פותח דפדפן..."
Start-Process "http://localhost:5173"

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "   המערכת פועלת!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`n  Frontend:  http://localhost:5173"
Write-Host "  Backend:   http://localhost:8000"
Write-Host "  API Docs:  http://localhost:8000/docs"
Write-Host "`n  לסגירה: סגור את שני חלונות PowerShell`n"
