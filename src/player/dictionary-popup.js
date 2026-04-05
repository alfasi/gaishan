/**
 * Dictionary popup for Chinese/Japanese words.
 * Shows word, reading, definitions, pronunciation button, and frequency stars.
 */
import {
  hasPronunciationAudio,
  playPronunciation,
  stopPronunciationPlayback,
} from '../lib/pronunciation-audio.js'

export function createDictionaryPopup(containerEl) {
  const popup = document.createElement('div')
  popup.id = 'dict-popup'
  popup.hidden = true
  containerEl.appendChild(popup)
  let onDismissCallback = null
  let currentWord = null
  let currentEntry = null
  let currentLang = 'zh'

  function show(entries, anchorEl, options = {}) {
    if (!entries || entries.length === 0) {
      hide()
      return
    }

    const { lang = 'zh', frequency = null, word: lookupWord = null } = options
    currentWord = lookupWord || entries[0].simplified || entries[0].word || null
    currentEntry = entries[0]
    currentLang = lang

    const entry = entries[0]
    const isJapanese = lang === 'ja'

    popup.innerHTML = ''

    // Header: word + reading + pronunciation control
    const header = document.createElement('div')
    header.className = 'dict-header'

    const wordEl = document.createElement('span')
    wordEl.className = 'dict-word'
    wordEl.textContent = isJapanese
      ? (entry.word || entry.simplified)
      : entry.simplified
    header.appendChild(wordEl)

    if (!isJapanese && entry.traditional !== entry.simplified) {
      const tradEl = document.createElement('span')
      tradEl.className = 'dict-traditional'
      tradEl.textContent = entry.traditional
      header.appendChild(tradEl)
    }

    const readingEl = document.createElement('span')
    readingEl.className = 'dict-pinyin'
    readingEl.textContent = isJapanese ? (entry.reading || '') : entry.pinyin
    header.appendChild(readingEl)

    // Recorded pronunciation button
    const speakBtn = document.createElement('button')
    speakBtn.className = 'dict-speak-btn'
    speakBtn.title = 'Listen'
    speakBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>'
    const canPlay = hasPronunciationAudio(entry, currentWord, lang)
    speakBtn.disabled = !canPlay
    speakBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!canPlay) return
      try {
        await playPronunciation(currentEntry, currentWord, currentLang)
      } catch (err) {
        console.warn('Pronunciation playback failed', err)
      }
    })
    header.appendChild(speakBtn)

    popup.appendChild(header)

    // Frequency stars
    if (frequency != null && frequency >= 1 && frequency <= 5) {
      const starsEl = document.createElement('div')
      starsEl.className = 'dict-stars'
      starsEl.title = `Frequency: ${frequency}/5`
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span')
        star.className = i <= frequency ? 'star filled' : 'star'
        star.textContent = i <= frequency ? '\u2605' : '\u2606'
        starsEl.appendChild(star)
      }
      const freqLabel = document.createElement('span')
      freqLabel.className = 'dict-freq-label'
      freqLabel.textContent = frequency >= 4 ? 'Very common' : frequency >= 3 ? 'Common' : frequency >= 2 ? 'Uncommon' : 'Rare'
      starsEl.appendChild(freqLabel)
      popup.appendChild(starsEl)
    }

    // Definitions — show all entries if multiple readings
    for (const e of entries) {
      if (entries.length > 1 && e !== entry) {
        const altReading = document.createElement('div')
        altReading.className = 'dict-alt-pinyin'
        altReading.textContent = isJapanese ? (e.reading || '') : e.pinyin
        popup.appendChild(altReading)
      }

      const defList = document.createElement('ol')
      defList.className = 'dict-defs'
      for (const def of e.definitions) {
        const li = document.createElement('li')
        li.textContent = def
        defList.appendChild(li)
      }
      popup.appendChild(defList)
    }

    popup.hidden = false
    positionPopup(anchorEl)
  }

  function positionPopup(anchorEl) {
    const anchorRect = anchorEl.getBoundingClientRect()
    const popupRect = popup.getBoundingClientRect()
    const viewW = window.innerWidth
    const viewH = window.innerHeight

    let top = anchorRect.top - popupRect.height - 24
    if (top < 4) {
      top = anchorRect.bottom + 12
    }

    let left = anchorRect.left + anchorRect.width / 2 - popupRect.width / 2
    left = Math.max(4, Math.min(left, viewW - popupRect.width - 4))
    top = Math.max(4, Math.min(top, viewH - popupRect.height - 4))

    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
  }

  function hide() {
    if (popup.hidden) return
    popup.hidden = true
    popup.innerHTML = ''
    currentWord = null
    currentEntry = null
    stopPronunciationPlayback()
    if (onDismissCallback) onDismissCallback()
  }

  function isShowingWord(word) {
    return !popup.hidden && currentWord === word
  }

  function onDismiss(cb) {
    onDismissCallback = cb
  }

  document.addEventListener('mousedown', (e) => {
    if (!popup.hidden && !popup.contains(e.target)) {
      hide()
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide()
  })

  return { show, hide, onDismiss, isShowingWord }
}
