#!/usr/bin/env node
/**
 * Downloads JMdict_e.gz (English-only JMdict), decompresses it,
 * parses the XML, and writes a compact tab-separated dictionary file.
 *
 * Output: src/data/jmdict.txt
 * Format: kanji_form<TAB>kana_reading<TAB>def1/def2/...
 *
 * Usage: node scripts/fetch-jmdict.js
 */
import { createWriteStream, createReadStream } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'jmdict.txt')
const GZ_URL = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const GZ_TMP = path.join(__dirname, '..', 'jmdict_e.gz')
const XML_TMP = path.join(__dirname, '..', 'jmdict_e.xml')

async function download(url, dest) {
  console.log(`Downloading ${url} ...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const fileStream = createWriteStream(dest)
  const reader = res.body.getReader()
  const total = Number(res.headers.get('content-length')) || 0
  let downloaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(Buffer.from(value))
    downloaded += value.byteLength
    if (total) {
      process.stdout.write(`\r  ${((downloaded / total) * 100).toFixed(1)}%`)
    }
  }
  fileStream.end()
  await new Promise((resolve) => fileStream.on('finish', resolve))
  console.log('\n  Download complete.')
}

async function decompress(gzPath, outPath) {
  console.log('Decompressing...')
  const input = createReadStream(gzPath)
  const output = createWriteStream(outPath)
  const gunzip = createGunzip()
  await pipeline(input, gunzip, output)
  console.log('  Decompressed.')
}

function parseXml(xmlText) {
  console.log('Parsing XML entries...')
  const entries = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  const kebRe = /<keb>([^<]+)<\/keb>/g
  const rebRe = /<reb>([^<]+)<\/reb>/g
  const glossRe = /<gloss[^>]*>([^<]+)<\/gloss>/g

  let match
  while ((match = entryRe.exec(xmlText)) !== null) {
    const block = match[1]

    const kanjiForms = []
    let km
    kebRe.lastIndex = 0
    while ((km = kebRe.exec(block)) !== null) kanjiForms.push(km[1])

    const readings = []
    rebRe.lastIndex = 0
    while ((km = rebRe.exec(block)) !== null) readings.push(km[1])

    const glosses = []
    glossRe.lastIndex = 0
    while ((km = glossRe.exec(block)) !== null) glosses.push(km[1])

    if (readings.length === 0 || glosses.length === 0) continue

    const reading = readings[0]
    const defsStr = glosses.join('/')

    if (kanjiForms.length > 0) {
      for (const kanji of kanjiForms) {
        entries.push(`${kanji}\t${reading}\t${defsStr}`)
      }
    } else {
      // Kana-only entry
      entries.push(`${reading}\t${reading}\t${defsStr}`)
    }
  }

  console.log(`  Parsed ${entries.length} entries.`)
  return entries
}

async function main() {
  try {
    await download(GZ_URL, GZ_TMP)
    await decompress(GZ_TMP, XML_TMP)

    const { readFile } = await import('fs/promises')
    const xmlText = await readFile(XML_TMP, 'utf-8')
    const entries = parseXml(xmlText)

    const header = '# JMdict Japanese-English dictionary\n# Format: word\\treading\\tdefinitions\n# Auto-generated — do not edit\n'
    await writeFile(OUT_FILE, header + entries.join('\n') + '\n', 'utf-8')
    console.log(`Wrote ${OUT_FILE} (${entries.length} entries)`)

    // Cleanup temp files
    await unlink(GZ_TMP).catch(() => {})
    await unlink(XML_TMP).catch(() => {})
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
