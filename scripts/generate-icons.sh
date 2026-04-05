#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SVG_PATH="$ROOT_DIR/assets/icon.svg"
BUILD_DIR="$ROOT_DIR/build"
ICON_DIR="$BUILD_DIR/icons"
MASTER_PNG="$BUILD_DIR/icon-1024.png"

rm -rf "$ICON_DIR"
mkdir -p "$BUILD_DIR"

magick -background none "$SVG_PATH" -resize 1024x1024 -depth 8 "$MASTER_PNG"
npx electron-icon-builder --input="$MASTER_PNG" --output="$BUILD_DIR" --flatten >/dev/null
