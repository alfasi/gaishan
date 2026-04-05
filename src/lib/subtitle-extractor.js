import { SubtitleParser } from 'matroska-subtitles'
import { EbmlTagId } from 'ebml-stream'

const CHUNK_SIZE = 1024 * 1024 // 1MB chunks
const ASS_TAG_RE = /\{[^}]*\}/g
const ASS_NEWLINE_RE = /\\[Nn]/g

function stripAssTags(text) {
  return text.replace(ASS_TAG_RE, '').replace(ASS_NEWLINE_RE, '\n').trim()
}

function getData(chunk, id) {
  const el = chunk.Children.find((c) => c.id === id)
  return el ? el.data : undefined
}

/**
 * Extract all subtitle tracks, audio track metadata, and subtitle cues from an MKV file or URL.
 *
 * @param {File|string} source - An MKV File object or an HTTP(S) URL string
 * @param {object} [options]
 * @param {function} [options.onProgress] - Called with (bytesRead, totalBytes)
 * @returns {Promise<{ tracks: Array, subtitles: Map<number, Array>, audioTracks: Array }>}
 */
export async function extractSubtitles(source, options = {}) {
  const { onProgress } = options

  return new Promise((resolve, reject) => {
    const parser = new SubtitleParser()

    let tracks = []
    const subtitles = new Map()
    const audioTracks = []

    // Hook into the EBML decoder to also capture audio track metadata
    parser.decoder.on('data', (chunk) => {
      if (chunk.id === EbmlTagId.Tracks) {
        for (const entry of chunk.Children.filter((c) => c.id === EbmlTagId.TrackEntry)) {
          const trackType = getData(entry, EbmlTagId.TrackType)
          if (trackType === 0x02) {
            audioTracks.push({
              number: getData(entry, EbmlTagId.TrackNumber),
              language: getData(entry, EbmlTagId.Language),
              name: getData(entry, EbmlTagId.Name),
              codec: getData(entry, EbmlTagId.CodecID),
            })
          }
        }
      }
    })

    parser.on('tracks', (trackList) => {
      tracks = trackList
      for (const track of trackList) {
        subtitles.set(track.number, [])
      }
    })

    parser.on('subtitle', (subtitle, trackNumber) => {
      const track = tracks.find((t) => t.number === trackNumber)
      if (track && (track.type === 'ass' || track.type === 'ssa')) {
        subtitle.text = stripAssTags(subtitle.text)
      }
      const list = subtitles.get(trackNumber)
      if (list) list.push(subtitle)
    })

    parser.on('error', reject)

    parser.on('finish', () => {
      resolve({ tracks, subtitles, audioTracks })
    })

    const feed = typeof source === 'string' ? feedUrl : feedFile
    feed(source, parser, onProgress).catch(reject)
  })
}

async function feedUrl(url, parser, onProgress) {
  const api = window.electronAPI
  if (!api) throw new Error('URL streaming requires Electron')

  return new Promise((resolve, reject) => {
    const removeChunkListener = api.onUrlStreamChunk((chunk, bytesRead, total) => {
      if (parser.writableEnded) return
      parser.write(chunk)
      if (onProgress && total) onProgress(bytesRead, total)
    })

    api.onUrlStreamDone(() => {
      removeChunkListener()
      if (!parser.writableEnded) parser.end()
      resolve()
    })

    api.fetchUrlStream(url).catch((err) => {
      removeChunkListener()
      reject(err)
    })
  })
}

async function feedFile(file, parser, onProgress) {
  const size = file.size
  let offset = 0

  while (offset < size) {
    const end = Math.min(offset + CHUNK_SIZE, size)
    const slice = file.slice(offset, end)
    const buffer = await slice.arrayBuffer()
    const chunk = new Uint8Array(buffer)

    // SubtitleParser may have called .end() early if no subtitle tracks found
    if (parser.writableEnded) break

    const canContinue = parser.write(chunk)
    if (!canContinue) {
      await new Promise((r) => parser.once('drain', r))
    }

    offset = end
    if (onProgress) onProgress(offset, size)
  }

  if (!parser.writableEnded) {
    parser.end()
  }
}
