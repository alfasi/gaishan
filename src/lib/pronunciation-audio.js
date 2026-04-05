const MANDARIN_AUDIO_BASE =
  'https://cdn.jsdelivr.net/gh/davinfifield/mp3-chinese-pinyin-sound@master/mp3'
const JAPANESE_AUDIO_BASE = 'https://www.japanese50sounds.com/audio/kana'
const MANDARIN_FALLBACK_AUDIO_BASE =
  'https://raw.githubusercontent.com/davinfifield/mp3-chinese-pinyin-sound/master/mp3'

const TONE_MARK_TO_BASE = {
  ā: ['a', 1],
  á: ['a', 2],
  ǎ: ['a', 3],
  à: ['a', 4],
  ē: ['e', 1],
  é: ['e', 2],
  ě: ['e', 3],
  è: ['e', 4],
  ī: ['i', 1],
  í: ['i', 2],
  ǐ: ['i', 3],
  ì: ['i', 4],
  ō: ['o', 1],
  ó: ['o', 2],
  ǒ: ['o', 3],
  ò: ['o', 4],
  ū: ['u', 1],
  ú: ['u', 2],
  ǔ: ['u', 3],
  ù: ['u', 4],
  ǖ: ['ü', 1],
  ǘ: ['ü', 2],
  ǚ: ['ü', 3],
  ǜ: ['ü', 4],
}

const SMALL_KANA = new Set(['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'])
const JAPANESE_CATEGORY_BY_MORA = new Map([
  ...['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ', 'へ', 'ほ', 'ま', 'み', 'む', 'め', 'も', 'や', 'ゆ', 'よ', 'ら', 'り', 'る', 'れ', 'ろ', 'わ', 'を', 'ん'].map((mora) => [mora, 'seion']),
  ...['が', 'ぎ', 'ぐ', 'げ', 'ご', 'ざ', 'じ', 'ず', 'ぜ', 'ぞ', 'だ', 'ぢ', 'づ', 'で', 'ど', 'ば', 'び', 'ぶ', 'べ', 'ぼ'].map((mora) => [mora, 'dakuon']),
  ...['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'].map((mora) => [mora, 'handakuon']),
  ...['きゃ', 'きゅ', 'きょ', 'しゃ', 'しゅ', 'しょ', 'ちゃ', 'ちゅ', 'ちょ', 'にゃ', 'にゅ', 'にょ', 'ひゃ', 'ひゅ', 'ひょ', 'みゃ', 'みゅ', 'みょ', 'りゃ', 'りゅ', 'りょ', 'ぎゃ', 'ぎゅ', 'ぎょ', 'じゃ', 'じゅ', 'じょ', 'ぢゃ', 'ぢゅ', 'ぢょ', 'びゃ', 'びゅ', 'びょ', 'ぴゃ', 'ぴゅ', 'ぴょ'].map((mora) => [mora, 'yoon']),
])

let activeSequence = null
const audioSrcCache = new Map()

export function stopPronunciationPlayback() {
  if (!activeSequence) return
  activeSequence.cancelled = true
  for (const timer of activeSequence.timers) {
    clearTimeout(timer)
  }
  for (const audio of activeSequence.audios) {
    audio.pause()
    audio.currentTime = 0
    audio.src = ''
  }
  activeSequence = null
}

export function hasPronunciationAudio(entry, word, lang) {
  return getPronunciationSources(entry, word, lang).length > 0
}

export async function playPronunciation(entry, word, lang) {
  const sources = getPronunciationSources(entry, word, lang)
  if (sources.length === 0) return false

  stopPronunciationPlayback()
  const sequence = { cancelled: false, audios: [], timers: [], playedCount: 0 }
  activeSequence = sequence

  try {
    for (const source of sources) {
      if (sequence.cancelled) return false
      if (source.pauseMs) {
        await wait(source.pauseMs, sequence)
        continue
      }

      const playableSrc = await resolvePlayableSrc(source)
      if (!playableSrc) continue

      try {
        const audio = new Audio(playableSrc)
        audio.preload = 'auto'
        sequence.audios.push(audio)
        await playAudio(audio, sequence)
        sequence.playedCount++
      } catch (err) {
        console.warn('Pronunciation segment failed', err)
      }
    }
    return !sequence.cancelled && sequence.playedCount > 0
  } finally {
    if (activeSequence === sequence) activeSequence = null
  }
}

function getPronunciationSources(entry, word, lang) {
  if (lang === 'ja') {
    const reading = normalizeJapaneseReading(entry?.reading || word)
    return reading ? getJapaneseSources(reading) : []
  }

  const reading = entry?.pinyin?.trim()
  return reading ? getMandarinSources(reading) : []
}

function getMandarinSources(reading) {
  const syllables = reading
    .split(/\s+/)
    .map(normalizeMandarinSyllable)
    .filter(Boolean)

  return syllables.map((syllable) => ({
    type: 'mandarin',
    key: syllable,
    urls: [
      `${MANDARIN_AUDIO_BASE}/${encodeURIComponent(syllable)}.mp3`,
      `${MANDARIN_FALLBACK_AUDIO_BASE}/${encodeURIComponent(syllable)}.mp3`,
    ],
  }))
}

