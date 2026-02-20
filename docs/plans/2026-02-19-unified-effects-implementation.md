# Unified Effects Prototype Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone prototype at `prototype/unified-effects/` showcasing 7 new visual effects on top of the multi-region-art rendering pipeline with camera stabilization.

**Architecture:** Standalone Vite app with a lean main.js (~600-800 lines), a render-pipeline.js extracted from multi-region-art, existing effects copied verbatim, and 7 new effect files each extending BaseEffect. Pre-configured wall regions (no editor) keep focus on effects.

**Tech Stack:** Vite, Canvas 2D, MediaPipe Tasks Vision (segmenter + face + pose landmarks), ES modules, lib/ shared utilities (color-sampler, lighting-detector, jiggle-compensator, feature-tracking).

---

## Phase 1: Scaffold & Foundation (Sequential)

These tasks must be done in order — each builds on the previous.

### Task 1: Create Vite config and HTML shell

**Files:**
- Create: `prototype/unified-effects/vite.config.js`
- Create: `prototype/unified-effects/index.html`

**Step 1: Create vite.config.js**

Copy from multi-region-art with same asset-serving middleware:

```js
import { defineConfig } from 'vite';
import { resolve, join, extname } from 'path';
import { createReadStream, existsSync, statSync } from 'fs';

const projectRoot = resolve(import.meta.dirname, '../..');

const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export default defineConfig({
  server: {
    port: 3211,
    fs: { allow: [projectRoot] },
  },
  plugins: [
    {
      name: 'serve-project-assets',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/assets/')) return next();
          const filePath = join(projectRoot, req.url);
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const mime = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
});
```

**Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unified Effects Prototype</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div class="app">
    <div class="canvas-area">
      <canvas id="canvas" width="1280" height="720"></canvas>
      <video id="webcam" autoplay playsinline style="display:none"></video>
    </div>
    <aside class="sidebar">
      <h1 class="sidebar-title">Unified Effects</h1>

      <section class="panel">
        <h2 class="panel-header" data-toggle="existing">Existing Effects</h2>
        <div class="panel-body" id="existing-effects"></div>
      </section>

      <section class="panel">
        <h2 class="panel-header" data-toggle="new">New Effects</h2>
        <div class="panel-body" id="new-effects"></div>
      </section>

      <section class="panel">
        <h2 class="panel-header">Settings</h2>
        <div class="panel-body">
          <label class="toggle-row">
            <input type="checkbox" id="toggle-occlusion" checked />
            Person Occlusion
          </label>
          <label class="toggle-row">
            <input type="checkbox" id="toggle-stabilization" checked />
            Stabilization
          </label>
          <div class="region-presets">
            <span>Regions:</span>
            <button class="preset-btn" data-count="2">2</button>
            <button class="preset-btn active" data-count="3">3</button>
            <button class="preset-btn" data-count="4">4</button>
          </div>
          <button id="btn-reset" class="btn btn-danger">Reset All</button>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel-header">Status</h2>
        <div class="panel-body" id="status-panel">
          <div class="status-row"><span class="dot loading"></span> Segmentation</div>
          <div class="status-row"><span class="dot loading"></span> Face Mesh</div>
          <div class="status-row"><span class="dot loading"></span> Pose</div>
          <div class="status-row">FPS: <span id="fps-display">--</span></div>
        </div>
      </section>
    </aside>
  </div>

  <div class="bottom-bar">
    <button id="btn-play-all" class="btn btn-accent">Play All Sequentially</button>
    <button id="btn-random" class="btn">Trigger Random</button>
    <span class="active-label">Active: <span id="active-effect">--</span></span>
  </div>

  <script type="module" src="./main.js"></script>
</body>
</html>
```

**Step 3: Verify Vite starts**

Run: `cd prototype/unified-effects && npx vite --open`
Expected: Dev server starts on port 3211, blank page loads without errors.

**Step 4: Commit**

```bash
git add prototype/unified-effects/vite.config.js prototype/unified-effects/index.html
git commit -m "feat(unified-effects): scaffold Vite config and HTML shell"
```

---

### Task 2: Create styles.css

**Files:**
- Create: `prototype/unified-effects/styles.css`

**Step 1: Write the stylesheet**

Dark theme matching multi-region-art: #111 bg, #e85d04 accent, Space Grotesk font. 70/30 layout with canvas left, sidebar right. Effect buttons with progress bar state. Status dots with pulse animation. Bottom bar with playback controls.

Key classes: `.app` (flex row), `.canvas-area` (flex 7), `.sidebar` (flex 3, overflow-y auto), `.panel` / `.panel-header` / `.panel-body`, `.fx-btn` (effect trigger button with `.fx-btn.active` progress overlay), `.toggle-row`, `.preset-btn` / `.preset-btn.active`, `.status-row` / `.dot` / `.dot.ready` / `.dot.loading` / `.dot.error`, `.bottom-bar`, `.btn` / `.btn-accent` / `.btn-danger`.

Responsive canvas: `canvas { width: 100%; height: auto; max-height: 80vh; }`. Sidebar scrollable. Bottom bar fixed to bottom.

**Step 2: Commit**

```bash
git add prototype/unified-effects/styles.css
git commit -m "feat(unified-effects): add dark theme stylesheet"
```

---

### Task 3: Create render-pipeline.js

**Files:**
- Create: `prototype/unified-effects/render-pipeline.js`

**Step 1: Extract pure rendering functions from multi-region-art**

This module exports 4 pure functions verbatim from `prototype/multi-region-art/multi-region.js` (lines 1840-2047):

```js
/**
 * Render pipeline — pure functions for perspective-warped region rendering.
 * Extracted from multi-region-art/multi-region.js.
 */

