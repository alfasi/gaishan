#!/usr/bin/env node
/**
 * Generates word frequency tier files for Chinese and Japanese
 * from the bundled dictionaries.
 *
 * Chinese: Uses cedict.txt — shorter words get higher tiers (heuristic).
 *          Replace with HSK word lists for better accuracy.
 *
 * Japanese: Uses jmdict.txt — shorter common words get higher tiers (heuristic).
 *           Replace with JLPT word lists for better accuracy.
 *
 * Output: src/data/freq-zh.txt, src/data/freq-ja.txt
 * Usage: node scripts/fetch-frequency.js
 */
import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'src', 'data')

function tierFromLength(len, isJapanese = false) {
  if (isJapanese) {
    if (len <= 1) return 4
    if (len <= 2) return 3
    if (len <= 3) return 2
    return 1
  }
  // Chinese
  if (len === 1) return 5
  if (len === 2) return 4
  if (len === 3) return 3
  if (len === 4) return 2
  return 1
}

async function generateChinese() {
  const cedictPath = path.join(DATA_DIR, 'cedict.txt')
  let text
  try {
    text = await readFile(cedictPath, 'utf-8')
  } catch {
    console.log('cedict.txt not found, skipping Chinese frequency generation.')
    return
  }

  const wordCounts = new Map() // word → number of entries (more entries ≈ more common)
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('%')) continue
    const match = line.match(/^\S+\s+(\S+)\s+/)
    if (!match) continue
    const simplified = match[1]
    wordCounts.set(simplified, (wordCounts.get(simplified) || 0) + 1)
  }

  // Assign tiers based on word length + number of dictionary entries
  const entries = []
  for (const [word, count] of wordCounts) {
    const len = Array.from(word).length
    let tier = tierFromLength(len)
    // Boost words with many definitions (likely more common)
    if (count >= 4) tier = Math.min(5, tier + 1)
    entries.push(`${word}\t${tier}`)
  }

  const header = '# Chinese word frequency (word\\ttier, 5=very common)\n# Heuristic — replace with HSK data for accuracy\n'
  const outPath = path.join(DATA_DIR, 'freq-zh.txt')
  await writeFile(outPath, header + entries.join('\n') + '\n', 'utf-8')
  console.log(`Wrote ${outPath} (${entries.length} words)`)
}

async function generateJapanese() {
  const jmdictPath = path.join(DATA_DIR, 'jmdict.txt')
  let text
  try {
    text = await readFile(jmdictPath, 'utf-8')
  } catch {
    console.log('jmdict.txt not found, skipping Japanese frequency generation.')
    console.log('Run: node scripts/fetch-jmdict.js first')
    return
  }

  const wordCounts = new Map()
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const [word] = line.split('\t')
    if (word) wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
  }

  if (wordCounts.size === 0) {
    console.log('jmdict.txt is empty. Run: node scripts/fetch-jmdict.js first')
    return
  }

  const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc]+$/
  const entries = []
  for (const [word, count] of wordCounts) {
    const len = Array.from(word).length
    let tier = tierFromLength(len, true)
    // Kana-only short words are usually very common (particles, basic words)
    if (KANA_RE.test(word) && len <= 2) tier = 5
    if (count >= 3) tier = Math.min(5, tier + 1)
    entries.push(`${word}\t${tier}`)
  }

  const header = '# Japanese word frequency (word\\ttier, 5=very common)\n# Heuristic — replace with JLPT data for accuracy\n'
  const outPath = path.join(DATA_DIR, 'freq-ja.txt')
  await writeFile(outPath, header + entries.join('\n') + '\n', 'utf-8')
  console.log(`Wrote ${outPath} (${entries.length} words)`)
}

async function main() {
  await generateChinese()
  await generateJapanese()
  console.log('Done. Rebuild the app to include frequency data.')
}

main()
