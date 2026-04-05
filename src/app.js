import { extractSubtitles } from './lib/subtitle-extractor.js'
import { isChineseTrack, annotateCues } from './lib/pinyin.js'
import { isJapaneseTrack, annotateJapaneseCues } from './lib/japanese.js'
import { lookup } from './lib/dictionary.js'
import { lookup as lookupJa } from './lib/dictionary-ja.js'
import { getFrequencyStars } from './lib/frequency.js'
import { switchAudioTrack } from './lib/audio-switch.js'
import { toSimplified } from './lib/hanzi-convert.js'
import { createPlayer } from './player/video-player.js'
import { createSubtitleOverlay } from './player/subtitle-overlay.js'
import { createTranscriptPanel } from './player/transcript-panel.js'
import { createDictionaryPopup } from './player/dictionary-popup.js'

// ── SVG icon paths ──
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
const ICON_VOL_HIGH = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>'
const ICON_VOL_LOW = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>'
const ICON_VOL_MUTE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z" opacity="0.4"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'

// ── DOM elements ──
const fileInput = document.getElementById('file-input')
const folderInput = document.getElementById('folder-input')
const openFolderBtn = document.getElementById('open-folder-btn')
const videoEl = document.getElementById('video')
const overlayEl = document.getElementById('subtitle-overlay')
const landing = document.getElementById('landing')
const appEl = document.getElementById('app')
const playerArea = document.getElementById('player-area')
const transcriptPanel = document.getElementById('transcript-panel')
const toast = document.getElementById('toast')
const fileBrowser = document.getElementById('file-browser')
const fbTree = document.getElementById('fb-tree')
const fbTitle = document.getElementById('fb-title')
const fbClose = document.getElementById('fb-close')
const filesBtn = document.getElementById('files-btn')

// Controls
const playBtn = document.getElementById('play-btn')
const timeDisplay = document.getElementById('time-display')
const progressContainer = document.getElementById('progress-container')
const progressFill = document.getElementById('progress-fill')
const progressBuffered = document.getElementById('progress-buffered')
const progressHandle = document.getElementById('progress-handle')
const progressTooltip = document.getElementById('progress-tooltip')
const speedBtn = document.getElementById('speed-btn')
const volumeBtn = document.getElementById('volume-btn')
const volumeSlider = document.getElementById('volume-slider')
const subsBtn = document.getElementById('subs-btn')
const transcriptBtn = document.getElementById('transcript-btn')
const fullscreenBtn = document.getElementById('fullscreen-btn')

// Popups
const speedPopup = document.getElementById('speed-popup')
const subsPopup = document.getElementById('subs-popup')
const audioPopup = document.getElementById('audio-popup')
const settingsPopup = document.getElementById('settings-popup')
const primarySubOpts = document.getElementById('primary-sub-options')
const secondarySubOpts = document.getElementById('secondary-sub-options')
const audioOpts = document.getElementById('audio-options')

// Settings
const settingPinyin = document.getElementById('setting-pinyin')
const settingSimplified = document.getElementById('setting-simplified')

// ── State ──
const player = createPlayer(videoEl)
const overlay = createSubtitleOverlay(overlayEl, videoEl)
const transcript = createTranscriptPanel(transcriptPanel, videoEl)
const dictPopup = createDictionaryPopup(document.body)
let subtitleData = null
let currentFile = null
let audioTracks = []
let wasPausedBeforeLookup = false
let selectedPrimaryTrack = ''
let selectedSecondaryTrack = ''
let controlsTimer = null
let currentFolderFiles = [] // files from folder input or Electron IPC
let activeFilePath = null
let primaryTrackLang = 'zh' // 'zh' or 'ja' for current primary track

const VIDEO_EXTS = /\.(mkv|mp4|webm|avi|mov|m4v)$/i
const isElectron = typeof window.electronAPI !== 'undefined'

// ═══════════════════════ Drop zone ═══════════════════════