export function bilinearPoint(tl, tr, bl, br, u, v) {
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

export function drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy1, sx2, sy2, p0, p1, p2) {
  // ... exact code from multi-region.js lines 1920-1982
}

export function drawPerspectiveImage(ctx, source, corners, transform, _canvasWidth, _canvasHeight) {
  // ... exact code from multi-region.js lines 1840-1893
  // Uses bilinearPoint and drawTexturedTriangle internally
}

export function applyPersonMask(ctx, mask, mWidth, mHeight) {
  // ... exact code from multi-region.js lines 1986-2047
}
```

Copy the function bodies verbatim. The only change: `drawPerspectiveImage` calls the module-level `bilinearPoint` and `drawTexturedTriangle` instead of closure-scoped functions.

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/render-pipeline.js`
Expected: No errors.

**Step 3: Commit**

```bash
git add prototype/unified-effects/render-pipeline.js
git commit -m "feat(unified-effects): extract render pipeline from multi-region-art"
```

---

### Task 4: Copy existing effects

**Files:**
- Create: `prototype/unified-effects/effects/base-effect.js`
- Create: `prototype/unified-effects/effects/utils.js`
- Create: `prototype/unified-effects/effects/scanner-sequence.js`
- Create: `prototype/unified-effects/effects/mesh-shimmer.js`
- Create: `prototype/unified-effects/effects/edge-wireframe.js`

**Step 1: Copy files verbatim**

```bash
mkdir -p prototype/unified-effects/effects
cp prototype/multi-region-art/effects/base-effect.js prototype/unified-effects/effects/
cp prototype/multi-region-art/effects/utils.js prototype/unified-effects/effects/
cp prototype/multi-region-art/effects/scanner-sequence.js prototype/unified-effects/effects/
cp prototype/multi-region-art/effects/mesh-shimmer.js prototype/unified-effects/effects/
cp prototype/multi-region-art/effects/edge-wireframe.js prototype/unified-effects/effects/
```

**Step 2: Verify imports resolve**

All imports are relative within the effects/ directory (e.g., `import { BaseEffect } from './base-effect.js'`). No changes needed.

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/
git commit -m "feat(unified-effects): copy existing effects from multi-region-art"
```

---

### Task 5: Create extended TransitionEffectManager

**Files:**
- Create: `prototype/unified-effects/effects/transition-manager.js`

**Step 1: Write the extended manager**

Based on `prototype/multi-region-art/effects/transition-manager.js` but extended with:
- `_allEffects` array includes all 9 effects (2 existing + 7 new)
- Shared landmark cache: `getCachedFaceLandmarks()`, `getCachedPoseLandmarks()`, `getCachedContour()`
- Region data access: `setRegions(regions)`, `getRegions()`, `setRegionColors(colors)`, `getRegionColors()`
- Portal hook: `setPortalRegion(regionId)`, `getPortalRegion()`
- Updated `triggerEffect(name, timestamp)` method for sidebar button triggers
- Updated debug panel replaced by sidebar integration (no fixed panel)

The manager imports all 9 effect classes. New effects are instantiated in constructor. Each new effect is triggered via `triggerEffect(name, timestamp)` which passes the appropriate cached data.

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/transition-manager.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/transition-manager.js
git commit -m "feat(unified-effects): create extended transition manager with shared caches"
```

---

### Task 6: Create main.js (core app)

**Files:**
- Create: `prototype/unified-effects/main.js`

**Step 1: Write the main application controller**

Structure (~600-800 lines):

