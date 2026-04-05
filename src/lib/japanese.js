/**
 * Japanese track detection, word segmentation, and furigana annotation.
 * Uses Intl.Segmenter for word segmentation and JMdict readings for furigana.
 */
import { getReading } from './dictionary-ja.js'

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/
const HIRAGANA_RE = /[\u3040-\u309f]/
const KATAKANA_RE = /[\u30a0-\u30ff]/
const KANA_RE = /[\u3040-\u309f\u30a0-\u30ff]/

const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })

/**
 * Check if a subtitle track is Japanese based on language tag or content.
 */
export function isJapaneseTrack(track, cues) {
  if (track.language === 'jpn' || track.language === 'ja' || track.language === 'jap') {
    return true
  }
  // Heuristic: check if cues contain hiragana or katakana
  for (let i = 0; i < Math.min(5, cues.length); i++) {
    const text = cues[i].text
    if (HIRAGANA_RE.test(text) || KATAKANA_RE.test(text)) {
      // Make sure it's not Chinese by checking for kana presence
      // Chinese doesn't use hiragana/katakana
      return true
    }
  }
  return false
}

/**
 * Segment Japanese text into word tokens with furigana readings.
 * Returns tokens similar to the Chinese pinyin pipeline.
 *
 * @param {string} text
 * @returns {Array<{ word: string, isWord: boolean, reading: string|null, chars: Array<{ char: string, pinyin: string|null }> }>}
 */
export function toJapaneseWordTokens(text) {
  const segments = [...segmenter.segment(text)]
  const result = []

  for (const seg of segments) {
    const word = seg.segment
    const hasKanji = CJK_RE.test(word)

    if (seg.isWordLike && (hasKanji || KANA_RE.test(word))) {
      const reading = hasKanji ? getReading(word) : null
      const chars = Array.from(word)

      result.push({
        word,
        isWord: true,
        reading,
        chars: chars.map((char) => ({
          char,
          // For Japanese, we show word-level furigana rather than per-character
          // Set pinyin field to null — furigana is rendered at word level
          pinyin: null,
        })),
      })
    } else {
      // Punctuation, spaces, etc.
      result.push({
        word,
        isWord: false,
        reading: null,
        chars: Array.from(word).map((ch) => ({ char: ch, pinyin: null })),
      })
    }
  }

  return result
}

/**
 * Pre-process all cues for a Japanese track, adding `wordTokens` array to each cue.
 * Mutates the cue objects in place.
 *
 * @param {Array} cues - Array of subtitle cue objects with .text
 */
export function annotateJapaneseCues(cues) {
  for (const cue of cues) {
    cue.wordTokens = toJapaneseWordTokens(cue.text)
    cue.isJapanese = true
  }
}
