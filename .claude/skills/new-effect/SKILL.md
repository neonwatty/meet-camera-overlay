---
name: new-effect
description: Scaffold a new wall art transition effect extending BaseEffect. Asks for name and description, creates the file, and wires it into TransitionEffectManager.
---

# Skill: new-effect

Scaffold a new transition effect for the wall art prototype. When this skill is invoked:

## Step 1 — Gather requirements

Ask the user:
1. **Effect name** — a PascalCase class name suffix, e.g. `RippleWave` (the class will be `RippleWaveEffect`, the file `ripple-wave.js`).
2. **Brief description** — one or two sentences describing what the effect looks like visually.

Derive the kebab-case filename automatically from the class name: `RippleWave` → `ripple-wave.js`.

## Step 2 — Create the effect file

Create the file at:

```
prototype/multi-region-art/effects/<kebab-name>.js
```

The file MUST:

- Stay under **350 lines** (blank lines and comment lines excluded from the count per project convention).
- Import `BaseEffect` from `./base-effect.js`.
- Import any needed utilities from `./utils.js` (see API reference below).
- Export a single named class `<PascalName>Effect` that extends `BaseEffect`.
- Override `constructor`, `onTrigger`, and `render` at minimum.
- Use `ctx.save()` / `ctx.restore()` around all canvas drawing in `render`.
- Not override `trigger` or `update` — those are owned by `BaseEffect`.

### Skeleton to start from

```js
/**
 * <PascalName>Effect — <one-line description>.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class <PascalName>Effect extends BaseEffect {
  constructor() {
    super();
    this.duration = 3000; // ms — adjust to suit the effect
    // declare all instance state here (no undeclared assignments in onTrigger/render)
  }

  /**
   * Called once when the effect is triggered.
   * Store any snapshot data needed for rendering.
   *
   * Common args passed by TransitionEffectManager (use what you need):
   *   timestamp   — DOMHighResTimeStamp from performance.now()
   *   contour     — Array<{x,y}> person boundary points (canvas coords)
   *   mask        — Uint8Array segmentation mask (0 = person, 255 = background)
   *   maskW       — mask pixel width
   *   maskH       — mask pixel height
   *   canvasW     — render canvas width
   *   canvasH     — render canvas height
   *   faceLandmarker  — MediaPipe FaceLandmarker instance (or null)
   *   faceTesselation — FACE_LANDMARKS_TESSELATION connections array
   *   poseLandmarker  — MediaPipe PoseLandmarker instance (or null)
   *   poseConnections — POSE_CONNECTIONS array
   *   videoSource — HTMLVideoElement (live webcam feed)
   *   manager     — TransitionEffectManager (to trigger sibling effects)
   */
  onTrigger(_timestamp, ...args) {
    // unpack only the args your effect needs
  }

  /**
   * Called every animation frame while active.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} progress — 0..1 (eased by caller via elapsed/duration)
   * @param {number} elapsed  — ms since trigger
   * @param {number} w        — canvas width
   * @param {number} h        — canvas height
   */
  render(ctx, progress, elapsed, w, h) {
    ctx.save();
    // ... drawing code ...
    ctx.restore();
  }
}
```

## Step 3 — Register the effect in TransitionEffectManager

Edit `prototype/multi-region-art/effects/transition-manager.js`:

1. Add an import at the top:
   ```js
   import { <PascalName>Effect } from './<kebab-name>.js';
   ```

2. In `constructor()`, instantiate and add to `this._allEffects`:
   ```js
   this.<camelName> = new <PascalName>Effect();
   // ...
   this._allEffects = [
     this.meshShimmer,
     this.edgeWireframe,
     this.<camelName>,   // <-- add here
   ];
   ```

3. Add a debug panel button inside the `createDebugPanel()` HTML string:
   ```html
   <button data-fx="<camelName>">
     <span class="fx-dot" style="background:#00ff41"></span>
     <Effect Display Name>
   </button>
   ```

