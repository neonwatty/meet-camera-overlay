#!/usr/bin/env bash
# Package the Chrome extension files into a zip for Chrome Web Store submission.
# Usage: ./scripts/package-extension.sh
# Output: dist/meet-camera-overlay.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ZIP_NAME="meet-camera-overlay.zip"
STAGING_DIR=$(mktemp -d)

cleanup() { rm -rf "$STAGING_DIR"; }
trap cleanup EXIT

echo "Packaging Chrome extension..."

# --- Files referenced by manifest.json ---

# Core extension files
cp "$ROOT_DIR/manifest.json" "$STAGING_DIR/"
cp "$ROOT_DIR/background.js" "$STAGING_DIR/"
cp "$ROOT_DIR/content.js" "$STAGING_DIR/"
cp "$ROOT_DIR/inject.js" "$STAGING_DIR/"
cp "$ROOT_DIR/popup.html" "$STAGING_DIR/"
cp "$ROOT_DIR/popup.js" "$STAGING_DIR/"
cp "$ROOT_DIR/styles.css" "$STAGING_DIR/"
cp "$ROOT_DIR/rules.json" "$STAGING_DIR/"

# Icons
mkdir -p "$STAGING_DIR/icons"
cp "$ROOT_DIR"/icons/*.png "$STAGING_DIR/icons/"

# Lib files (web_accessible_resources + background.js import)
mkdir -p "$STAGING_DIR/lib"
cp "$ROOT_DIR/lib/gif-decoder.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/animated-image.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/slideshow-player.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/tab-capture.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/segmentation-mask.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-segmentation.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-region.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-paint-renderer.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-art-renderer.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-region-helpers.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-region-snapping.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-region-editor.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/performance-monitor.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/feature-tracking.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/jiggle-compensator.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/lighting-detector.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/wall-detector.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/edge-detector.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/snap-engine.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/bundled-effects.js" "$STAGING_DIR/lib/"
cp "$ROOT_DIR/lib/bundled-wall-art.js" "$STAGING_DIR/lib/"

# Assets (effects + wall-art)
mkdir -p "$STAGING_DIR/assets/effects"
cp "$ROOT_DIR"/assets/effects/*.gif "$STAGING_DIR/assets/effects/"
mkdir -p "$STAGING_DIR/assets/wall-art"
cp "$ROOT_DIR"/assets/wall-art/*.png "$STAGING_DIR/assets/wall-art/"

# --- Build zip ---
mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/$ZIP_NAME"
(cd "$STAGING_DIR" && zip -r "$DIST_DIR/$ZIP_NAME" . -x '.*')

echo ""
echo "Created: dist/$ZIP_NAME"
echo "Contents:"
unzip -l "$DIST_DIR/$ZIP_NAME" | tail -1