```
// Imports
import { drawPerspectiveImage, applyPersonMask } from './render-pipeline.js';
import { TransitionEffectManager } from './effects/transition-manager.js';
import { ScannerSequence } from './effects/scanner-sequence.js';
import { extractContour } from './effects/utils.js';
import { detectDominantColor } from '../../lib/color-sampler.js';

// State
const state = { ... };
const elements = { ... };

// Region presets (2, 3, 4 configurations with bundled art)
const REGION_PRESETS = { ... };

// Webcam initialization
async function initWebcam() { ... }

// MediaPipe model loading (segmenter, face, pose)
async function initMediaPipe() { ... }

// Jiggle compensator setup
function initStabilization() { ... }

// Region management
function loadRegionPreset(count) { ... }
function regionToPixelCorners(region, w, h) { ... }

// Color sampling (once per region art load)
function sampleRegionColors() { ... }

// Render loop
function renderLoop(timestamp) { ... }
  // 1. Jiggle compensator process
  // 2. Draw webcam
  // 3. Segmentation (copy mask, cache contour)
  // 4. Face + pose landmarks (cache on manager)
  // 5. Render regions (perspective mesh + mask cutout)
  // 6. Effects layer (manager.update)
  // 7. Scanner sequence
  // 8. UI overlays (region outlines, FPS)

// UI event handlers
function setupUI() { ... }
  // Effect buttons (trigger on click)
  // Settings toggles
  // Region preset selector
  // Play All / Random buttons
  // FPS counter update

// Init
async function init() { ... }
init();
```

Key implementation details:
- Face/pose landmark results are cached on manager via `manager.updateLandmarkCache(faceLandmarks, poseLandmarks)`
- Region rendering uses temp OffscreenCanvas for mask cutout compositing
- Portal effect communicates via `manager.getPortalRegion()` — if set, skip mask cutout for that region
- JiggleCompensator.applyToRegion() offsets corners before rendering
- FPS tracked via simple frame counter (frames per second)

**Step 2: Verify the app loads with webcam**

Run: `cd prototype/unified-effects && npx vite`
Open browser, grant camera permission. Expected: webcam video displays on canvas, sidebar visible, status dots show loading.

**Step 3: Commit**

```bash
git add prototype/unified-effects/main.js
git commit -m "feat(unified-effects): main app with render loop, regions, MediaPipe, stabilization"
```

---

### Task 7: Add npm script

**Files:**
- Modify: `package.json`

**Step 1: Add dev script**

Add `"dev:unified-effects": "vite --config prototype/unified-effects/vite.config.js"` to the scripts section in package.json, alongside the existing `dev:wall-art` script.

**Step 2: Verify it works**

