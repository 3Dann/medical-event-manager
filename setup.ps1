# ============================================================
# setup.ps1 - התקנה אוטומטית - מנהל האירוע הרפואי
# הרץ פעם אחת בלבד על מחשב חדש
# ============================================================
# הרצה: פתח PowerShell כמנהל ← הדבק שורה זו:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# אחר כך הרץ:
#   irm https://raw.githubusercontent.com/3Dann/medical-event-manager/main/setup.ps1 | iex
# ============================================================

$ErrorActionPreference = "Stop"
$REPO_URL = "https://github.com/3Dann/medical-event-manager.git"
$INSTALL_DIR = "$env:USERPROFILE\medical-event-manager"

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }

Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "   מנהל האירוע הרפואי - התקנה אוטומטית" -ForegroundColor Magenta
Write-Host "============================================`n" -ForegroundColor Magenta

# ── 1. winget ────────────────────────────────────────────────
Write-Step "בודק winget..."
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Warn "winget לא נמצא. פותח Microsoft Store להתקנת App Installer..."
    Start-Process "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
    Read-Host "התקן App Installer, סגור Store, ואז לחץ Enter להמשך"
}
Write-OK "winget זמין"

# ── 2. Git ───────────────────────────────────────────────────
Write-Step "מתקין Git..."
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-OK "Git כבר מותקן: $(git --version)"
} else {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-OK "Git הותקן"
}

# ── 3. Python ────────────────────────────────────────────────
Write-Step "מתקין Python 3.13..."
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pv = python --version 2>&1
    Write-OK "Python כבר מותקן: $pv"
} else {
    winget install --id Python.Python.3.13 -e --source winget --accept-package-agreements --accept-source-agreements
    # רענן PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-OK "Python הותקן"
}

# ── 4. Node.js ───────────────────────────────────────────────
Write-Step "מתקין Node.js LTS..."
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-OK "Node.js כבר מותקן: $(node --version)"
} else {
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-OK "Node.js הותקן"
}

# ── 5. Cursor ────────────────────────────────────────────────
Write-Step "מתקין Cursor..."
if (Get-Command cursor -ErrorAction SilentlyContinue) {
    Write-OK "Cursor כבר מותקן"
} else {
    winget install --id Anysphere.Cursor -e --source winget --accept-package-agreements --accept-source-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-OK "Cursor הותקן"
}

# הגדרות Cursor זהות ל-iMac
$cursorSettingsDir = "$env:APPDATA\Cursor\User"
if (-not (Test-Path $cursorSettingsDir)) { New-Item -ItemType Directory -Force -Path $cursorSettingsDir | Out-Null }
$cursorSettings = @{
    "workbench.colorTheme"          = "Visual Studio Dark"
    "workbench.layoutControl.enabled" = $false
} | ConvertTo-Json -Depth 3
Set-Content -Path "$cursorSettingsDir\settings.json" -Value $cursorSettings -Encoding UTF8
Write-OK "הגדרות Cursor הוגדרו (Dark theme)"

# ── 6. Clone ─────────────────────────────────────────────────
Write-Step "מוריד את הפרויקט מ-GitHub..."
if (Test-Path "$INSTALL_DIR\.git") {
    Write-OK "הפרויקט כבר קיים ב-$INSTALL_DIR — מעדכן..."
    Set-Location $INSTALL_DIR
    git pull origin main
} else {
    git clone $REPO_URL $INSTALL_DIR
    Set-Location $INSTALL_DIR
    Write-OK "הפרויקט הורד ל-$INSTALL_DIR"
}

# ── 7. Backend venv ──────────────────────────────────────────
Write-Step "מקים סביבת Python (backend)..."
Set-Location "$INSTALL_DIR\backend"
if (-not (Test-Path "venv")) {
    python -m venv venv
}
& "venv\Scripts\Activate.ps1"
pip install -r requirements.txt -q
Write-OK "Backend מוכן"

# ── 8. Frontend npm ──────────────────────────────────────────
Write-Step "מתקין תלויות Frontend..."
Set-Location "$INSTALL_DIR\frontend"
npm install --silent
Write-OK "Frontend מוכן"

# ── 9. Git config ────────────────────────────────────────────
Write-Step "מגדיר Git..."
$currentEmail = git config --global user.email 2>$null
if (-not $currentEmail) {
    git config --global user.email "da.tzalik@gmail.com"
    git config --global user.name "3Dann"
    Write-OK "Git מוגדר"
} else {
    Write-OK "Git כבר מוגדר: $currentEmail"
}

# ── 10. קיצור דרך בדסקטופ ────────────────────────────────────
Write-Step "יוצר קיצור דרך בדסקטופ..."
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktop\Medical Event Manager.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$INSTALL_DIR\start.ps1`""
$shortcut.WorkingDirectory = $INSTALL_DIR
$shortcut.IconLocation = "powershell.exe,0"
$shortcut.Description = "הפעלת מנהל האירוע הרפואי"
$shortcut.Save()
Write-OK "קיצור דרך נוצר בדסקטופ"

# ── סיום ─────────────────────────────────────────────────────
Set-Location $INSTALL_DIR
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "   ההתקנה הושלמה בהצלחה!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`n  הפרויקט נמצא ב: $INSTALL_DIR"
Write-Host "  להפעלה יומית: לחץ על הקיצור בדסקטופ"
Write-Host "             או הרץ: .\start.ps1`n"

# פתח את הפרויקט ב-Cursor
Write-Step "פותח את הפרויקט ב-Cursor..."
if (Get-Command cursor -ErrorAction SilentlyContinue) {
    cursor $INSTALL_DIR
    Write-OK "Cursor נפתח עם הפרויקט"
} else {
    Write-Warn "Cursor לא נמצא ב-PATH — פתח ידנית: File → Open Folder → $INSTALL_DIR"
}
