/**
 * Gaishan browser extension — content script.
 *
 * Generic pages : user manually loads an SRT/VTT file via the floating panel.
 * Netflix        : subtitle files are intercepted automatically from the network;
 *                  no manual loading required.
 */

import { isChineseTrack, annotateCues } from '../lib/pinyin.js'
import { isJapaneseTrack, annotateJapaneseCues } from '../lib/japanese.js'
import { lookup } from '../lib/dictionary.js'
import { lookup as lookupJa } from '../lib/dictionary-ja.js'
import { getFrequencyStars } from '../lib/frequency.js'
import { toSimplified } from '../lib/hanzi-convert.js'
import { parseSubtitleFile } from '../lib/subtitle-parser.js'
import { createSubtitleOverlay } from '../player/subtitle-overlay.js'
import { createTranscriptPanel } from '../player/transcript-panel.js'
import { createDictionaryPopup } from '../player/dictionary-popup.js'
import {
  injectInterceptor,
  listenForSubtitles,
  hideNetflixSubtitles,
  findNetflixVideo,
} from './netflix.js'
import overlayCSS from './content.css?raw'

const STORAGE_KEY = 'gaishan-settings'
const IS_NETFLIX  = location.hostname.includes('netflix.com')

// ── State ─────────────────────────────────────────────────────────────────────

let settings = { showReadings: true, simplified: false }
let activeVideo        = null
let overlayInstance    = null
let transcriptInstance = null
let dictPopupInstance  = null
let wasPausedBeforeLookup = false
let currentLang = 'zh'
let unlistenSubtitles = null // cleanup fn from Netflix subtitle listener

// DOM refs inside #gaishan-root
let rootEl              = null
let overlayContainerEl  = null
let subtitleOverlayEl   = null
let transcriptPanelEl   = null
let panelEl             = null
let panelBodyEl         = null
let statusEl            = null

// ── Settings ──────────────────────────────────────────────────────────────────

function loadSettings() {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line no-undef
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        // eslint-disable-next-line no-undef
        if (chrome.runtime.lastError) { resolve(settings); return }
        if (result[STORAGE_KEY]) settings = { ...settings, ...result[STORAGE_KEY] }
        resolve(settings)
      })
    } catch { resolve(settings) }
  })
}

function saveSettings() {
  try {
    // eslint-disable-next-line no-undef
    chrome.storage.local.set({ [STORAGE_KEY]: settings })
  } catch { /* no storage */ }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  await loadSettings()

  // Inject shared CSS
  if (!document.getElementById('gaishan-styles')) {
    const style = document.createElement('style')
    style.id = 'gaishan-styles'
    style.textContent = overlayCSS
    document.head.appendChild(style)
  }

  // On Netflix: inject the network interceptor immediately
  if (IS_NETFLIX) injectInterceptor()

  tryAttachToVideo()

  // Watch for dynamically added / replaced video elements (SPAs)
  const observer = new MutationObserver(() => {
    if (!activeVideo || !document.contains(activeVideo)) {
      activeVideo = null
      tryAttachToVideo()
    } else if (!activeVideo) {
      tryAttachToVideo()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // Extension-popup messages
  try {
    // eslint-disable-next-line no-undef
    chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
      handleMessage(msg, respond)
      return true
    })
  } catch { /* no chrome API */ }
}

function tryAttachToVideo() {
  const video = IS_NETFLIX ? findNetflixVideo() : findBestVideo()
  if (video) attachToVideo(video)
}

function findBestVideo() {
  let best = null, bestArea = 0
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect()
    const area = r.width * r.height
    if (area > bestArea) { bestArea = area; best = v }
  }
  return best
}

// ── Attach to video ───────────────────────────────────────────────────────────

