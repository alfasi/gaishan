#!/usr/bin/env node
/**
 * Post-build script for the Gaishan browser extension.
 *
 * 1. Generates PNG icons (16, 48, 128 px) from scratch using only Node built-ins.
 * 2. Creates dist/extension/chrome/ and dist/extension/firefox/ by copying the
 *    shared build output and adding the appropriate manifest.json.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const EXT_DIR = join(ROOT, 'dist', 'extension')
const MANIFESTS = join(ROOT, 'manifests')

// ── PNG generator (pure Node, no external deps) ───────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const crcData = Buffer.concat([typeBuf, data])
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcData))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

/**
 * Create a square PNG with a dark background and a golden border.
 * @param {number} size  Width/height in pixels.
 * @returns {Buffer}
 */
function makePNG(size) {
  const BG   = [11, 12, 18]       // #0b0c12  dark navy
  const GOLD = [212, 162, 76]     // #d4a24c  accent gold
  const border = Math.max(2, Math.round(size / 8))

  const rowBytes = 1 + size * 3
  const raw = Buffer.alloc(size * rowBytes)

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const isBorder = x < border || x >= size - border ||
                       y < border || y >= size - border
      const [r, g, b] = isBorder ? GOLD : BG
      const off = y * rowBytes + 1 + x * 3
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Copy directory recursively ────────────────────────────────────────────────

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath  = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      writeFileSync(destPath, readFileSync(srcPath))
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // 0. Remove stray artefacts left by old builds (e.g. a src/ subdir)
  try { rmSync(join(EXT_DIR, 'src'), { recursive: true, force: true }) } catch { /* ok */ }

  // 0b. Copy injected.js verbatim — it's a plain IIFE with no imports.
  const injectedSrc  = join(ROOT, 'src', 'extension', 'injected.js')
  const injectedDest = join(EXT_DIR, 'injected.js')
  writeFileSync(injectedDest, readFileSync(injectedSrc))
  console.log('✓ injected.js copied')

  // 1. Generate icons into the shared build directory
  const iconsDir = join(EXT_DIR, 'icons')
  mkdirSync(iconsDir, { recursive: true })
  for (const size of [16, 48, 128]) {
    writeFileSync(join(iconsDir, `${size}.png`), makePNG(size))
  }
  console.log('✓ Icons generated')

  // 2. Create per-browser directories
  for (const browser of ['chrome', 'firefox']) {
    const outDir = join(ROOT, 'dist', `extension-${browser}`)
    copyDir(EXT_DIR, outDir)

    const manifest = readFileSync(join(MANIFESTS, `${browser}.json`), 'utf8')
    writeFileSync(join(outDir, 'manifest.json'), manifest)
    console.log(`✓ dist/extension-${browser}/ ready`)
  }
}

main()