Run: `npm run dev:unified-effects`
Expected: Vite dev server starts.

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat(unified-effects): add dev script to package.json"
```

---

## Phase 2: New Effects (Parallel)

All 7 effects are independent — they each extend BaseEffect, import from `./utils.js`, and are self-contained. **These can all be developed in parallel by separate agents.**

Each effect follows the same pattern:
1. Import BaseEffect and utils
2. Set `this.duration` in constructor
3. Accept data in `onTrigger()` and cache it
4. Draw in `render(ctx, progress, elapsed, w, h)`
5. The manager passes cached data when triggering

### Task 8: Ambient Aura effect

**Files:**
- Create: `prototype/unified-effects/effects/ambient-aura.js`

**Step 1: Write the effect**

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class AmbientAuraEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 12000;
    this._contour = [];
    this._regionColors = [];
    this._regionCenters = [];
  }

  onTrigger(_ts, contour, regionColors, regionCenters) {
    this._contour = contour || [];
    this._regionColors = regionColors || [];
    this._regionCenters = regionCenters || [];
  }

  render(ctx, progress, elapsed, w, h) {
    if (this._contour.length === 0 || this._regionColors.length === 0) return;

    // Fade envelope: in 2s, sustain, out 3s
    const fadeIn = Math.min(elapsed / 2000, 1);
    const fadeOut = progress > 0.75 ? 1 - easeOutCubic((progress - 0.75) / 0.25) : 1;
    const fade = fadeIn * fadeOut;

    // Breathing alpha
    const breath = 0.3 + 0.3 * Math.sin(elapsed * 0.003);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // For each contour point, draw radial glow colored by nearest region
    const step = Math.max(1, Math.floor(this._contour.length / 40));
    for (let i = 0; i < this._contour.length; i += step) {
      const p = this._contour[i];
      const color = this._nearestRegionColor(p);
      const radius = 40 + 40 * Math.sin(elapsed * 0.002 + i * 0.1);

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${fade * breath})`);
      grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    }

    ctx.restore();
  }

  _nearestRegionColor(point) {
    let minDist = Infinity;
    let color = { r: 255, g: 200, b: 100 };
    for (let i = 0; i < this._regionCenters.length; i++) {
      const c = this._regionCenters[i];
      const dist = Math.hypot(point.x - c.x, point.y - c.y);
      if (dist < minDist) {
        minDist = dist;
        color = this._regionColors[i] || color;
      }
    }
    return color;
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/ambient-aura.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/ambient-aura.js
git commit -m "feat(unified-effects): add ambient aura effect"
```

---

### Task 9: Depth Parallax effect

**Files:**
- Create: `prototype/unified-effects/effects/depth-parallax.js`

**Step 1: Write the effect**

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class DepthParallaxEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 15000;
    this._manager = null;
    this._parallaxStrength = 30; // max pixel offset
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager) return;

    const faceLandmarks = this._manager.getCachedFaceLandmarks();
    if (!faceLandmarks || faceLandmarks.length === 0) return;

    // Nose tip = landmark 1 (normalized, pre-multiplied by canvas dims in cache)
    const nose = faceLandmarks[1];
    if (!nose) return;

    // Strength ramps in 1s, sustains, ramps out 2s
    const rampIn = Math.min(elapsed / 1000, 1);
    const rampOut = progress > 0.87 ? 1 - easeOutCubic((progress - 0.87) / 0.13) : 1;
    const strength = rampIn * rampOut * this._parallaxStrength;

    // Head position relative to center
    const centerX = w / 2;
    const centerY = h / 2;
    const offsetX = (nose.x - centerX) / centerX; // -1 to 1
    const offsetY = (nose.y - centerY) / centerY;

    // Store parallax offsets on manager for render loop to apply
    // Each region gets offset proportional to distance from center
    const regions = this._manager.getRegions();
    const offsets = regions.map((region) => {
      const regionCX = (region.region.topLeft.x + region.region.bottomRight.x) / 2;
      const distFromCenter = Math.abs(regionCX - 50) / 50; // 0-1
      const depth = 0.5 + distFromCenter * 0.5; // 0.5-1.0
      return {
        panX: -offsetX * strength * depth,
        panY: -offsetY * strength * depth * 0.5,
      };
    });

    this._manager._parallaxOffsets = offsets;
  }
}
```

The render loop in main.js reads `manager._parallaxOffsets` and adds them to each region's transform.panX/panY before calling `drawPerspectiveImage`.

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/depth-parallax.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/depth-parallax.js
git commit -m "feat(unified-effects): add depth parallax effect"
```

---

### Task 10: Region Reactivity effect

**Files:**
- Create: `prototype/unified-effects/effects/region-reactivity.js`

**Step 1: Write the effect**

Detects three gestures from face/pose landmarks:
- **Smile:** mouth corner distance vs face width → warm hue overlay
- **Hand raise:** wrist above shoulder → pulsing border on nearest region
- **Head tilt:** eye angle → rotation indicator

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class RegionReactivityEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 20000;
    this._manager = null;
    this._smoothedSmile = 0;
    this._smoothedTilt = 0;
    this._smoothedRaise = [0, 0]; // left, right
    this._ema = 0.3;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedSmile = 0;
    this._smoothedTilt = 0;
    this._smoothedRaise = [0, 0];
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager) return;
    const fade = progress > 0.85 ? 1 - easeOutCubic((progress - 0.85) / 0.15) : 1;

    const faceLM = this._manager.getCachedFaceLandmarks();
    const poseLM = this._manager.getCachedPoseLandmarks();
    const regions = this._manager.getRegions();

    // Smile detection
    if (faceLM && faceLM.length >= 292) {
      const mouthL = faceLM[61];
      const mouthR = faceLM[291];
      const faceL = faceLM[234];
      const faceR = faceLM[454];
      if (mouthL && mouthR && faceL && faceR) {
        const mouthW = Math.hypot(mouthR.x - mouthL.x, mouthR.y - mouthL.y);
        const faceW = Math.hypot(faceR.x - faceL.x, faceR.y - faceL.y);
        const smileRatio = faceW > 0 ? mouthW / faceW : 0;
        const isSmiling = smileRatio > 0.38 ? 1 : 0;
        this._smoothedSmile += (isSmiling - this._smoothedSmile) * this._ema;
      }

      // Head tilt
      const eyeL = faceLM[33];
      const eyeR = faceLM[263];
      if (eyeL && eyeR) {
        const angle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
        this._smoothedTilt += (angle - this._smoothedTilt) * this._ema;
      }
    }

    // Hand raise
    if (poseLM && poseLM.length >= 17) {
      for (let side = 0; side < 2; side++) {
        const wrist = poseLM[side === 0 ? 15 : 16];
        const shoulder = poseLM[side === 0 ? 11 : 12];
        if (wrist && shoulder) {
          const raised = wrist.y < shoulder.y ? 1 : 0;
          this._smoothedRaise[side] += (raised - this._smoothedRaise[side]) * this._ema;
        }
      }
    }

    ctx.save();

    // Draw smile warmth overlay on regions
    if (this._smoothedSmile > 0.2) {
      const warmth = this._smoothedSmile * fade;
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = warmth * 0.3;
      ctx.fillStyle = '#ff8844';
      // Fill each region quad
      for (const region of regions) {
        const corners = this._regionToPixels(region, w, h);
        ctx.beginPath();
        ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
        ctx.lineTo(corners.topRight.x, corners.topRight.y);
        ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
        ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Draw hand-raise highlight on nearest region
    const maxRaise = Math.max(...this._smoothedRaise);
    if (maxRaise > 0.3 && poseLM) {
      const side = this._smoothedRaise[0] > this._smoothedRaise[1] ? 0 : 1;
      const wrist = poseLM[side === 0 ? 15 : 16];
      if (wrist) {
        let nearest = null;
        let minDist = Infinity;
        for (const region of regions) {
          const corners = this._regionToPixels(region, w, h);
          const cx = (corners.topLeft.x + corners.bottomRight.x) / 2;
          const cy = (corners.topLeft.y + corners.bottomRight.y) / 2;
          const dist = Math.hypot(wrist.x - cx, wrist.y - cy);
          if (dist < minDist) { minDist = dist; nearest = corners; }
        }
        if (nearest) {
          const pulse = 2 + 4 * Math.sin(elapsed * 0.008);
          ctx.strokeStyle = `rgba(232, 93, 4, ${maxRaise * fade * 0.8})`;
          ctx.lineWidth = pulse;
          ctx.beginPath();
          ctx.moveTo(nearest.topLeft.x, nearest.topLeft.y);
          ctx.lineTo(nearest.topRight.x, nearest.topRight.y);
          ctx.lineTo(nearest.bottomRight.x, nearest.bottomRight.y);
          ctx.lineTo(nearest.bottomLeft.x, nearest.bottomLeft.y);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // Draw tilt indicator (subtle rotation text)
    if (Math.abs(this._smoothedTilt) > 0.05) {
      const degrees = (this._smoothedTilt * 180 / Math.PI).toFixed(1);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(0, 255, 65, ${fade * 0.4})`;
      ctx.textAlign = 'right';
      ctx.fillText(`tilt: ${degrees}°`, w - 12, 20);
    }

    ctx.restore();
  }

  _regionToPixels(region, w, h) {
    return {
      topLeft: { x: region.region.topLeft.x / 100 * w, y: region.region.topLeft.y / 100 * h },
      topRight: { x: region.region.topRight.x / 100 * w, y: region.region.topRight.y / 100 * h },
      bottomLeft: { x: region.region.bottomLeft.x / 100 * w, y: region.region.bottomLeft.y / 100 * h },
      bottomRight: { x: region.region.bottomRight.x / 100 * w, y: region.region.bottomRight.y / 100 * h },
    };
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/region-reactivity.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/region-reactivity.js
git commit -m "feat(unified-effects): add region reactivity effect"
```

---

### Task 11: Contour Particles effect

**Files:**
- Create: `prototype/unified-effects/effects/contour-particles.js`

**Step 1: Write the effect**

Particle system with pool, contour-based spawning, outward velocity, gravity, lifetime, additive blending.

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class ContourParticlesEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 10000;
    this._contour = [];
    this._particles = [];
    this._maxParticles = 150;
    this._lastSpawnTime = 0;
  }

  onTrigger(_ts, contour) {
    this._contour = contour || [];
    this._particles = [];
    this._lastSpawnTime = 0;
  }

  render(ctx, progress, elapsed, w, h) {
    if (this._contour.length < 5) return;
    const fade = progress > 0.8 ? 1 - easeOutCubic((progress - 0.8) / 0.2) : 1;
    const dt = 16; // approximate frame time

    // Spawn 2-4 particles per frame
    if (this._particles.length < this._maxParticles) {
      const spawnCount = 2 + Math.floor(Math.random() * 3);
      for (let s = 0; s < spawnCount; s++) {
        this._spawnParticle(elapsed);
      }
    }

    // Update and render
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const alive = [];
    for (const p of this._particles) {
      p.age += dt;
      if (p.age > p.lifetime) continue;

      // Physics
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vy += 0.03; // gentle gravity

      const lifeRatio = p.age / p.lifetime;
      const alpha = fade * (1 - lifeRatio);
      const radius = p.radius * (1 - lifeRatio * 0.5);

      // Glow
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2);
      grad.addColorStop(0, `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha})`);
      grad.addColorStop(1, `rgba(${p.r}, ${p.g}, ${p.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - radius * 2, p.y - radius * 2, radius * 4, radius * 4);

      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha * 0.9})`;
      ctx.fill();

      alive.push(p);
    }

    this._particles = alive;
    ctx.restore();
  }

  _spawnParticle(_elapsed) {
    const idx = Math.floor(Math.random() * this._contour.length);
    const p = this._contour[idx];

    // Approximate outward normal from neighbors
    const prev = this._contour[(idx - 1 + this._contour.length) % this._contour.length];
    const next = this._contour[(idx + 1) % this._contour.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // Normal perpendicular to tangent (pointing outward)
    let nx = -ty / len;
    let ny = tx / len;

    // Add randomness
    const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.2;
    const speed = 0.5 + Math.random() * 1.5;

    this._particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 2,
      lifetime: 1500 + Math.random() * 1500,
      age: 0,
      r: 255, g: 220, b: 150, // warm gold
    });
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/contour-particles.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/contour-particles.js
git commit -m "feat(unified-effects): add contour particles effect"
```