function attachToVideo(videoEl) {
  if (activeVideo === videoEl) return
  activeVideo = videoEl

  // Tear down previous Netflix listener if any
  unlistenSubtitles?.()
  unlistenSubtitles = null

  if (rootEl) rootEl.remove()

  // ── Root container ──
  rootEl = document.createElement('div')
  rootEl.id = 'gaishan-root'
  document.documentElement.appendChild(rootEl)

  // ── Subtitle overlay container ──
  overlayContainerEl = document.createElement('div')
  overlayContainerEl.id = 'gaishan-overlay-container'
  rootEl.appendChild(overlayContainerEl)

  subtitleOverlayEl = document.createElement('div')
  subtitleOverlayEl.id = 'gaishan-subtitle-overlay'
  overlayContainerEl.appendChild(subtitleOverlayEl)

  // ── Dictionary popup container ──
  const dictContainerEl = document.createElement('div')
  dictContainerEl.id = 'gaishan-dict-container'
  rootEl.appendChild(dictContainerEl)

  // ── Transcript panel ──
  transcriptPanelEl = buildTranscriptPanel()
  rootEl.appendChild(transcriptPanelEl)

  // ── Control panel ──
  buildControlPanel(videoEl)

  // ── Overlay + popup instances ──
  overlayInstance    = createSubtitleOverlay(subtitleOverlayEl, videoEl)
  transcriptInstance = createTranscriptPanel(transcriptPanelEl, videoEl)
  dictPopupInstance  = createDictionaryPopup(dictContainerEl)

  // Word click from subtitle overlay
  subtitleOverlayEl.addEventListener('word-click', (e) => {
    handleWordClick(e.detail.word, e.detail.anchorEl, videoEl)
  })

  // Word click from transcript panel
  transcriptPanelEl.addEventListener('click', (e) => {
    const wordEl = e.target.closest('.transcript-word')
    if (!wordEl) return
    handleWordClick(wordEl.dataset.word, wordEl, videoEl)
  })

  dictPopupInstance.onDismiss(() => {
    overlayInstance.clearHighlight()
    if (!wasPausedBeforeLookup) videoEl.play().catch(() => {})
  })

  // Position updates
  updatePositions()
  const ro = new ResizeObserver(updatePositions)
  ro.observe(videoEl)
  document.addEventListener('scroll',          updatePositions, { passive: true })
  window.addEventListener('resize',            updatePositions)
  document.addEventListener('fullscreenchange', updatePositions)

  // ── Netflix-specific: auto subtitle ──
  if (IS_NETFLIX) {
    unlistenSubtitles = listenForSubtitles(({ cues, lang, isChinese, isJapanese }) => {
      currentLang = lang
      overlayInstance.setTrack(cues, isChinese || isJapanese, isJapanese)
      overlayInstance.sync()
      transcriptInstance.setTrack(cues, isChinese || isJapanese, isJapanese)
      transcriptInstance.sync()
      hideNetflixSubtitles()
      if (statusEl) statusEl.textContent = `Auto-detected (${lang === 'ja' ? 'Japanese' : 'Chinese'})`
      // Show simplified toggle only for Chinese
      if (panelBodyEl) {
        const simpRow = panelBodyEl.querySelector('#gs-simplified-row')
        if (simpRow) simpRow.style.display = lang === 'ja' ? 'none' : ''
      }
      applySettings()
    })
  }

  applySettings()
}

// ── Positions ─────────────────────────────────────────────────────────────────

function updatePositions() {
  if (!activeVideo || !overlayContainerEl) return
  const rect = activeVideo.getBoundingClientRect()
  overlayContainerEl.style.cssText =
    `position:fixed;top:${rect.top}px;left:${rect.left}px;` +
    `width:${rect.width}px;height:${rect.height}px;pointer-events:none;`
  if (panelEl) {
    panelEl.style.top   = `${rect.top + 8}px`
    panelEl.style.right = `${window.innerWidth - rect.right + 8}px`
  }
}

// ── Transcript panel DOM ──────────────────────────────────────────────────────

function buildTranscriptPanel() {
  const panel = document.createElement('div')
  panel.id = 'gaishan-transcript-panel'

  const header = document.createElement('div')
  header.className = 'gs-transcript-header'

  const title = document.createElement('span')
  title.className = 'gs-transcript-title'
  title.textContent = 'Transcript'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'gs-transcript-close'
  closeBtn.innerHTML = '&times;'
  closeBtn.addEventListener('click', () => closeTranscript())

  header.appendChild(title)
  header.appendChild(closeBtn)
  panel.appendChild(header)

  // .transcript-list is the anchor used by createTranscriptPanel
  const list = document.createElement('div')
  list.className = 'gs-transcript-body'

  const innerList = document.createElement('div')
  innerList.className = 'transcript-list'
  list.appendChild(innerList)
  panel.appendChild(list)

  return panel
}

