/**
 * Word frequency rating module.
 * Loads frequency data from bundled text files (lazy, on first access).
 *
 * Data files format: one entry per line — word<TAB>tier (1-5)
 * Download proper data: node scripts/fetch-frequency.js
 */
import zhFreqText from '../data/freq-zh.txt?raw'
import jaFreqText from '../data/freq-ja.txt?raw'

let zhFreq = null
let jaFreq = null

function getZhFreq() {
  if (zhFreq === null) {
    try { zhFreq = parseFreqFile(zhFreqText) } catch { zhFreq = null }
  }
  return zhFreq
}

function getJaFreq() {
  if (jaFreq === null) {
    try { jaFreq = parseFreqFile(jaFreqText) } catch { jaFreq = null }
  }
  return jaFreq
}

function parseFreqFile(text) {
  const map = new Map()
  if (!text) return map
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const [word, tier] = line.split('\t')
    if (word && tier) {
      const n = parseInt(tier, 10)
      if (n >= 1 && n <= 5) map.set(word, n)
    }
  }
  return map.size > 0 ? map : null
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/
const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc]+$/

/**
 * Get a 1–5 frequency rating for a word.
 * 5 = very common, 1 = rare.
 *
 * @param {string} word
 * @param {'zh'|'ja'} lang
 * @returns {number} 1–5
 */
export function getFrequencyStars(word, lang = 'zh') {
  const freqMap = lang === 'ja' ? getJaFreq() : getZhFreq()
  if (freqMap) {
    const tier = freqMap.get(word)
    if (tier != null) return tier
  }
  return estimateFrequency(word, lang)
}

function estimateFrequency(word, lang) {
  const chars = Array.from(word)
  const len = chars.length

  if (lang === 'ja') {
    if (KANA_RE.test(word)) return len <= 2 ? 5 : 4
    const kanjiCount = chars.filter((c) => CJK_RE.test(c)).length
    if (kanjiCount === 0) return 4
    if (len === 1) return 4
    if (len <= 2) return 3
    if (len <= 3) return 2
    return 1
  }

  // Chinese
  if (len === 1 && CJK_RE.test(word)) return 5
  if (len === 2) return 4
  if (len === 3) return 3
  if (len === 4) return 2
  return 1
}