---

### Task 12: Portal Dissolve effect

**Files:**
- Create: `prototype/unified-effects/effects/portal-dissolve.js`

**Step 1: Write the effect**

Selects the largest region as portal. Over first 3s, gradually transitions from normal occlusion to portal mode (art drawn over person). Dissolve edge at contour-region intersection. Reverses over last 3s.

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class PortalDissolveEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 12000;
    this._manager = null;
    this._portalRegionId = null;
    this._contour = [];
  }

  onTrigger(_ts, manager, contour) {
    this._manager = manager;
    this._contour = contour || [];

    // Select largest region as portal
    const regions = manager.getRegions();
    let maxArea = 0;
    let portalId = null;
    for (const r of regions) {
      const w = Math.abs(r.region.topRight.x - r.region.topLeft.x);
      const h = Math.abs(r.region.bottomLeft.y - r.region.topLeft.y);
      const area = w * h;
      if (area > maxArea) { maxArea = area; portalId = r.id; }
    }
    this._portalRegionId = portalId;
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager || !this._portalRegionId) return;

    // Portal intensity: ramp up first 3s, hold, ramp down last 3s
    let intensity;
    if (elapsed < 3000) {
      intensity = easeOutCubic(elapsed / 3000);
    } else if (progress > 0.75) {
      intensity = 1 - easeOutCubic((progress - 0.75) / 0.25);
    } else {
      intensity = 1;
    }

    // Set portal on manager (render loop reads this to skip mask for this region)
    if (intensity > 0.05) {
      this._manager.setPortalRegion(this._portalRegionId, intensity);
    } else {
      this._manager.setPortalRegion(null, 0);
    }

    // Draw dissolve edge glow at region boundaries
    if (this._contour.length > 0 && intensity > 0.1) {
      const region = this._manager.getRegions().find(r => r.id === this._portalRegionId);
      if (region) {
        this._renderDissolveEdge(ctx, region, intensity, elapsed, w, h);
      }
    }
  }

  _renderDissolveEdge(ctx, region, intensity, elapsed, w, h) {
    const corners = {
      topLeft: { x: region.region.topLeft.x / 100 * w, y: region.region.topLeft.y / 100 * h },
      topRight: { x: region.region.topRight.x / 100 * w, y: region.region.topRight.y / 100 * h },
      bottomLeft: { x: region.region.bottomLeft.x / 100 * w, y: region.region.bottomLeft.y / 100 * h },
      bottomRight: { x: region.region.bottomRight.x / 100 * w, y: region.region.bottomRight.y / 100 * h },
    };

    // Draw glowing border on portal region
    const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 0.005);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(100, 200, 255, ${intensity * shimmer * 0.6})`;
    ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/portal-dissolve.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/portal-dissolve.js
git commit -m "feat(unified-effects): add portal dissolve effect"
```

