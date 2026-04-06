# ============================================================
# start.ps1 - Medical Event Manager - Daily launcher
# Syncs from GitHub and starts Backend + Frontend
# ============================================================

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }

Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "   Medical Event Manager" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

# ── Sync from GitHub ─────────────────────────────────────────
Write-Step "Syncing from GitHub..."
Set-Location $ROOT
$pullResult = git pull origin main 2>&1
if ($pullResult -match "Already up to date") {
    Write-OK "Code is up to date -- no new changes"
} else {
    Write-OK "Updated:"
    Write-Host $pullResult -ForegroundColor Yellow

    if ($pullResult -match "requirements.txt") {
        Write-Step "requirements.txt changed -- updating Python dependencies..."
        Set-Location "$ROOT\backend"
        & "venv\Scripts\Activate.ps1"
        pip install -r requirements.txt -q
        Set-Location $ROOT
    }

    if ($pullResult -match "package.json") {
        Write-Step "package.json changed -- updating npm..."
        Set-Location "$ROOT\frontend"
        npm install --silent
        Set-Location $ROOT
    }
}

# ── Backend ──────────────────────────────────────────────────
Write-Step "Starting Backend..."
$backendCmd = "Set-Location '$ROOT\backend'; & 'venv\Scripts\Activate.ps1'; uvicorn main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd
Write-OK "Backend starting on http://localhost:8000"

# ── Frontend ─────────────────────────────────────────────────
Write-Step "Starting Frontend..."
$frontendCmd = "Set-Location '$ROOT\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd
Write-OK "Frontend starting on http://localhost:5173"

# ── Open browser ─────────────────────────────────────────────
Write-Host "`n  Waiting for servers to start..." -ForegroundColor Gray
Start-Sleep -Seconds 4

Write-Step "Opening browser..."
Start-Process "http://localhost:5173"

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "   System is running!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`n  Frontend:  http://localhost:5173"
Write-Host "  Backend:   http://localhost:8000"
Write-Host "  API Docs:  http://localhost:8000/docs"
Write-Host "`n  To stop: close the two PowerShell windows`n"