4. Handle it in `_handleDebugClick(fx)`:
   ```js
   case '<camelName>':
     this.<camelName>.trigger(t, /* pass the args your onTrigger expects */);
     break;
   ```

5. Set disabled logic in `_startDebugPanelUpdater` if the effect requires specific data (e.g. a video source or contour):
   ```js
   } else if (fx === '<camelName>') {
     btn.disabled = !hasPerson; // or !hasVideo, or false
   }
   ```

## Step 4 — Export from index (optional but recommended)

If the effect class is intended to be used outside the manager, add it to `prototype/multi-region-art/effects/index.js`:

```js
export { <PascalName>Effect } from './<kebab-name>.js';
```

---

## BaseEffect API Reference

### Class: `BaseEffect` (`effects/base-effect.js`)

```js
class BaseEffect {
  // State (read in render/onTrigger, do not reassign trigger/update)
  active    // boolean — true while effect is running
  startTime // DOMHighResTimeStamp — set by trigger()
  duration  // number (ms) — set this in constructor; controls when active → false

  // Called by the manager each frame
  trigger(timestamp, ...args)   // sets active=true, startTime, calls onTrigger
  update(ctx, timestamp, w, h)  // computes progress, calls render, clears active at 1.0

  // Override these — do NOT override trigger() or update()
  onTrigger(timestamp, ...args) // snapshot expensive data here
  render(ctx, progress, elapsed, w, h) // draw every frame
}
```

Key rules:
- `progress` is `Math.min(elapsed / this.duration, 1)` — always 0..1.
- Effect auto-deactivates when `progress >= 1`.
- To loop or restart: call `trigger()` again from the manager.
- Heavy computation (image processing, landmark detection) belongs in `onTrigger`, not `render`.

### Available utilities (`effects/utils.js`)

| Export | Signature | Purpose |
|---|---|---|
| `easeOutCubic` | `(t: number) => number` | Easing: `1 - (1-t)^3`. Use for fade-outs. |
| `extractContour` | `(mask, maskW, maskH, canvasW, canvasH) => Array<{x,y}>` | Traces person silhouette boundary. Returns clockwise points in canvas coords. Left edge then right edge reversed. |
| `renderMaskOverlay` | `(mask, maskW, maskH, canvasW, canvasH) => OffscreenCanvas` | Draws green (#00ff41) pixels where mask===0 (person). Returns OffscreenCanvas ready for drawImage. |
| `sobelEdgeDetect` | `(sourceCanvas, width, height) => OffscreenCanvas` | Runs Sobel on sourceCanvas, returns green-tinted edge map at given dimensions. |

### Canvas tips (from project learnings)

- `lineWidth` must be `>= 1.0` to be visible (sub-pixel values render nothing).
- `screen` blend mode with `globalAlpha < 0.2` is nearly invisible over bright webcam.
- Good alpha oscillation range for shimmer: `0.6..1.0`, not `0.3..1.0`.
- Always `ctx.save()` / `ctx.restore()` — the manager chains multiple effects per frame.

### MediaPipe data shapes (if you need landmarks)

```
FaceLandmarker : 478 landmarks, FACE_LANDMARKS_TESSELATION (2556 edges)
PoseLandmarker : 33 landmarks,  POSE_CONNECTIONS (35 connections)

Landmark coords are normalized 0-1:
  pixelX = landmark.x * canvasW
  pixelY = landmark.y * canvasH

result.categoryMask.getAsUint8Array() returns a WASM memory VIEW.
Copy it BEFORE calling close():  new Uint8Array(view)
mask value 0   = person
mask value 255 = background
```

---

## Line-count constraint

The **350-line max** counts only non-blank, non-comment lines. If you are approaching the limit:
- Extract helper functions to `utils.js` as new named exports.
- Split into a separate `<name>-helpers.js` classic-script file if necessary.

Do not disable the lint rule. If the file exceeds 350 meaningful lines it will fail CI.
