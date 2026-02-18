# Meet Camera Overlay - Chrome Extension

## Architecture

Manifest V3 Chrome extension that adds image overlays to your Google Meet camera feed.

- `content.js` — Content script injected at `document_start` on meet.google.com, injects `inject.js`
- `inject.js` — Main extension logic running in **page context** (NOT a module, `sourceType: script`)
- `popup.js` / `popup.html` — Extension popup UI
- `background.js` — Service worker (ES module)
- `lib/` — Shared modules: wall segmentation, detection, rendering, utilities
- `prototype/multi-region-art/` — Wall art prototype app (ES module, served via Vite)
  - `multi-region.js` — Main app (~4000 lines, legacy, max-lines disabled)
  - `effects/` — Transition effects extending `BaseEffect` (lifecycle: trigger -> active -> update -> render -> deactivate)

## Commands

- `npm run lint` — ESLint with security plugin
- `npm run lint:fix` — Auto-fix lint issues
- `npm run typecheck` — TypeScript type checking (via jsconfig.json)
- `npm run test:unit` — Vitest unit tests (tests/unit/)
- `npm run test:integration` — Playwright integration tests (tests/integration/)
- `npm run knip` — Dead code detection
- `npm run dev:wall-art` — Vite dev server for wall art prototype

## Conventions

- ES modules throughout, **except** `inject.js` which uses `sourceType: script`
- Max 300 lines per file (skip blank lines and comments)
- Effects files (`prototype/multi-region-art/effects/`): max 350 lines
- Legacy files exempt from max-lines: `multi-region.js`, `popup.js`, `inject.js`
- `prefer-const`, `no-var`, `eqeqeq` enforced by ESLint
- All effects must extend `BaseEffect` from `effects/base-effect.js`

## CI

GitHub Actions runs on push/PR to main: unit tests, integration tests, lint, typecheck, knip, manifest validation.

## MediaPipe Notes

- Uses `@mediapipe/tasks-vision` for face/pose landmarks and segmentation
- Segmenter models: `.tflite` extension; FaceLandmarker/PoseLandmarker: `.task` extension
- `result.categoryMask.getAsUint8Array()` returns a WASM memory view — must copy with `new Uint8Array(view)` before calling `close()`
- `detectForVideo()` requires monotonically increasing timestamps
- Landmark coords are normalized 0-1, multiply by canvas width/height for pixels
