/**
 * CC-CEDICT Chinese-English dictionary with lazy loading and lookup.
 * Data is parsed on first access from the bundled cedict.txt.
 */
import cedictText from '../data/cedict.txt?raw'

// Tone mark tables for numbered pinyin → tone mark conversion
const TONE_MARKS = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
}

/**
 * Convert a single numbered-pinyin syllable to tone-marked pinyin.
 * e.g. "ni3" → "nǐ", "lv4" → "lǜ", "ma5" → "ma"
 */
function syllableToMarked(s) {
  const match = s.match(/^([a-züÜ]+)(\d)$/i)
  if (!match) return s

  let base = match[1].toLowerCase().replace('u:', 'v')
  const tone = parseInt(match[2]) - 1
  if (tone < 0 || tone > 4) return s

  // Find which vowel gets the tone mark
  // Rule: a/e always; ou → o; else last vowel
  const vowels = 'aeiouv'
  let markIdx = -1

  const ai = base.indexOf('a')
  const ei = base.indexOf('e')
  if (ai !== -1) markIdx = ai
  else if (ei !== -1) markIdx = ei
  else if (base.includes('ou')) markIdx = base.indexOf('o')
  else {
    for (let i = base.length - 1; i >= 0; i--) {
      if (vowels.includes(base[i])) {
        markIdx = i
        break
      }
    }
  }

  if (markIdx === -1) return base

  const vowel = base[markIdx]
  const marked = TONE_MARKS[vowel]?.[tone] || vowel
  return base.slice(0, markIdx) + marked + base.slice(markIdx + 1)
}

/**
 * Convert a full numbered pinyin string to tone marks.
 * e.g. "ni3 hao3" → "nǐ hǎo"
 */
function pinyinToMarked(raw) {
  return raw
    .split(' ')
    .map((s) => syllableToMarked(s))
    .join(' ')
}

// Lazy-loaded dictionary map: word → entries[]
let dictMap = null

function ensureLoaded() {
  if (dictMap) return
  dictMap = new Map()

  const lines = cedictText.split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('%')) continue
    const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/)
    if (!match) continue

    const [, traditional, simplified, pinyinRaw, defsRaw] = match
    const pinyin = pinyinToMarked(pinyinRaw)
    const definitions = defsRaw.split('/')
    const entry = { traditional, simplified, pinyin, definitions }

    if (!dictMap.has(simplified)) dictMap.set(simplified, [])
    dictMap.get(simplified).push(entry)

    if (traditional !== simplified) {
      if (!dictMap.has(traditional)) dictMap.set(traditional, [])
      dictMap.get(traditional).push(entry)
    }
  }
}

/**
 * Look up a word in the dictionary.
 * @param {string} word
 * @returns {Array|null} Array of dictionary entries, or null
 */
export function lookup(word) {
  ensureLoaded()
  return dictMap.get(word) || null
}

/**
 * Find the best (longest) dictionary match starting from a position in text.
 * Tries 6, 5, 4, 3, 2, 1 character sequences.
 * @param {string} text
 * @param {number} startIdx - character index (not byte index)
 * @returns {{ word: string, entries: Array, length: number } | null}
 */
export function lookupBest(text, startIdx = 0) {
  ensureLoaded()
  const chars = Array.from(text)
  const maxLen = Math.min(6, chars.length - startIdx)
  for (let len = maxLen; len >= 1; len--) {
    const candidate = chars.slice(startIdx, startIdx + len).join('')
    const entries = dictMap.get(candidate)
    if (entries) return { word: candidate, entries, length: len }
  }
  return null
}