function normalizeMandarinSyllable(rawSyllable) {
  if (!rawSyllable) return null

  let syllable = rawSyllable
    .normalize('NFC')
    .toLowerCase()
    .replace(/['.·]/g, '')
    .replace(/u:/g, 'ü')
    .replace(/v/g, 'ü')
    .replace(/[^a-zü1-5r]/g, '')

  if (!syllable) return null

  const numbered = syllable.match(/^([a-zü]+)([1-5])$/)
  if (numbered) {
    return toMandarinAssetName(numbered[1], Number(numbered[2]))
  }

  let tone = 5
  let base = ''

  for (const char of syllable) {
    const marked = TONE_MARK_TO_BASE[char]
    if (marked) {
      base += marked[0]
      tone = marked[1]
    } else if (/[a-zü]/.test(char)) {
      base += char
    }
  }

  if (!base) return null
  return toMandarinAssetName(base, tone)
}

function toMandarinAssetName(base, tone) {
  return `${base.replaceAll('ü', 'uu')}${tone}`
}

function normalizeJapaneseReading(reading) {
  if (!reading) return ''
  return katakanaToHiragana(
    reading
      .trim()
      .replace(/[・]/g, '')
      .replace(/\s+/g, '')
  )
}

function getJapaneseSources(reading) {
  const normalized = expandProlongedMarks(reading)
  const morae = []

  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i]

    if (current === 'っ') {
      morae.push({ pauseMs: 90 })
      continue
    }

    const next = normalized[i + 1]
    if (next && SMALL_KANA.has(next)) {
      const combo = current + next
      if (JAPANESE_CATEGORY_BY_MORA.has(combo)) {
        morae.push({ mora: combo })
        i++
        continue
      }
    }

    if (JAPANESE_CATEGORY_BY_MORA.has(current)) {
      morae.push({ mora: current })
    }
  }

  return morae
    .map((item) => {
      if (item.pauseMs) return item
      const category = JAPANESE_CATEGORY_BY_MORA.get(item.mora)
      if (!category) return null
      return {
        url: `${JAPANESE_AUDIO_BASE}/${category}/${encodeURIComponent(item.mora)}.mp3`,
      }
    })
    .filter(Boolean)
}

function expandProlongedMarks(reading) {
  let result = ''
  for (const char of reading) {
    if (char !== 'ー') {
      result += char
      continue
    }

    const last = result[result.length - 1]
    const vowelKana = last ? getVowelKana(last) : null
    if (vowelKana) result += vowelKana
  }
  return result
}

function getVowelKana(char) {
  const hira = katakanaToHiragana(char)

  if (/[ぁかがさざただなはばぱまやゃらわ]/.test(hira)) return 'あ'
  if (/[ぃきぎしじちぢにひびぴみり]/.test(hira)) return 'い'
  if (/[ぅうくぐすずつづぬふぶぷむゆゅる]/.test(hira)) return 'う'
  if (/[ぇえけげせぜてでねへべぺめれ]/.test(hira)) return 'え'
  if (/[ぉおこごそぞとどのほぼぽもよょろを]/.test(hira)) return 'お'

  return null
}

function katakanaToHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  )
}

function playAudio(audio, sequence) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.onended = null
      audio.onerror = null
      audio.onabort = null
    }

    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error(`Failed to load audio: ${audio.src}`))
    }
    audio.onabort = () => {
      cleanup()
      resolve()
    }

    audio.play().catch((err) => {
      cleanup()
      reject(err)
    })
  }).finally(() => {
    if (sequence.cancelled) {
      audio.pause()
      audio.currentTime = 0
    }
  })
}

async function resolvePlayableSrc(source) {
  if (!source.urls || source.urls.length === 0) return source.url || null

  const cacheKey = source.type === 'mandarin' ? `mandarin:${source.key}` : source.urls[0]
  if (audioSrcCache.has(cacheKey)) return audioSrcCache.get(cacheKey)

  for (const url of source.urls) {
    try {
      const blob = await fetchAudioBlob(url)
      if (!blob) continue
      const objectUrl = URL.createObjectURL(blob)
      audioSrcCache.set(cacheKey, objectUrl)
      return objectUrl
    } catch {
      // Try the next source.
    }
  }

  return null
}

async function fetchAudioBlob(url) {
  if (window.electronAPI?.fetchUrlBytes) {
    const bytes = await window.electronAPI.fetchUrlBytes(url)
    if (!bytes || bytes.length === 0) return null
    return new Blob([bytes], { type: 'audio/mpeg' })
  }

  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.blob()
}

function wait(ms, sequence) {
  return new Promise((resolve) => {
    if (sequence.cancelled) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      sequence.timers = sequence.timers.filter((item) => item !== timer)
      resolve()
    }, ms)
    sequence.timers.push(timer)
  })
}
