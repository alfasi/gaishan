/**
 * Subtitle overlay that syncs to video playback and renders
 * clickable words with optional pinyin/furigana annotations.
 *
 * Supports Chinese (per-character pinyin) and Japanese (word-level furigana).
 * Also shows an English track beneath the primary subtitles.
 */
export function createSubtitleOverlay(overlayEl, videoEl) {
  let cues = []
  let englishCues = []
  let isChinese = false
  let isJapanese = false
  let showEnglish = true
  let hasEnglishTrack = false
  let lastRenderedKey = null
  let highlightedWord = null
  let convertText = null

  function setTrack(trackCues, chinese, japanese = false) {
    cues = trackCues
    isChinese = chinese
    isJapanese = japanese
    lastRenderedKey = null
    highlightedWord = null
    overlayEl.innerHTML = ''
  }

  function setEnglishTrack(trackCues) {
    englishCues = trackCues
    hasEnglishTrack = trackCues.length > 0
    lastRenderedKey = null
  }

  function setShowEnglish(show) {
    showEnglish = show
    lastRenderedKey = null
    sync()
  }

  function setConverter(fn) {
    convertText = fn || null
    lastRenderedKey = null
    sync()
  }

  function clear() {
    cues = []
    englishCues = []
    isChinese = false
    isJapanese = false
    hasEnglishTrack = false
    lastRenderedKey = null
    highlightedWord = null
    overlayEl.innerHTML = ''
  }

  function findActiveCues(timeMs, cueList) {
    const active = []
    for (let i = 0; i < cueList.length; i++) {
      const cue = cueList[i]
      if (timeMs >= cue.time && timeMs < cue.time + cue.duration) {
        active.push(cue)
      }
      if (cue.time > timeMs + 10000) break
    }
    return active
  }

  function renderCues(activeCues, activeEnglish) {
    overlayEl.innerHTML = ''
    for (const cue of activeCues) {
      const line = document.createElement('div')
      line.className = 'subtitle-line'

      if (isJapanese && cue.wordTokens) {
        renderJapaneseLine(line, cue.wordTokens)
      } else if (isChinese && cue.wordTokens) {
        renderChineseLine(line, cue.wordTokens)
      } else {
        renderPlainLine(line, cue.text)
      }

      overlayEl.appendChild(line)
    }

    if (showEnglish && hasEnglishTrack) {
      const engLine = document.createElement('div')
      engLine.className = 'subtitle-line-english'
      if (activeEnglish.length > 0) {
        engLine.textContent = activeEnglish.map((c) => c.text).join(' ')
      } else {
        engLine.classList.add('empty')
        engLine.textContent = '\u00A0'
      }
      overlayEl.appendChild(engLine)
    }
  }

  function renderChineseLine(container, wordTokens) {
    for (const token of wordTokens) {
      if (token.isWord) {
        const wordSpan = document.createElement('span')
        wordSpan.className = 'word'
        wordSpan.dataset.word = token.word

        if (highlightedWord === token.word) {
          wordSpan.classList.add('highlighted')
        }

        for (const ch of token.chars) {
          wordSpan.appendChild(createCharSpan(ch))
        }

        wordSpan.addEventListener('click', onWordClick)
        container.appendChild(wordSpan)
      } else {
        for (const ch of token.chars) {
          container.appendChild(createCharSpan(ch))
        }
      }
    }
  }

  function renderJapaneseLine(container, wordTokens) {
    for (const token of wordTokens) {
      if (token.isWord) {
        const wordSpan = document.createElement('span')
        wordSpan.className = 'word'
        wordSpan.dataset.word = token.word

        if (highlightedWord === token.word) {
          wordSpan.classList.add('highlighted')
        }

        // Japanese: word-level furigana above kanji words
        if (token.reading && hasKanji(token.word)) {
          const ruby = document.createElement('ruby')
          ruby.textContent = token.word
          const rt = document.createElement('rt')
          rt.textContent = token.reading
          ruby.appendChild(rt)
          wordSpan.appendChild(ruby)
        } else {
          wordSpan.textContent = token.word
        }

        wordSpan.addEventListener('click', onWordClick)
        container.appendChild(wordSpan)
      } else {
        const span = document.createElement('span')
        span.className = 'char'
        span.textContent = token.word
        container.appendChild(span)
      }
    }
  }

  function hasKanji(text) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
  }

  function createCharSpan(ch) {
    const displayChar = convertText ? convertText(ch.char) : ch.char
    const span = document.createElement('span')
    span.className = 'char'
    span.dataset.char = ch.char

    if (ch.pinyin) {
      span.dataset.pinyin = ch.pinyin
      const ruby = document.createElement('ruby')
      ruby.textContent = displayChar
      const rt = document.createElement('rt')
      rt.textContent = ch.pinyin
      ruby.appendChild(rt)
      span.appendChild(ruby)
    } else {
      span.textContent = displayChar
    }

    return span
  }

  function renderPlainLine(container, text) {
    const chars = Array.from(text)
    for (const ch of chars) {
      const span = document.createElement('span')
      span.className = 'char'
      span.dataset.char = ch
      span.textContent = ch
      span.addEventListener('click', (e) => {
        overlayEl.dispatchEvent(
          new CustomEvent('word-click', {
            bubbles: true,
            detail: { word: ch, anchorEl: e.currentTarget },
          })
        )
      })
      container.appendChild(span)
    }
  }

  function onWordClick(e) {
    const wordSpan = e.currentTarget
    const word = wordSpan.dataset.word

    highlightWord(word)

    overlayEl.dispatchEvent(
      new CustomEvent('word-click', {
        bubbles: true,
        detail: {
          word,
          anchorEl: wordSpan,
        },
      })
    )
  }

  function highlightWord(word) {
    highlightedWord = word
    overlayEl.querySelectorAll('.word').forEach((el) => {
      el.classList.toggle('highlighted', el.dataset.word === word)
    })
  }

  function clearHighlight() {
    highlightedWord = null
    overlayEl.querySelectorAll('.word.highlighted').forEach((el) => {
      el.classList.remove('highlighted')
    })
  }

  function sync() {
    if (cues.length === 0) return

    const timeMs = videoEl.currentTime * 1000
    const activeCues = findActiveCues(timeMs, cues)
    const activeEnglish = showEnglish ? findActiveCues(timeMs, englishCues) : []

    const key = activeCues.map((c) => c.time).join(',') + '|' + activeEnglish.map((c) => c.time).join(',')
    if (key === lastRenderedKey) return
    lastRenderedKey = key

    if (activeCues.length === 0 && activeEnglish.length === 0) {
      overlayEl.innerHTML = ''
    } else {
      renderCues(activeCues, activeEnglish)
    }
  }

  videoEl.addEventListener('timeupdate', sync)
  videoEl.addEventListener('seeked', sync)

  return { setTrack, setEnglishTrack, setShowEnglish, setConverter, clear, sync, highlightWord, clearHighlight }
}