const dropZone = document.getElementById('drop-zone')

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over')
})

dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file) loadFile(file)
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0]
  if (file) loadFile(file)
})

// Open folder button on landing
openFolderBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  folderInput.click()
})

folderInput.addEventListener('change', () => {
  const files = Array.from(folderInput.files).filter((f) => VIDEO_EXTS.test(f.name))
  if (files.length === 0) return
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  currentFolderFiles = files
  showApp()
  populateFileBrowserFromFiles(files)
  fileBrowser.classList.remove('collapsed')
  filesBtn.classList.add('active')
  // Auto-play first file
  loadFile(files[0])
})

// ═══════════════════════ File browser ═══════════════════════

fbClose.addEventListener('click', () => {
  fileBrowser.classList.add('collapsed')
  filesBtn.classList.remove('active')
})

filesBtn.addEventListener('click', () => {
  fileBrowser.classList.toggle('collapsed')
  filesBtn.classList.toggle('active', !fileBrowser.classList.contains('collapsed'))
})

function showApp() {
  const landingEl = document.getElementById('landing')
  if (landingEl) landingEl.remove()
  appEl.hidden = false
}

// Build file browser from File[] (browser/folder input)
function populateFileBrowserFromFiles(files) {
  fbTree.innerHTML = ''
  // Build simple tree from webkitRelativePath
  const tree = buildTreeFromFiles(files)
  fbTitle.textContent = tree.name || 'Files'
  renderTree(tree.children, fbTree, files)
}

function buildTreeFromFiles(files) {
  const root = { name: '', children: [], files: [] }
  for (const file of files) {
    const parts = file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name]
    let node = root
    if (parts.length > 1 && !root.name) root.name = parts[0]
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.children.find((c) => c.name === parts[i])
      if (!child) {
        child = { name: parts[i], children: [], files: [] }
        node.children.push(child)
      }
      node = child
    }
    node.files.push({ name: parts[parts.length - 1], file })
  }
  // If root has a single child dir, flatten
  if (root.children.length === 1 && root.files.length === 0) {
    return root.children[0]
  }
  return root
}

