import { pinyin } from 'pinyin-pro'

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/

// Word segmenter for Chinese text — uses ICU data built into Chrome/Electron
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })

/**
 * Check if a track is Chinese based on language tag or content.
 */
export function isChineseTrack(track, cues) {
  if (track.language === 'chi' || track.language === 'zho' || track.language === 'cmn') {
    return true
  }
  // Fallback: check if the first few cues contain CJK characters
  for (let i = 0; i < Math.min(5, cues.length); i++) {
    if (CJK_RE.test(cues[i].text)) return true
  }
  return false
}

/**
 * Segment Chinese text into words and annotate each character with pinyin.
 * Returns word-level tokens, where each word contains its constituent characters.
 *
 * @param {string} text
 * @returns {Array<{ word: string, isWord: boolean, chars: Array<{ char: string, pinyin: string|null }> }>}
 */
export function toWordTokens(text) {
  const segments = [...segmenter.segment(text)]
  const result = []

  for (const seg of segments) {
    const word = seg.segment
    const hasCJK = CJK_RE.test(word)

    if (hasCJK) {
      const chars = Array.from(word)
      const pinyinArray = pinyin(word, { type: 'array' })
      result.push({
        word,
        isWord: seg.isWordLike,
        chars: chars.map((char, i) => ({
          char,
          pinyin: CJK_RE.test(char) ? pinyinArray[i] || null : null,
        })),
      })
    } else {
      // Non-CJK: punctuation, spaces, latin text — keep as a single token
      result.push({
        word,
        isWord: false,
        chars: Array.from(word).map((ch) => ({ char: ch, pinyin: null })),
      })
    }
  }

  return result
}

/**
 * Pre-process all cues for a Chinese track, adding a `wordTokens` array to each cue.
 * Each token is a word-level group with per-character pinyin.
 * Mutates the cue objects in place.
 *
 * @param {Array} cues - Array of subtitle cue objects with .text
 */
export function annotateCues(cues) {
  for (const cue of cues) {
    cue.wordTokens = toWordTokens(cue.text)
  }
}