function openTranscript() {
  transcriptPanelEl?.classList.add('open')
  panelBodyEl?.querySelector('#gs-transcript-btn')?.classList.add('active')
}

function closeTranscript() {
  transcriptPanelEl?.classList.remove('open')
  panelBodyEl?.querySelector('#gs-transcript-btn')?.classList.remove('active')
}

// ── Control panel DOM ─────────────────────────────────────────────────────────

function buildControlPanel(videoEl) {
  panelEl = document.createElement('div')
  panelEl.id = 'gaishan-panel'
  rootEl.appendChild(panelEl)

  // Trigger icon
  const trigger = document.createElement('div')
  trigger.id = 'gaishan-trigger'
  trigger.title = 'Gaishan'
  trigger.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
    ` stroke-width="1.8" width="18" height="18">` +
    `<rect x="2" y="4" width="20" height="16" rx="3"/>` +
    `<line x1="6" y1="12" x2="12" y2="12"/>` +
    `<line x1="6" y1="16" x2="18" y2="16"/>` +
    `</svg>`
  panelEl.appendChild(trigger)

  panelBodyEl = document.createElement('div')
  panelBodyEl.id = 'gaishan-panel-body'
  panelEl.appendChild(panelBodyEl)

  // Logo
  const logo = document.createElement('div')
  logo.className = 'gs-logo'
  logo.textContent = 'Gaishan'
  panelBodyEl.appendChild(logo)

  if (IS_NETFLIX) {
    // Netflix: show auto-detection status
    statusEl = document.createElement('div')
    statusEl.className = 'gs-status'
    statusEl.textContent = 'Waiting for CJK subtitles…'
    panelBodyEl.appendChild(statusEl)
  } else {
    // Generic: manual subtitle loading
    const loadBtn = document.createElement('button')
    loadBtn.className = 'gs-btn'
    loadBtn.textContent = 'Load Subtitle (.srt / .vtt)'
    panelBodyEl.appendChild(loadBtn)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.srt,.vtt'
    fileInput.style.display = 'none'
    panelBodyEl.appendChild(fileInput)

    statusEl = document.createElement('div')
    statusEl.className = 'gs-status'
    statusEl.textContent = 'No subtitle loaded'
    panelBodyEl.appendChild(statusEl)

    loadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click() })
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]
      if (!file) return
      const text = await file.text()
      await loadSubtitleContent(text, file.name)
      if (statusEl) statusEl.textContent = file.name
      fileInput.value = ''
    })
  }

  // Transcript toggle button
  const divider1 = document.createElement('div')
  divider1.className = 'gs-divider'
  panelBodyEl.appendChild(divider1)

  const transcriptBtn = document.createElement('button')
  transcriptBtn.className = 'gs-btn'
  transcriptBtn.id = 'gs-transcript-btn'
  transcriptBtn.textContent = 'Show Transcript'
  transcriptBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (transcriptPanelEl?.classList.contains('open')) {
      closeTranscript()
      transcriptBtn.textContent = 'Show Transcript'
    } else {
      openTranscript()
      transcriptBtn.textContent = 'Hide Transcript'
    }
  })
  panelBodyEl.appendChild(transcriptBtn)

  // Settings divider + toggles
  const divider2 = document.createElement('div')
  divider2.className = 'gs-divider'
  panelBodyEl.appendChild(divider2)

  const readingsLabel = makeToggle('Show Readings', 'gs-readings-cb', settings.showReadings)
  panelBodyEl.appendChild(readingsLabel)

  const simplifiedLabel = makeToggle('Simplified', 'gs-simplified-cb', settings.simplified)
  simplifiedLabel.id = 'gs-simplified-row'
  panelBodyEl.appendChild(simplifiedLabel)

  // Event: toggle panel body on trigger click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    panelBodyEl.classList.toggle('visible')
  })

  document.addEventListener('click', (e) => {
    if (panelEl && !panelEl.contains(e.target)) panelBodyEl.classList.remove('visible')
  })

  // Settings change
  const readingsCb  = panelBodyEl.querySelector('#gs-readings-cb')
  const simplifiedCb = panelBodyEl.querySelector('#gs-simplified-cb')

  readingsCb.addEventListener('change', () => {
    settings.showReadings = readingsCb.checked
    applySettings(); saveSettings()
  })
  simplifiedCb.addEventListener('change', () => {
    settings.simplified = simplifiedCb.checked
    applySettings(); saveSettings()
  })
}