function renderTreeNode(node, container) {
  // Render subdirectories
  for (const child of node.children) {
    if (child.children.length > 0 || child.files.length > 0) {
      const dirItem = document.createElement('div')
      dirItem.className = 'fb-item dir'
      dirItem.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg><span class="fb-name">${escapeHtml(child.name)}</span>`
      container.appendChild(dirItem)

      const childContainer = document.createElement('div')
      childContainer.className = 'fb-children'
      container.appendChild(childContainer)

      dirItem.addEventListener('click', () => {
        childContainer.classList.toggle('collapsed')
      })

      renderTreeNode(child, childContainer)
    }
  }

  // Render files at this level
  for (const f of node.files) {
    const fileItem = createFileItem(f.name, () => loadFile(f.file))
    container.appendChild(fileItem)
  }
}

function createFileItem(name, onClick) {
  const item = document.createElement('div')
  item.className = 'fb-item file'
  item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="fb-name">${escapeHtml(name)}</span>`
  item.addEventListener('click', () => {
    fbTree.querySelectorAll('.fb-item.active').forEach((el) => el.classList.remove('active'))
    item.classList.add('active')
    onClick()
  })
  return item
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ═══════════════════════ Electron IPC file browser ═══════════════════════

async function loadFolderFromPath(dirPath) {
  if (!isElectron) return
  showApp()
  fileBrowser.classList.remove('collapsed')
  filesBtn.classList.add('active')
  fbTitle.textContent = dirPath.split('/').pop() || dirPath
  await renderElectronDir(dirPath, fbTree)
}

async function renderElectronDir(dirPath, container) {
  container.innerHTML = ''
  const entries = await window.electronAPI.readDir(dirPath)

  // Back button to parent
  const parentPath = dirPath.replace(/\/[^/]+$/, '')
  if (parentPath && parentPath !== dirPath) {
    const back = document.createElement('div')
    back.className = 'fb-back'
    back.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg><span>Parent folder</span>`
    back.addEventListener('click', () => {
      fbTitle.textContent = parentPath.split('/').pop() || parentPath
      renderElectronDir(parentPath, container)
    })
    container.appendChild(back)
  }

  for (const entry of entries) {
    if (entry.isDir) {
      const dirItem = document.createElement('div')
      dirItem.className = 'fb-item dir'
      dirItem.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg><span class="fb-name">${escapeHtml(entry.name)}</span>`
      dirItem.addEventListener('click', () => {
        fbTitle.textContent = entry.name
        renderElectronDir(entry.path, container)
      })
      container.appendChild(dirItem)
    } else {
      const fileItem = createFileItem(entry.name, () => loadElectronFile(entry.path, entry.name))
      container.appendChild(fileItem)
    }
  }
}

async function loadElectronFile(filePath, fileName) {
  if (!isElectron) return
  activeFilePath = filePath
  showToastPersist(`Loading ${fileName}...`)
  const buffer = await window.electronAPI.readFile(filePath)
  if (!buffer) {
    showToast('Failed to read file')
    return
  }
  const file = new File([buffer], fileName)
  loadFile(file)
}

// ═══════════════════════ Electron startup ═══════════════════════

async function loadUrl(url) {
  currentFile = null

  selectedPrimaryTrack = ''
  selectedSecondaryTrack = ''

  showApp()
  player.loadUrl(url)
  videoEl.play().catch(() => {})

  videoEl.onerror = () => {
    showToast('Cannot play this URL. Check the link or try a different format.')
  }

  try {
    showToastPersist('Extracting subtitles...')
    const result = await extractSubtitles(url, {
      onProgress(bytes, total) {
        const pct = ((bytes / total) * 100).toFixed(0)
        showToastPersist(`Extracting subtitles... ${pct}%`)
      },
    })

    audioTracks = result.audioTracks
    populateAudioOptions(audioTracks)

    const { chineseTracks, japaneseTracks } = processSubtitleTracks(result)

    subtitleData = { tracks: result.tracks, subtitles: result.subtitles, chineseTracks, japaneseTracks }
    populateSubtitleOptions(result.tracks)
    autoSelectTracks(result.tracks, chineseTracks, japaneseTracks)

    showToast(`${result.tracks.length} subtitle, ${audioTracks.length} audio track(s)`)
  } catch (err) {
    showToast(`Subtitle extraction failed: ${err.message}`)
    console.error(err)
  }
}

async function handleElectronStartup() {
  if (!isElectron) return

  // Check for URL first
  const initialUrl = await window.electronAPI.getInitialUrl()
  if (initialUrl) {
    loadUrl(initialUrl)
    return
  }

  const initialPath = await window.electronAPI.getInitialPath()
  if (!initialPath) return

  // Check if it's a directory or file by trying to read it as a dir
  const entries = await window.electronAPI.readDir(initialPath)
  if (entries.length > 0) {
    // It's a directory
    await loadFolderFromPath(initialPath)
    // Auto-play first video file
    const firstVideo = entries.find((e) => !e.isDir)
    if (firstVideo) {
      loadElectronFile(firstVideo.path, firstVideo.name)
    }
  } else {
    // It's a file — load directly, and open its parent folder
    showApp()
    const parentDir = initialPath.replace(/\/[^/]+$/, '')
    const fileName = initialPath.split('/').pop()
    await loadFolderFromPath(parentDir)
    loadElectronFile(initialPath, fileName)
  }
}

handleElectronStartup()

// ═══════════════════════ Controls auto-hide ═══════════════════════

function showControls() {
  playerArea.classList.remove('controls-hidden')
  playerArea.classList.add('controls-visible')
  resetControlsTimer()
}

function hideControls() {
  if (videoEl.paused) return
  if (document.querySelector('.ctrl-popup.open')) return
  playerArea.classList.remove('controls-visible')
  playerArea.classList.add('controls-hidden')
}

function resetControlsTimer() {
  clearTimeout(controlsTimer)
  controlsTimer = setTimeout(hideControls, 3000)
}

playerArea.addEventListener('mousemove', showControls)
playerArea.addEventListener('mouseleave', () => {
  clearTimeout(controlsTimer)
  controlsTimer = setTimeout(hideControls, 800)
})

// ═══════════════════════ Play / Pause ═══════════════════════

playBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    videoEl.play().catch(() => {})
  } else {
    videoEl.pause()
  }
})

