const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

const APP_URL  = 'https://app-production-5817.up.railway.app'
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json')

// ── Window bounds persistence ─────────────────────────────────────────────────

function loadBounds () {
  try {
    return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'))
  } catch {
    return { width: 1280, height: 820 }
  }
}

function saveBounds (win) {
  try {
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(win.getBounds()))
  } catch {}
}

// ── App menu ──────────────────────────────────────────────────────────────────

function buildMenu (win) {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{
      label: 'OrMed',
      submenu: [
        { role: 'about', label: 'אודות OrMed' },
        { type: 'separator' },
        { role: 'hide', label: 'הסתר' },
        { role: 'hideOthers', label: 'הסתר אחרים' },
        { type: 'separator' },
        { role: 'quit', label: 'סגור OrMed' },
      ],
    }] : []),
    {
      label: 'עריכה',
      submenu: [
        { role: 'undo', label: 'בטל' },
        { role: 'redo', label: 'החזר' },
        { type: 'separator' },
        { role: 'cut', label: 'גזור' },
        { role: 'copy', label: 'העתק' },
        { role: 'paste', label: 'הדבק' },
        { role: 'selectAll', label: 'בחר הכל' },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        {
          label: 'רענן',
          accelerator: 'CmdOrCtrl+R',
          click: () => win.webContents.reload(),
        },
        { type: 'separator' },
        { role: 'resetZoom',     label: 'גודל מקורי' },
        { role: 'zoomIn',        label: 'הגדל' },
        { role: 'zoomOut',       label: 'הקטן' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'מסך מלא' },
      ],
    },
    {
      label: 'עזרה',
      submenu: [
        {
          label: 'פתח בדפדפן',
          click: () => shell.openExternal(APP_URL),
        },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

// ── Main window ───────────────────────────────────────────────────────────────

function createWindow () {
  const bounds = loadBounds()

  const win = new BrowserWindow({
    ...bounds,
    minWidth:  900,
    minHeight: 600,
    title: 'OrMed',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#1E3A5F',
    show: false,                 // shown after ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Set app menu
  Menu.setApplicationMenu(buildMenu(win))

  // Show loading page first
  win.loadFile(path.join(__dirname, 'loading.html'))

  // Then navigate to the app once the loading page renders
  win.webContents.once('did-finish-load', () => {
    if (win.webContents.getURL().includes('loading.html')) {
      win.loadURL(APP_URL)
    }
  })

  // Show window after first paint (avoids white flash)
  win.once('ready-to-show', () => {
    if (bounds.maximized) win.maximize()
    win.show()
  })

  // Handle navigation failures (offline / server down)
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (url === APP_URL || url.startsWith(APP_URL)) {
      win.loadFile(path.join(__dirname, 'offline.html'))
    }
  })

  // Retry button from offline page
  win.webContents.on('ipc-message', (_e, channel) => {
    if (channel === 'retry') win.loadURL(APP_URL)
  })

  // Open external links in browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Save bounds on move / resize
  win.on('resized',  () => saveBounds(win))
  win.on('moved',    () => saveBounds(win))
  win.on('maximize', () => {
    try { fs.writeFileSync(BOUNDS_FILE, JSON.stringify({ ...win.getBounds(), maximized: true })) } catch {}
  })
  win.on('unmaximize', () => saveBounds(win))

  return win
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const win = createWindow()

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else win.show()
  })
})

// Windows / Linux: quit when all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Security: block all new-window navigations that leave the app domain
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
})
