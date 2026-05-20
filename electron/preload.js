const { contextBridge, ipcRenderer } = require('electron')

// Expose only what the renderer needs
contextBridge.exposeInMainWorld('careflow', {
  retry: () => ipcRenderer.send('retry'),
  version: process.versions.electron,
})