videoEl.addEventListener('play', updatePlayIcon)
videoEl.addEventListener('pause', updatePlayIcon)

function updatePlayIcon() {
  playBtn.innerHTML = videoEl.paused ? ICON_PLAY : ICON_PAUSE
  if (videoEl.paused) showControls()
}

// Single-click to pause, double-click to fullscreen
let clickTimer = null
playerArea.addEventListener('click', (e) => {
  if (e.target.closest('#controls-wrapper') || e.target.closest('#subtitle-overlay')) return
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return }
  clickTimer = setTimeout(() => {
    clickTimer = null
    if (videoEl.paused) videoEl.play().catch(() => {})
    else videoEl.pause()
  }, 250)
})

playerArea.addEventListener('dblclick', (e) => {
  if (e.target.closest('#controls-wrapper') || e.target.closest('#subtitle-overlay')) return
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
  toggleFullscreen()
})

// ═══════════════════════ Progress bar ═══════════════════════

let isSeeking = false

progressContainer.addEventListener('mousedown', (e) => {
  isSeeking = true
  seekTo(e)
})

document.addEventListener('mousemove', (e) => {
  if (isSeeking) seekTo(e)
  if (progressContainer.matches(':hover')) updateTooltip(e)
})

document.addEventListener('mouseup', () => {
  isSeeking = false
})

function seekTo(e) {
  const rect = progressContainer.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  if (videoEl.duration) videoEl.currentTime = pct * videoEl.duration
}

function updateTooltip(e) {
  const rect = progressContainer.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const time = videoEl.duration ? pct * videoEl.duration : 0
  progressTooltip.textContent = formatTime(time)
  progressTooltip.style.left = `${pct * 100}%`
}

