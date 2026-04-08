/**
 * Gaishan — Netflix integration module.
 *
 * Responsibilities:
 *  1. Inject injected.js into the page's main world so subtitle network
 *     requests can be intercepted.
 *  2. Receive intercepted TTML/VTT data and auto-annotate with pinyin /
 *     furigana (no manual subtitle loading required).
 *  3. Hide Netflix's own subtitle renderer once our overlay is active.
 *  4. Build the transcript panel progressively from the subtitle data.
 */

import { parseSubtitleFile, detectCueLang } from '../lib/subtitle-parser.js'
import { isChineseTrack, annotateCues } from '../lib/pinyin.js'
import { isJapaneseTrack, annotateJapaneseCues } from '../lib/japanese.js'

// CSS injected into the page to suppress Netflix's subtitle renderer
// once our annotated overlay is active.
const NETFLIX_HIDE_SUBS_CSS = `
  .player-timedtext,
  .player-timedtext-text-container,
  [data-uia="player-timedtext"],
  .watch-video--player-view .nf-subtitle-container,
  .nf-subtitle-text {
    opacity: 0 !important;
    pointer-events: none !important;
  }
`

// ── Selector probe helpers ────────────────────────────────────────────────────

/** Best-effort selector for the Netflix video element. */
export function findNetflixVideo() {
  return (
    document.querySelector('video.VideoContainer-video') ||
    document.querySelector('.watch-video video') ||
    document.querySelector('video')
  )
}

// ── Main-world script injection ───────────────────────────────────────────────

let injected = false

export function injectInterceptor() {
  if (injected) return
  injected = true
  try {
    const script = document.createElement('script')
    // eslint-disable-next-line no-undef
    script.src = chrome.runtime.getURL('injected.js')
    script.onload = () => script.remove()
    ;(document.head || document.documentElement).prepend(script)
  } catch (e) {
    console.warn('[Gaishan] Could not inject interceptor:', e)
  }
}

// ── Netflix subtitle hide/show ────────────────────────────────────────────────

let hideStyleEl = null

export function hideNetflixSubtitles() {
  if (hideStyleEl) return
  hideStyleEl = document.createElement('style')
  hideStyleEl.id = 'gaishan-hide-nf-subs'
  hideStyleEl.textContent = NETFLIX_HIDE_SUBS_CSS
  document.head.appendChild(hideStyleEl)
}

export function showNetflixSubtitles() {
  hideStyleEl?.remove()
  hideStyleEl = null
}

// ── Subtitle auto-loader ──────────────────────────────────────────────────────

/**
 * Start listening for intercepted subtitle files and call `onLoad` whenever
 * a Chinese or Japanese subtitle is received.
 *
 * Returns an unsubscribe function.
 *
 * @param {function({cues, lang, isChinese, isJapanese})} onLoad
 */
export function listenForSubtitles(onLoad) {
  // Track URLs we've already processed to avoid double-firing
  const seen = new Set()

  function handler(e) {
    const { url = '', content = '' } = e.detail || {}
    if (!content || seen.has(url)) return

    // Quick pre-filter: skip obviously non-CJK files
    const hasCJK  = /[\u4e00-\u9fff\u3040-\u30ff]/.test(content)
    const isXML   = /<tt[\s>]/.test(content) || /<TTML[\s>]/i.test(content)
    const isVTT   = content.trimStart().startsWith('WEBVTT')
    if (!hasCJK && !isXML && !isVTT) return

    seen.add(url)

    // Parse (TTML / VTT)
    const cues = parseSubtitleFile(content, url.split('/').pop().split('?')[0] || 'sub.ttml')
    if (!cues.length) return

    // Detect language
    const lang = detectCueLang(cues)
    if (!lang) return // not CJK — skip

    const trackMeta = { language: lang === 'ja' ? 'jpn' : 'zho', name: url }
    const isJa = lang === 'ja' || isJapaneseTrack(trackMeta, cues)
    const isZh = !isJa && (lang === 'zh' || isChineseTrack(trackMeta, cues))

    if (!isJa && !isZh) return

    // Annotate (mutates cues in place — do this only once)
    if (isJa) annotateJapaneseCues(cues)
    else      annotateCues(cues)

    onLoad({ cues, lang: isJa ? 'ja' : 'zh', isChinese: isZh, isJapanese: isJa })
  }

  window.addEventListener('gaishan-subtitle', handler)
  return () => window.removeEventListener('gaishan-subtitle', handler)
}
