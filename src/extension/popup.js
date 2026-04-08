/**
 * Gaishan extension — popup script.
 * Communicates with the content script to show status and relay file loads.
 */

const STORAGE_KEY = 'gaishan-settings'
let settings = { showReadings: true, simplified: false }

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dotEl           = document.getElementById('dot')
const statusTextEl    = document.getElementById('status-text')
const subtitleStatus  = document.getElementById('subtitle-status')
const loadBtn         = document.getElementById('load-btn')
const fileInput       = document.getElementById('file-input')
const readingsToggle  = document.getElementById('readings-toggle')
const simplifiedToggle = document.getElementById('simplified-toggle')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function sendToContent(msg) {
  try {
    const tab = await getActiveTab()
    if (!tab?.id) return null
    return await chrome.tabs.sendMessage(tab.id, msg)
  } catch {
    return null
  }
}

function loadSettingsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) settings = { ...settings, ...result[STORAGE_KEY] }
      resolve(settings)
    })
  })
}

function persistSettings() {
  chrome.storage.local.set({ [STORAGE_KEY]: settings })
  sendToContent({ type: 'UPDATE_SETTINGS', settings })
}

// ── Status ────────────────────────────────────────────────────────────────────

async function refreshStatus() {
  const resp = await sendToContent({ type: 'GET_STATUS' })
  if (!resp || !resp.videoFound) {
    dotEl.className = 'dot dot-gray'
    statusTextEl.textContent = resp ? 'No video detected on this page' : 'Content script not running'
    subtitleStatus.textContent = ''
    loadBtn.disabled = true
    return
  }
  dotEl.className = 'dot dot-green'
  statusTextEl.textContent = 'Video detected'
  subtitleStatus.textContent = resp.statusText || ''
  loadBtn.disabled = false
}

// ── Toggles ───────────────────────────────────────────────────────────────────

function setToggle(el, value) {
  el.classList.toggle('on', value)
}

function initToggles() {
  setToggle(readingsToggle, settings.showReadings)
  setToggle(simplifiedToggle, settings.simplified)

  readingsToggle.addEventListener('click', (e) => {
    e.preventDefault()
    settings.showReadings = !settings.showReadings
    setToggle(readingsToggle, settings.showReadings)
    persistSettings()
  })

  simplifiedToggle.addEventListener('click', (e) => {
    e.preventDefault()
    settings.simplified = !settings.simplified
    setToggle(simplifiedToggle, settings.simplified)
    persistSettings()
  })
}

// ── File loading ──────────────────────────────────────────────────────────────

loadBtn.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]
  if (!file) return
  loadBtn.disabled = true
  loadBtn.textContent = 'Loading…'
  try {
    const content = await file.text()
    const resp = await sendToContent({ type: 'LOAD_SUBTITLE', content, filename: file.name })
    if (resp?.ok) {
      subtitleStatus.textContent = `Loaded: ${file.name}`
      dotEl.className = 'dot dot-green'
    } else {
      subtitleStatus.textContent = 'Failed to load subtitle'
    }
  } finally {
    loadBtn.disabled = false
    loadBtn.textContent = 'Load Subtitle File (.srt / .vtt)'
    fileInput.value = ''
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  await loadSettingsFromStorage()
  initToggles()
  await refreshStatus()
}

init()