---

### Task 13: Wireframe Morph effect

**Files:**
- Create: `prototype/unified-effects/effects/wireframe-morph.js`

**Step 1: Write the effect**

Cycles face/pose mesh through 4 visual styles (4s each): Matrix → Blueprint → Neon → Circuit. Cross-fades via HSL interpolation.

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

const STYLES = [
  { name: 'matrix', color: [0, 255, 65], lineWidth: 1.2, glow: 0, nodeRadius: 0 },
  { name: 'blueprint', color: [68, 136, 255], lineWidth: 0.8, glow: 0, nodeRadius: 3 },
  { name: 'neon', color: [255, 68, 170], lineWidth: 2, glow: 8, nodeRadius: 4 },
  { name: 'circuit', color: [255, 170, 0], lineWidth: 1, glow: 0, nodeRadius: 2 },
];

const STYLE_DURATION = 4000;

export class WireframeMorphEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = STYLE_DURATION * STYLES.length; // 16s
    this._manager = null;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager) return;
    const faceLM = this._manager.getCachedFaceLandmarks();
    const poseLM = this._manager.getCachedPoseLandmarks();
    if (!faceLM && !poseLM) return;

    // Determine current and next style
    const styleProgress = elapsed / STYLE_DURATION;
    const currentIdx = Math.min(Math.floor(styleProgress), STYLES.length - 1);
    const nextIdx = Math.min(currentIdx + 1, STYLES.length - 1);
    const blend = styleProgress - currentIdx; // 0-1 within current style

    // Cross-fade in last 0.5s of each style
    const crossFade = blend > 0.875 ? (blend - 0.875) / 0.125 : 0;
    const current = STYLES[currentIdx];
    const next = STYLES[nextIdx];

    const r = Math.round(current.color[0] + (next.color[0] - current.color[0]) * crossFade);
    const g = Math.round(current.color[1] + (next.color[1] - current.color[1]) * crossFade);
    const b = Math.round(current.color[2] + (next.color[2] - current.color[2]) * crossFade);
    const lw = current.lineWidth + (next.lineWidth - current.lineWidth) * crossFade;
    const glow = current.glow + (next.glow - current.glow) * crossFade;
    const nodeR = current.nodeRadius + (next.nodeRadius - current.nodeRadius) * crossFade;

    const overallFade = progress > 0.9 ? 1 - easeOutCubic((progress - 0.9) / 0.1) : 1;

    ctx.save();
    ctx.globalAlpha = overallFade;

    if (glow > 0) {
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.shadowBlur = glow;
    }

    // Draw pose skeleton
    if (poseLM && this._manager._poseConnections) {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
      ctx.lineWidth = lw + 1;
      for (const conn of this._manager._poseConnections) {
        const a = poseLM[conn.start];
        const bPt = poseLM[conn.end];
        if (!a || !bPt) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bPt.x, bPt.y);
        ctx.stroke();
      }
      // Nodes
      if (nodeR > 0) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        for (const lm of poseLM) {
          if (!lm) continue;
          ctx.beginPath();
          ctx.arc(lm.x, lm.y, nodeR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw face mesh
    if (faceLM && this._manager._faceTesselation) {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.lineWidth = lw;
      for (const edge of this._manager._faceTesselation) {
        const a = faceLM[edge.start];
        const bPt = faceLM[edge.end];
        if (!a || !bPt) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bPt.x, bPt.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/wireframe-morph.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/wireframe-morph.js
git commit -m "feat(unified-effects): add wireframe morph effect"
```

---

### Task 14: Environmental Glow effect

**Files:**
- Create: `prototype/unified-effects/effects/environmental-glow.js`

**Step 1: Write the effect**

Simulates light spill from art regions onto person. Uses contour points, region colors, inverse-square falloff, and lighting detector brightness multiplier.

```js
import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class EnvironmentalGlowEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 15000;
    this._contour = [];
    this._regionColors = [];
    this._regionCenters = [];
    this._brightnessMult = 1.0;
    this._glowCanvas = null;
    this._lastRebuildTime = 0;
    this._manager = null;
    this._mask = null;
    this._maskW = 0;
    this._maskH = 0;
  }

  onTrigger(_ts, contour, regionColors, regionCenters, brightnessMult, manager) {
    this._contour = contour || [];
    this._regionColors = regionColors || [];
    this._regionCenters = regionCenters || [];
    this._brightnessMult = brightnessMult || 1.0;
    this._manager = manager;
    this._glowCanvas = null;
    this._lastRebuildTime = 0;
  }

  render(ctx, progress, elapsed, w, h) {
    if (this._contour.length === 0 || this._regionColors.length === 0) return;

    // Rebuild glow overlay every 200ms (contour updates)
    if (this._manager) {
      const contour = this._manager.getCachedContour();
      if (contour && contour.length > 0) this._contour = contour;
    }

    const now = this.startTime + elapsed;
    if (!this._glowCanvas || now - this._lastRebuildTime > 200) {
      this._rebuildGlow(w, h);
      this._lastRebuildTime = now;
    }

    if (!this._glowCanvas) return;

    // Fade envelope
    const fadeIn = Math.min(elapsed / 2000, 1);
    const fadeOut = progress > 0.8 ? 1 - easeOutCubic((progress - 0.8) / 0.2) : 1;
    const fade = fadeIn * fadeOut;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fade * this._brightnessMult * 0.6;
    ctx.drawImage(this._glowCanvas, 0, 0);
    ctx.restore();
  }

  _rebuildGlow(w, h) {
    if (!this._glowCanvas) {
      this._glowCanvas = new OffscreenCanvas(w, h);
    }
    const gCtx = this._glowCanvas.getContext('2d');
    gCtx.clearRect(0, 0, w, h);

    // For each contour point, accumulate color from all regions (inverse-square)
    const step = Math.max(1, Math.floor(this._contour.length / 60));
    for (let i = 0; i < this._contour.length; i += step) {
      const p = this._contour[i];
      let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;

      for (let j = 0; j < this._regionCenters.length; j++) {
        const c = this._regionCenters[j];
        const color = this._regionColors[j];
        if (!color) continue;
        const dist = Math.max(50, Math.hypot(p.x - c.x, p.y - c.y));
        const weight = 10000 / (dist * dist); // inverse square
        totalR += color.r * weight;
        totalG += color.g * weight;
        totalB += color.b * weight;
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        const r = Math.round(totalR / totalWeight);
        const g = Math.round(totalG / totalWeight);
        const b = Math.round(totalB / totalWeight);

        const grad = gCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        gCtx.fillStyle = grad;
        gCtx.fillRect(p.x - 30, p.y - 30, 60, 60);
      }
    }
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint -- prototype/unified-effects/effects/environmental-glow.js`

**Step 3: Commit**

```bash
git add prototype/unified-effects/effects/environmental-glow.js
git commit -m "feat(unified-effects): add environmental glow effect"
```

---

## Phase 3: Integration & Polish (Sequential)

### Task 15: Wire all effects into TransitionEffectManager

**Files:**
- Modify: `prototype/unified-effects/effects/transition-manager.js`
- Modify: `prototype/unified-effects/main.js`

**Step 1: Import and instantiate all 7 new effects in the manager**

Add imports for all new effect classes. Instantiate in constructor. Add to `_allEffects` array. Implement `triggerEffect(name, timestamp)` which switches on name and passes the correct cached data to each effect's `trigger()`.

**Step 2: Wire sidebar buttons in main.js**

Each effect button calls `manager.triggerEffect(name, performance.now())`. Update active effect display. "Play All" iterates with `setTimeout` stagger of 2s + effect duration. "Random" picks from array.

**Step 3: Wire portal hook into render loop**

In the region rendering section of renderLoop, check `manager.getPortalRegion()`. If set, for that region: draw art over the webcam+person (skip mask cutout) at the portal intensity alpha.

**Step 4: Wire parallax into render loop**

Read `manager._parallaxOffsets` array. For each region, add the parallax offset to the transform before calling `drawPerspectiveImage`.

**Step 5: Verify all effects trigger from sidebar**

Run: `npm run dev:unified-effects`
Open browser. Click each effect button. Verify:
- Each effect triggers and renders visibly
- Progress bar shows on button while active
- Active label updates in bottom bar
- Effects fade out cleanly at end of duration
- Multiple effects can be active simultaneously

**Step 6: Commit**

```bash
git add prototype/unified-effects/effects/transition-manager.js prototype/unified-effects/main.js
git commit -m "feat(unified-effects): wire all effects, portal hook, parallax into render loop"
```

---

### Task 16: Visual polish and testing

**Files:**
- Modify: `prototype/unified-effects/styles.css` (minor tweaks)
- Modify: `prototype/unified-effects/main.js` (FPS display, error handling)

**Step 1: Add error handling for MediaPipe model loading**

Update status dots: loading (orange pulse) → ready (green) → error (red). Show error message if model fails to load. Effects that need missing models are disabled (button grayed out).

**Step 2: Add FPS counter**

Simple frame counter: increment per frame, update display every second.

**Step 3: Run lint on entire prototype**

Run: `npm run lint -- prototype/unified-effects/`
Fix any issues.

**Step 4: Verify end-to-end**

Manual test checklist:
- [ ] Webcam loads and displays
- [ ] Segmentation initializes (status dot turns green)
- [ ] Face/Pose landmarks initialize
- [ ] 3 default regions render with art
- [ ] Person occlusion works (person in front of art)
- [ ] Stabilization toggle works
- [ ] Each of 10 effects triggers from button
- [ ] "Play All Sequentially" cycles through effects
- [ ] "Trigger Random" fires random effect
- [ ] Region preset selector (2/3/4) works
- [ ] Reset clears all state

**Step 5: Commit**

```bash
git add prototype/unified-effects/
git commit -m "feat(unified-effects): polish, error handling, FPS counter"
```

---

## Parallelization Guide

```
Phase 1 (Sequential): Tasks 1-7
  Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7

Phase 2 (All Parallel): Tasks 8-14
  ┌─ Task 8:  Ambient Aura
  ├─ Task 9:  Depth Parallax
  ├─ Task 10: Region Reactivity
  ├─ Task 11: Contour Particles
  ├─ Task 12: Portal Dissolve
  ├─ Task 13: Wireframe Morph
  └─ Task 14: Environmental Glow

Phase 3 (Sequential): Tasks 15-16
  Task 15 → Task 16
```

**Maximum parallelism: 7 agents** (one per effect in Phase 2).

Tasks 1-7 establish the foundation all effects depend on. Tasks 8-14 are fully independent. Tasks 15-16 integrate everything.