function makeToggle(label, inputId, checked) {
  const el = document.createElement('label')
  el.className = 'gs-toggle'
  el.innerHTML =
    `<span>${label}</span>` +
    `<input type="checkbox" id="${inputId}"${checked ? ' checked' : ''}>` +
    `<span class="gs-toggle-track"></span>`
  return el
}

// ── Word click ────────────────────────────────────────────────────────────────

function handleWordClick(word, anchorEl, videoEl) {
  if (dictPopupInstance.isShowingWord(word)) {
    dictPopupInstance.hide()
    return
  }
  wasPausedBeforeLookup = videoEl.paused
  if (!videoEl.paused) videoEl.pause()

  const entries = currentLang === 'ja'
    ? (lookupJa(word) || lookupJa(word.charAt(0)))
    : (lookup(word)   || lookup(word.charAt(0)))
  const frequency = getFrequencyStars(word, currentLang)
  if (entries) dictPopupInstance.show(entries, anchorEl, { word, lang: currentLang, frequency })
}

// ── Manual subtitle loading (non-Netflix) ─────────────────────────────────────

async function loadSubtitleContent(text, filename) {
  if (!overlayInstance) return
  const cues = parseSubtitleFile(text, filename)
  if (!cues.length) return

  const trackMeta = { language: '', name: filename }
  const isJa = isJapaneseTrack(trackMeta, cues)
  const isZh = !isJa && isChineseTrack(trackMeta, cues)
  currentLang = isJa ? 'ja' : 'zh'

  if (isJa)      annotateJapaneseCues(cues)
  else if (isZh) annotateCues(cues)

  overlayInstance.setTrack(cues, isZh || isJa, isJa)
  overlayInstance.sync()
  transcriptInstance.setTrack(cues, isZh || isJa, isJa)
  transcriptInstance.sync()

  if (panelBodyEl) {
    const simpRow = panelBodyEl.querySelector('#gs-simplified-row')
    if (simpRow) simpRow.style.display = isJa ? 'none' : ''
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

function applySettings() {
  if (!rootEl) return
  rootEl.classList.toggle('hide-readings', !settings.showReadings)
  overlayInstance?.setConverter(settings.simplified ? toSimplified : null)
  transcriptInstance?.setConverter(settings.simplified ? toSimplified : null)
}

// ── Extension popup messages ──────────────────────────────────────────────────

function handleMessage(msg, respond) {
  ;(async () => {
    try {
      switch (msg.type) {
        case 'GET_STATUS':
          respond({
            videoFound: !!activeVideo,
            lang: currentLang,
            statusText: statusEl ? statusEl.textContent : 'No subtitle loaded',
            isNetflix: IS_NETFLIX,
          })
          break
        case 'LOAD_SUBTITLE':
          await loadSubtitleContent(msg.content, msg.filename)
          if (statusEl) statusEl.textContent = msg.filename
          respond({ ok: true })
          break
        case 'UPDATE_SETTINGS':
          settings = { ...settings, ...msg.settings }
          applySettings(); saveSettings()
          if (panelBodyEl) {
            const rc = panelBodyEl.querySelector('#gs-readings-cb')
            const sc = panelBodyEl.querySelector('#gs-simplified-cb')
            if (rc) rc.checked = settings.showReadings
            if (sc) sc.checked = settings.simplified
          }
          respond({ ok: true })
          break
        default:
          respond({ ok: false, error: 'Unknown message type' })
      }
    } catch (err) { respond({ ok: false, error: String(err) }) }
  })()
}

// ── Boot ──────────────────────────────────────────────────────────────────────

init()