videoEl.addEventListener('timeupdate', () => {
  if (!videoEl.duration) return
  const pct = (videoEl.currentTime / videoEl.duration) * 100
  progressFill.style.width = `${pct}%`
  progressHandle.style.left = `${pct}%`
  timeDisplay.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`
})

videoEl.addEventListener('progress', () => {
  if (!videoEl.duration || videoEl.buffered.length === 0) return
  const end = videoEl.buffered.end(videoEl.buffered.length - 1)
  progressBuffered.style.width = `${(end / videoEl.duration) * 100}%`
})

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
  return `${m}:${ss.toString().padStart(2, '0')}`
}

// ═══════════════════════ Speed ═══════════════════════

speedPopup.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-speed]')
  if (!btn) return
  const speed = parseFloat(btn.dataset.speed)
  videoEl.playbackRate = speed
  speedBtn.textContent = speed === 1 ? '1x' : `${speed}x`
  speedPopup.querySelectorAll('.popup-opt').forEach((o) => o.classList.toggle('active', o === btn))
  closeAllPopups()
})

// ═══════════════════════ Volume ═══════════════════════

volumeBtn.addEventListener('click', () => {
  videoEl.muted = !videoEl.muted
  updateVolumeIcon()
})

volumeSlider.addEventListener('input', () => {
  videoEl.volume = volumeSlider.value / 100
  videoEl.muted = false
  updateVolumeIcon()
})

videoEl.addEventListener('volumechange', updateVolumeIcon)

function updateVolumeIcon() {
  const vol = videoEl.muted ? 0 : videoEl.volume
  if (vol === 0) volumeBtn.innerHTML = ICON_VOL_MUTE
  else if (vol < 0.5) volumeBtn.innerHTML = ICON_VOL_LOW
  else volumeBtn.innerHTML = ICON_VOL_HIGH

  if (!videoEl.muted) volumeSlider.value = videoEl.volume * 100
  volumeSlider.style.setProperty('--vol-pct', `${videoEl.muted ? 0 : volumeSlider.value}%`)
}

// ═══════════════════════ Popup menus ═══════════════════════

const popupMap = new Map()
popupMap.set(speedBtn, speedPopup)
popupMap.set(subsBtn, subsPopup)
popupMap.set(document.getElementById('audio-btn'), audioPopup)
popupMap.set(document.getElementById('settings-btn'), settingsPopup)

for (const [btn, popup] of popupMap) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = popup.classList.contains('open')
    closeAllPopups()
    if (!isOpen) popup.classList.add('open')
  })
}

function closeAllPopups() {
  document.querySelectorAll('.ctrl-popup.open').forEach((p) => p.classList.remove('open'))
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.ctrl-popup') && !e.target.closest('.ctrl-btn')) {
    closeAllPopups()
  }
})

// ═══════════════════════ Transcript toggle ═══════════════════════

transcriptBtn.addEventListener('click', () => {
  transcriptPanel.classList.toggle('collapsed')
  transcriptBtn.classList.toggle('active', !transcriptPanel.classList.contains('collapsed'))
})

// Close button inside transcript
transcriptPanel.querySelector('.transcript-toggle').addEventListener('click', () => {
  transcriptPanel.classList.add('collapsed')
  transcriptBtn.classList.remove('active')
})

// ═══════════════════════ Fullscreen ═══════════════════════

fullscreenBtn.addEventListener('click', toggleFullscreen)

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    playerArea.requestFullscreen().catch(() => {})
  }
}

// ═══════════════════════ Settings ═══════════════════════

settingPinyin.addEventListener('change', () => {
  document.body.classList.toggle('hide-pinyin', !settingPinyin.checked)
})

settingSimplified.addEventListener('change', () => {
  const fn = settingSimplified.checked ? toSimplified : null
  overlay.setConverter(fn)
  transcript.setConverter(fn)
})

// ═══════════════════════ Word clicks ═══════════════════════

overlayEl.addEventListener('word-click', (e) => {
  const { word, anchorEl } = e.detail

  // Toggle: clicking the same word again dismisses the popup
  if (dictPopup.isShowingWord(word)) {
    dictPopup.hide()
    return
  }

  wasPausedBeforeLookup = videoEl.paused
  if (!videoEl.paused) videoEl.pause()

  const lang = primaryTrackLang
  const entries = lang === 'ja'
    ? lookupJa(word) || lookupJa(word.charAt(0))
    : lookup(word) || lookup(word.charAt(0))
  const frequency = getFrequencyStars(word, lang)
  if (entries) dictPopup.show(entries, anchorEl, { word, lang, frequency })
})

transcriptPanel.addEventListener('click', (e) => {
  const wordEl = e.target.closest('.transcript-word')
  if (!wordEl) return
  const word = wordEl.dataset.word

  if (dictPopup.isShowingWord(word)) {
    dictPopup.hide()
    return
  }

  wasPausedBeforeLookup = videoEl.paused
  if (!videoEl.paused) videoEl.pause()
  overlay.highlightWord(word)
  const lang = primaryTrackLang
  const entries = lang === 'ja' ? lookupJa(word) : lookup(word)
  const frequency = getFrequencyStars(word, lang)
  if (entries) dictPopup.show(entries, wordEl, { word, lang, frequency })
})

dictPopup.onDismiss(() => {
  overlay.clearHighlight()
  if (!wasPausedBeforeLookup) videoEl.play().catch(() => {})
})

// ═══════════════════════ Keyboard shortcuts ═══════════════════════

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

  switch (e.key) {
    case ' ':
      e.preventDefault()
      if (videoEl.paused) videoEl.play().catch(() => {})
      else videoEl.pause()
      break
    case 'ArrowLeft':
      e.preventDefault()
      videoEl.currentTime = Math.max(0, videoEl.currentTime - 6.5)
      break
    case 'ArrowRight':
      e.preventDefault()
      videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 6.5)
      break
    case 'ArrowUp':
      e.preventDefault()
      videoEl.volume = Math.min(1, videoEl.volume + 0.1)
      break
    case 'ArrowDown':
      e.preventDefault()
      videoEl.volume = Math.max(0, videoEl.volume - 0.1)
      break
    case 'm':
      videoEl.muted = !videoEl.muted
      break
    case 'f':
      toggleFullscreen()
      break
  }
})

// ═══════════════════════ Toast ═══════════════════════

let toastTimer = null
function showToast(msg) {
  toast.textContent = msg
  toast.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000)
}

function showToastPersist(msg) {
  toast.textContent = msg
  toast.classList.add('visible')
  clearTimeout(toastTimer)
}

function hideToast() {
  toast.classList.remove('visible')
}

// ═══════════════════════ Track processing (shared) ═══════════════════════

function processSubtitleTracks(result) {
  const chineseTracks = new Set()
  const japaneseTracks = new Set()

  for (const track of result.tracks) {
    const cues = result.subtitles.get(track.number) || []
    if (isJapaneseTrack(track, cues)) {
      japaneseTracks.add(track.number)
      showToastPersist(`Annotating furigana for "${track.name || track.language}"...`)
      annotateJapaneseCues(cues)
    } else if (isChineseTrack(track, cues)) {
      chineseTracks.add(track.number)
      showToastPersist(`Converting pinyin for "${track.name || track.language}"...`)
      annotateCues(cues)
    }
  }

  return { chineseTracks, japaneseTracks }
}

function autoSelectTracks(tracks, chineseTracks, japaneseTracks) {
  // Prefer CJK track as primary (Chinese or Japanese)
  const firstCJK = tracks.find((t) => chineseTracks.has(t.number) || japaneseTracks.has(t.number))
  if (firstCJK) {
    selectPrimaryTrack(String(firstCJK.number))
  } else if (tracks.length > 0) {
    selectPrimaryTrack(String(tracks[0].number))
  }

  // Auto-select first non-CJK track as secondary
  const firstOther = tracks.find((t) => !chineseTracks.has(t.number) && !japaneseTracks.has(t.number))
  if (firstOther && firstCJK) {
    selectSecondaryTrack(String(firstOther.number))
  }
}

// ═══════════════════════ File loading ═══════════════════════

async function loadFile(file) {
  currentFile = file

  selectedPrimaryTrack = ''
  selectedSecondaryTrack = ''

  showApp()

  player.load(file)
  videoEl.play().catch(() => {})

  videoEl.onerror = () => {
    showToast('Cannot play this codec. Try H.264/VP9 video.')
  }

  try {
    showToastPersist('Extracting subtitles...')
    const result = await extractSubtitles(file, {
      onProgress(bytes, total) {
        const pct = ((bytes / total) * 100).toFixed(0)
        showToastPersist(`Extracting subtitles... ${pct}%`)
      },
    })

    audioTracks = result.audioTracks
    populateAudioOptions(audioTracks)

    const { chineseTracks, japaneseTracks } = processSubtitleTracks(result)

    subtitleData = { tracks: result.tracks, subtitles: result.subtitles, chineseTracks, japaneseTracks }
    populateSubtitleOptions(result.tracks)
    autoSelectTracks(result.tracks, chineseTracks, japaneseTracks)

    showToast(`${result.tracks.length} subtitle, ${audioTracks.length} audio track(s)`)
  } catch (err) {
    showToast(`Extraction failed: ${err.message}`)
    console.error(err)
  }
}

// ═══════════════════════ Subtitle selection ═══════════════════════

function populateSubtitleOptions(tracks) {
  const makeOptions = (container, selected) => {
    container.innerHTML = ''
    const offBtn = document.createElement('button')
    offBtn.className = 'popup-opt' + (selected === '' ? ' active' : '')
    offBtn.dataset.track = ''
    offBtn.textContent = 'Off'
    container.appendChild(offBtn)

    for (const track of tracks) {
      const btn = document.createElement('button')
      btn.className = 'popup-opt' + (selected === String(track.number) ? ' active' : '')
      btn.dataset.track = track.number
      btn.textContent = `${track.name || 'Track ' + track.number} [${track.language || '?'}]`
      container.appendChild(btn)
    }
  }

  makeOptions(primarySubOpts, selectedPrimaryTrack)
  makeOptions(secondarySubOpts, selectedSecondaryTrack)
}

primarySubOpts.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-track]')
  if (!btn) return
  selectPrimaryTrack(btn.dataset.track)
  closeAllPopups()
})

secondarySubOpts.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-track]')
  if (!btn) return
  selectSecondaryTrack(btn.dataset.track)
  closeAllPopups()
})

function selectPrimaryTrack(trackStr) {
  selectedPrimaryTrack = trackStr
  primarySubOpts.querySelectorAll('.popup-opt').forEach((o) =>
    o.classList.toggle('active', o.dataset.track === trackStr)
  )

  const trackNum = Number(trackStr)
  if (!subtitleData || !trackNum) {
    overlay.clear()
    transcript.clear()
    return
  }

  const cues = subtitleData.subtitles.get(trackNum) || []
  const chinese = subtitleData.chineseTracks.has(trackNum)
  const japanese = subtitleData.japaneseTracks?.has(trackNum) || false
  primaryTrackLang = japanese ? 'ja' : 'zh'
  overlay.setTrack(cues, chinese || japanese, japanese)
  overlay.sync()
  transcript.setTrack(cues, chinese || japanese, japanese)
  transcript.sync()

  // Re-apply secondary
  applySecondaryTrack()
}

function selectSecondaryTrack(trackStr) {
  selectedSecondaryTrack = trackStr
  secondarySubOpts.querySelectorAll('.popup-opt').forEach((o) =>
    o.classList.toggle('active', o.dataset.track === trackStr)
  )
  applySecondaryTrack()
}

function applySecondaryTrack() {
  const trackNum = Number(selectedSecondaryTrack)
  if (!subtitleData || !trackNum) {
    overlay.setEnglishTrack([])
    return
  }
  const cues = subtitleData.subtitles.get(trackNum) || []
  overlay.setEnglishTrack(cues)
  overlay.sync()
}

// ═══════════════════════ Audio selection ═══════════════════════

function populateAudioOptions(tracks) {
  audioOpts.innerHTML = ''
  if (tracks.length === 0) {
    const btn = document.createElement('button')
    btn.className = 'popup-opt active'
    btn.textContent = 'None'
    audioOpts.appendChild(btn)
    return
  }

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    const btn = document.createElement('button')
    btn.className = 'popup-opt' + (i === 0 ? ' active' : '')
    btn.dataset.idx = i
    btn.textContent = `${t.name || 'Track ' + t.number} [${t.language || '?'}]`
    audioOpts.appendChild(btn)
  }
}

audioOpts.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-idx]')
  if (!btn) return
  const idx = Number(btn.dataset.idx)
  closeAllPopups()

  audioOpts.querySelectorAll('.popup-opt').forEach((o) => o.classList.toggle('active', o === btn))

  try {
    switchAudioTrack(videoEl, idx)
    showToast(`Audio: ${audioTracks[idx]?.name || 'Track ' + idx}`)
  } catch (err) {
    showToast(`Audio switch failed: ${err.message}`)
    console.error(err)
  }
})
