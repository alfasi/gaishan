/**
 * Scrollable transcript panel showing all subtitle cues.
 * Auto-scrolls to the active cue and supports click-to-seek.
 * Shows pinyin annotations for Chinese tracks and furigana for Japanese tracks.
 */
export function createTranscriptPanel(panelEl, videoEl) {
  const listEl = panelEl.querySelector('.transcript-list')

  let cues = []
  let isChinese = false
  let isJapanese = false
  let cueElements = []
  let lastActiveIdx = -1
  let convertText = null

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function setTrack(trackCues, chinese, japanese = false) {
    cues = trackCues
    isChinese = chinese
    isJapanese = japanese
    lastActiveIdx = -1
    render()
  }

  function clear() {
    cues = []
    isChinese = false
    isJapanese = false
    cueElements = []
    lastActiveIdx = -1
    listEl.innerHTML = ''
  }

  function hasKanji(text) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
  }

  function render() {
    listEl.innerHTML = ''
    cueElements = []

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]
      const row = document.createElement('div')
      row.className = 'transcript-row'

      const timeEl = document.createElement('span')
      timeEl.className = 'transcript-time'
      timeEl.textContent = formatTime(cue.time)
      row.appendChild(timeEl)

      const textContainer = document.createElement('span')
      textContainer.className = 'transcript-text'

      if (isJapanese && cue.wordTokens) {
        // Furigana reading line
        const readingLine = document.createElement('span')
        readingLine.className = 'transcript-pinyin'
        const readings = []
        for (const token of cue.wordTokens) {
          if (token.reading && hasKanji(token.word)) {
            readings.push(token.reading)
          }
        }
        readingLine.textContent = readings.join(' ')
        textContainer.appendChild(readingLine)

        // Word-segmented text (clickable words)
        const textLine = document.createElement('span')
        for (const token of cue.wordTokens) {
          const span = document.createElement('span')
          if (token.isWord) {
            span.className = 'transcript-word'
            span.dataset.word = token.word
          }
          span.textContent = token.word
          textLine.appendChild(span)
        }
        textContainer.appendChild(textLine)
      } else if (isChinese && cue.wordTokens) {
        // Pinyin line
        const pinyinLine = document.createElement('span')
        pinyinLine.className = 'transcript-pinyin'
        const pinyinParts = []
        for (const token of cue.wordTokens) {
          for (const ch of token.chars) {
            if (ch.pinyin) pinyinParts.push(ch.pinyin)
          }
          if (token.chars.some((c) => c.pinyin)) pinyinParts.push(' ')
        }
        pinyinLine.textContent = pinyinParts.join('').trim()
        textContainer.appendChild(pinyinLine)

        // Word-segmented text (clickable words)
        const textLine = document.createElement('span')
        for (const token of cue.wordTokens) {
          const span = document.createElement('span')
          if (token.isWord) {
            span.className = 'transcript-word'
            span.dataset.word = token.word
          }
          span.textContent = convertText ? convertText(token.word) : token.word
          textLine.appendChild(span)
        }
        textContainer.appendChild(textLine)
      } else {
        textContainer.textContent = cue.text
      }

      row.appendChild(textContainer)

      // Click to seek
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('transcript-word')) return
        videoEl.currentTime = cue.time / 1000
      })

      listEl.appendChild(row)
      cueElements.push(row)
    }
  }

  function sync() {
    if (cues.length === 0) return

    const timeMs = videoEl.currentTime * 1000

    let activeIdx = -1
    for (let i = 0; i < cues.length; i++) {
      if (timeMs >= cues[i].time && timeMs < cues[i].time + cues[i].duration) {
        activeIdx = i
        break
      }
    }

    if (activeIdx === -1) {
      for (let i = cues.length - 1; i >= 0; i--) {
        if (cues[i].time <= timeMs) {
          activeIdx = i
          break
        }
      }
    }

    if (activeIdx === lastActiveIdx) return
    lastActiveIdx = activeIdx

    for (let i = 0; i < cueElements.length; i++) {
      cueElements[i].classList.toggle('active', i === activeIdx)
    }

    if (activeIdx >= 0 && cueElements[activeIdx]) {
      cueElements[activeIdx].scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  function setConverter(fn) {
    convertText = fn || null
    render()
  }

  videoEl.addEventListener('timeupdate', sync)
  videoEl.addEventListener('seeked', sync)

  return { setTrack, clear, sync, setConverter }
}
