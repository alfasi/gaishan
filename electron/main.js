import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'
const APP_NAME = 'Gaishan'

// Enable the HTMLMediaElement audioTracks / videoTracks API
app.commandLine.appendSwitch('enable-features', 'AudioVideoTracks')
app.setName(APP_NAME)

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.webm', '.avi', '.mov', '.m4v'])

// Parse CLI args — first non-flag arg after electron args is the path or URL
let initialPath = null
let initialUrl = null
const args = process.argv.slice(isDev ? 2 : 1)
for (const arg of args) {
  if (arg.startsWith('-') || arg.startsWith('--')) continue
  if (arg.includes('electron') || arg.includes('main.js')) continue
  // Check if it's a URL
  if (/^https?:\/\//i.test(arg)) {
    initialUrl = arg
    break
  }
  // Check if it's an existing file or directory
  try {
    const stat = fs.statSync(arg)
    if (stat.isFile() || stat.isDirectory()) {
      initialPath = path.resolve(arg)
      break
    }
  } catch { /* not a valid path */ }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/player.html')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'player.html'))
  }
}

// IPC handlers
ipcMain.handle('get-initial-path', () => initialPath)
ipcMain.handle('get-initial-url', () => initialUrl)

ipcMain.handle('read-dir', async (_, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const results = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        results.push({ name: entry.name, path: fullPath, isDir: true })
      } else if (VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        results.push({ name: entry.name, path: fullPath, isDir: false })
      }
    }
    // Sort: directories first, then files, both alphabetical
    results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    return results
  } catch {
    return []
  }
})

ipcMain.handle('read-file', async (_, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath)
    return buffer
  } catch {
    return null
  }
})

ipcMain.handle('fetch-url-stream', async (event, url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  let bytesRead = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    event.sender.send('url-stream-chunk', Buffer.from(value), bytesRead, total)
  }

  event.sender.send('url-stream-done')
})

ipcMain.handle('fetch-url-bytes', async (_, url) => {
  const response = await fetch(url)
  if (!response.ok) return null
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
