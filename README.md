# Gaishan

Gaishan is an Electron-based video player for language learning. It plays local or remote video, extracts embedded subtitles, and renders a study-oriented interface with transcript browsing, clickable dictionary lookups, pinyin or furigana annotations, track switching, and word-level pronunciation playback.

## Features

- Play local video files and folder-based collections
- Extract subtitle and audio tracks from MKV and other supported containers
- Detect Chinese and Japanese subtitle tracks automatically
- Render Chinese word segmentation with pinyin
- Render Japanese word segmentation with furigana
- Click subtitle or transcript words to open dictionary entries
- Show frequency hints for Chinese and Japanese dictionary matches
- Switch subtitle and audio tracks during playback
- Convert Chinese display text to simplified characters
- Play Mandarin word pronunciation using recorded pinyin syllables

## Stack

- Electron
- Vite
- `matroska-subtitles`
- `pinyin-pro`
- `opencc-js`

## Development

Install dependencies:

```bash
npm install
```

Run the renderer in development:

```bash
npm run dev
```

Run the Electron app against the dev server:

```bash
npm run electron:dev
```

Build the renderer bundle:

```bash
npm run build
```

Create packaged desktop artifacts with Electron Builder:

```bash
npm run electron:build
```

Create unpacked app directories only:

```bash
npm run electron:pack
```

## Release Notes

Current version: `0.1.0`

Planned release outputs:

- macOS: `dmg`
- Linux: `AppImage`
- Windows: `nsis`

Unsigned builds are possible locally. Platform signing and notarization require developer credentials that are not stored in this repository.

For unsigned macOS builds downloaded from GitHub, Gatekeeper may block direct launch. Ad-hoc signing keeps the bundle structurally valid, but proper Apple signing and notarization are still required for a frictionless download-and-open experience.

## Repository

Intended GitHub remote:

- `https://github.com/alfasi/gaishan`
