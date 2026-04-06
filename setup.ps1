# ============================================================
# setup.ps1 - Medical Event Manager - One-time setup
# ============================================================
# Run once on a new machine:
#   Step 1: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#   Step 2: irm https://raw.githubusercontent.com/3Dann/medical-event-manager/main/setup.ps1 | iex
# ============================================================

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$REPO_URL  = "https://github.com/3Dann/medical-event-manager.git"
$INSTALL_DIR = "$env:USERPROFILE\medical-event-manager"

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH    = "$machinePath;$userPath"
}

function Find-Python {
    # Try standard command
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }
    # Try py launcher
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }
    # Search common install paths
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Python313\python.exe",
        "C:\Python312\python.exe",
        "C:\Program Files\Python313\python.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $dir = Split-Path $c
            $env:PATH += ";$dir"
            return $c
        }
    }
    return $null
}

Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "   Medical Event Manager - Setup" -ForegroundColor Magenta
Write-Host "============================================`n" -ForegroundColor Magenta

# ── 1. winget ────────────────────────────────────────────────
Write-Step "[1/10] Checking winget..."
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Warn "winget not found. Opening Microsoft Store to install App Installer..."
    Start-Process "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
    Read-Host "Install App Installer, close Store, then press Enter to continue"
}
Write-OK "winget is available"

# ── 2. Git ───────────────────────────────────────────────────
Write-Step "[2/10] Installing Git..."
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-OK "Git already installed: $(git --version)"
} else {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-OK "Git installed successfully"
    } else {
        Write-Warn "Git installed but not in PATH yet - will continue"
        $env:PATH += ";$env:ProgramFiles\Git\cmd"
    }
}

# ── 3. Python ────────────────────────────────────────────────
Write-Step "[3/10] Installing Python 3.13..."
$pythonExe = Find-Python
if ($pythonExe) {
    Write-OK "Python already installed: $($pythonExe) -- $( & $pythonExe --version 2>&1 )"
} else {
    winget install --id Python.Python.3.13 -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
    Start-Sleep -Seconds 3
    $pythonExe = Find-Python
    if ($pythonExe) {
        Write-OK "Python installed: $pythonExe"
    } else {
        Write-Warn "Python installed but path not found automatically."
        Write-Warn "Close this window, reopen PowerShell and run the script again."
        Read-Host "Or press Enter to try continuing anyway"
        $pythonExe = "python"
    }
}

# ── 4. Node.js ───────────────────────────────────────────────
Write-Step "[4/10] Installing Node.js LTS..."
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-OK "Node.js already installed: $(node --version)"
} else {
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
    Write-OK "Node.js installed"
}

# ── 5. Claude Code ───────────────────────────────────────────
Write-Step "[5/11] Installing Claude Code..."
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-OK "Claude Code already installed: $(claude --version 2>&1)"
} else {
    npm install -g @anthropic-ai/claude-code
    Refresh-Path
    Write-OK "Claude Code installed"
}

# ── 6. Cursor ────────────────────────────────────────────────
Write-Step "[6/11] Installing Cursor..."
if (Get-Command cursor -ErrorAction SilentlyContinue) {
    Write-OK "Cursor already installed"
} else {
    winget install --id Anysphere.Cursor -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
    Write-OK "Cursor installed"
}

# Apply Cursor settings (same as iMac)
$cursorSettingsDir = "$env:APPDATA\Cursor\User"
if (-not (Test-Path $cursorSettingsDir)) {
    New-Item -ItemType Directory -Force -Path $cursorSettingsDir | Out-Null
}
@{
    "workbench.colorTheme"             = "Visual Studio Dark"
    "workbench.layoutControl.enabled"  = $false
} | ConvertTo-Json -Depth 3 | Set-Content -Path "$cursorSettingsDir\settings.json" -Encoding UTF8
Write-OK "Cursor settings applied (Dark theme)"

# ── 6. Clone ─────────────────────────────────────────────────
Write-Step "[7/11] Downloading project from GitHub..."
if (Test-Path "$INSTALL_DIR\.git") {
    Write-OK "Project already exists at $INSTALL_DIR -- updating..."
    Set-Location $INSTALL_DIR
    git pull origin main
} else {
    git clone $REPO_URL $INSTALL_DIR
    Set-Location $INSTALL_DIR
    Write-OK "Project downloaded to $INSTALL_DIR"
}

# ── 7. Backend venv ──────────────────────────────────────────
Write-Step "[8/11] Setting up Python backend..."
Set-Location "$INSTALL_DIR\backend"
if (-not (Test-Path "venv")) {
    & $pythonExe -m venv venv
}
& "venv\Scripts\Activate.ps1"
pip install -r requirements.txt -q
Write-OK "Backend ready"

# ── 8. Frontend npm ──────────────────────────────────────────
Write-Step "[9/11] Installing frontend dependencies..."
Set-Location "$INSTALL_DIR\frontend"
npm install --silent
Write-OK "Frontend ready"

# ── 9. Git config ────────────────────────────────────────────
Write-Step "[10/11] Configuring Git..."
$currentEmail = git config --global user.email 2>$null
if (-not $currentEmail) {
    git config --global user.email "da.tzalik@gmail.com"
    git config --global user.name "3Dann"
    Write-OK "Git configured"
} else {
    Write-OK "Git already configured: $currentEmail"
}

# ── 10. Desktop shortcut ─────────────────────────────────────
Write-Step "[11/11] Creating desktop shortcut..."
$desktop      = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktop\Medical Event Manager.lnk"
$wsh          = New-Object -ComObject WScript.Shell
$shortcut     = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath    = "powershell.exe"
$shortcut.Arguments     = "-ExecutionPolicy Bypass -File `"$INSTALL_DIR\start.ps1`""
$shortcut.WorkingDirectory = $INSTALL_DIR
$shortcut.IconLocation  = "powershell.exe,0"
$shortcut.Description   = "Medical Event Manager"
$shortcut.Save()
Write-OK "Desktop shortcut created"

# ── Done ─────────────────────────────────────────────────────
Set-Location $INSTALL_DIR
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`n  Project folder: $INSTALL_DIR"
Write-Host "  To run daily:   double-click the desktop shortcut"
Write-Host "                  or run: .\start.ps1`n"

# ── Claude Code login ────────────────────────────────────────
Write-Step "Logging in to Claude Code..."
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "`n  A browser window will open -- log in with your Anthropic account." -ForegroundColor Cyan
    Write-Host "  Come back here when done.`n" -ForegroundColor Cyan
    claude login
    Write-OK "Claude Code login complete"
} else {
    Write-Warn "claude not found in PATH -- reopen PowerShell and run: claude login"
}

# ── Open project in Cursor ────────────────────────────────────
Write-Step "Opening project in Cursor..."
if (Get-Command cursor -ErrorAction SilentlyContinue) {
    cursor $INSTALL_DIR
    Write-OK "Cursor opened with the project"
} else {
    Write-Warn "Cursor not in PATH -- open manually: File -> Open Folder -> $INSTALL_DIR"
}
