/**
 * JMdict Japanese-English dictionary with lazy loading and lookup.
 * Data is parsed on first access from the bundled jmdict.txt.
 *
 * File format: kanji_form<TAB>kana_reading<TAB>def1/def2/...
 * For kana-only entries: kana<TAB>kana<TAB>def1/def2/...
 *
 * Generate the data file: node scripts/fetch-jmdict.js
 */
import _jmdictRaw from '../data/jmdict.txt?raw'
let dictText = null
try { dictText = _jmdictRaw } catch { /* not available */ }

let dictMap = null
let readingMap = null

function ensureLoaded() {
  if (dictMap) return
  dictMap = new Map()
  readingMap = new Map()

  if (!dictText) return

  const lines = dictText.split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue

    const [word, reading, defsRaw] = parts
    const definitions = defsRaw.split('/')
    const entry = { word, reading, definitions }

    if (!dictMap.has(word)) dictMap.set(word, [])
    dictMap.get(word).push(entry)

    // Reading map: word → primary kana reading
    if (!readingMap.has(word)) readingMap.set(word, reading)

    // Also index by reading for kana-only lookups
    if (reading !== word) {
      if (!dictMap.has(reading)) dictMap.set(reading, [])
      dictMap.get(reading).push(entry)
    }
  }
}

/**
 * Look up a word in the Japanese dictionary.
 * @param {string} word
 * @returns {Array|null} Array of dictionary entries, or null
 */
export function lookup(word) {
  ensureLoaded()
  return dictMap?.get(word) || null
}

/**
 * Get the kana reading for a word (for furigana display).
 * @param {string} word
 * @returns {string|null}
 */
export function getReading(word) {
  ensureLoaded()
  return readingMap?.get(word) || null
}

/**
 * Find the best (longest) dictionary match starting from a position in text.
 * @param {string} text
 * @param {number} startIdx
 * @returns {{ word: string, entries: Array, length: number } | null}
 */
export function lookupBest(text, startIdx = 0) {
  ensureLoaded()
  if (!dictMap) return null
  const chars = Array.from(text)
  const maxLen = Math.min(8, chars.length - startIdx)
  for (let len = maxLen; len >= 1; len--) {
    const candidate = chars.slice(startIdx, startIdx + len).join('')
    const entries = dictMap.get(candidate)
    if (entries) return { word: candidate, entries, length: len }
  }
  return null
}
