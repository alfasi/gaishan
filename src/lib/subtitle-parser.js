/**
 * Parse SRT and VTT subtitle files into cue objects matching the
 * player's internal format: { time (ms), duration (ms), text }.
 */

export function parseSubtitleFile(content, filename = '') {
  const ext = filename.split('.').pop().toLowerCase()
  const trimmed = content.trimStart()
  if (trimmed.startsWith('WEBVTT') || ext === 'vtt') return parseVTT(content)
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt') || ext === 'ttml' || ext === 'dfxp' || ext === 'xml') return parseTTML(content)
  return parseSRT(content)
}

// ── TTML / DFXP (Netflix, Disney+, etc.) ─────────────────────────────────────

export function parseTTML(content) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/xml')
  if (doc.querySelector('parsererror')) return []

  const tt = doc.documentElement

  // Frame-rate for frame-based timestamps
  const frameRate = Number(tt.getAttribute('ttp:frameRate') || tt.getAttribute('frameRate') || 30)
  const multAttr  = tt.getAttribute('ttp:frameRateMultiplier') || tt.getAttribute('frameRateMultiplier')
  let fps = frameRate
  if (multAttr) {
    const [n, d] = multAttr.split(/\s+/).map(Number)
    if (n && d) fps = frameRate * n / d
  }

  // Detect language from xml:lang
  const lang = (tt.getAttribute('xml:lang') || '').toLowerCase()

  const cues = []
  const ps = doc.querySelectorAll('p')
  for (const p of ps) {
    const begin = p.getAttribute('begin')
    const end   = p.getAttribute('end')
    if (!begin || !end) continue
    const start = parseTTMLTime(begin, fps)
    const endMs = parseTTMLTime(end, fps)
    if (endMs <= start) continue
    const text = extractTTMLText(p).trim()
    if (text) cues.push({ time: start, duration: endMs - start, text, ttmlLang: lang })
  }
  return cues
}

function extractTTMLText(el) {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent
    } else if (/^(span|s)$/i.test(node.nodeName)) {
      text += extractTTMLText(node)
    } else if (/^br$/i.test(node.nodeName)) {
      text += '\n'
    }
  }
  return text.replace(/\s+/g, ' ')
}

function parseTTMLTime(str, fps) {
  str = str.trim()
  // HH:MM:SS.mmm
  let m = str.match(/^(\d+):(\d+):(\d+)\.(\d+)$/)
  if (m) {
    const ms = Number(String(m[4]).padEnd(3, '0').slice(0, 3))
    return (Number(m[1])*3600 + Number(m[2])*60 + Number(m[3])) * 1000 + ms
  }
  // HH:MM:SS:FF  (frames)
  m = str.match(/^(\d+):(\d+):(\d+):(\d+)$/)
  if (m) {
    const [,h,min,s,f] = m.map(Number)
    return (h*3600 + min*60 + s) * 1000 + Math.round(f * 1000 / fps)
  }
  // HH:MM:SS
  m = str.match(/^(\d+):(\d+):(\d+)$/)
  if (m) return (Number(m[1])*3600 + Number(m[2])*60 + Number(m[3])) * 1000
  // Ns  (seconds with optional decimal)
  m = str.match(/^([\d.]+)s$/i)
  if (m) return Math.round(parseFloat(m[1]) * 1000)
  return 0
}

/** Detect language from a parsed cue array (uses ttmlLang tag or CJK heuristics). */
export function detectCueLang(cues) {
  if (!cues.length) return null
  const lang = cues[0].ttmlLang || ''
  if (lang.startsWith('zh') || lang === 'cmn') return 'zh'
  if (lang.startsWith('ja')) return 'ja'
  // Heuristic: check first few cues for kana / CJK
  const sample = cues.slice(0, 8).map(c => c.text).join('')
  if (/[\u3040-\u30ff]/.test(sample)) return 'ja'
  if (/[\u4e00-\u9fff]/.test(sample)) return 'zh'
  return null
}

// ── SRT ──────────────────────────────────────────────────────────────────────

function parseSRT(content) {
  const cues = []
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue
    const timeIdx = lines.findIndex((l) => l.includes('-->'))
    if (timeIdx === -1) continue
    const [startStr, endStr] = lines[timeIdx].split('-->').map((s) => s.trim())
    const start = parseSRTTime(startStr)
    const end = parseSRTTime(endStr)
    if (end <= start) continue
    const text = lines
      .slice(timeIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (text) cues.push({ time: start, duration: end - start, text })
  }
  return cues
}

function parseSRTTime(str) {
  const m = str.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!m) return 0
  const [, h, min, s, msRaw] = m
  const ms = Number(String(msRaw).padEnd(3, '0').slice(0, 3))
  return (Number(h) * 3600 + Number(min) * 60 + Number(s)) * 1000 + ms
}

// ── VTT ──────────────────────────────────────────────────────────────────────

function parseVTT(content) {
  const cues = []
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.includes('-->')) { i++; continue }
    const parts = line.split('-->')
    const start = parseVTTTime(parts[0].trim().split(' ')[0])
    const end = parseVTTTime(parts[1].trim().split(' ')[0])
    i++
    const textLines = []
    while (i < lines.length && lines[i].trim() !== '') {
      const stripped = lines[i].replace(/<[^>]+>/g, '').trim()
      if (stripped) textLines.push(stripped)
      i++
    }
    const text = textLines.join('\n').trim()
    if (text && end > start) cues.push({ time: start, duration: end - start, text })
  }
  return cues
}

function parseVTTTime(str) {
  const parts = str.split(':')
  let h = 0, m, s, ms
  if (parts.length === 3) {
    h = Number(parts[0])
    m = Number(parts[1])
    const [sec, msStr = '000'] = parts[2].split('.')
    s = Number(sec)
    ms = Number(String(msStr).padEnd(3, '0').slice(0, 3))
  } else {
    m = Number(parts[0])
    const [sec, msStr = '000'] = parts[1].split('.')
    s = Number(sec)
    ms = Number(String(msStr).padEnd(3, '0').slice(0, 3))
  }
  return (h * 3600 + m * 60 + s) * 1000 + ms
}
