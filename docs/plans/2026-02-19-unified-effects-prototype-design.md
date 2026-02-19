# Unified Effects Prototype Design

## Overview

A standalone 4th prototype (`prototype/unified-effects/`) that combines the best of the existing three prototypes into an effect showcase. Focuses on 7 new visual effects built on the multi-region-art rendering pipeline, with camera stabilization via the jiggle compensator and all three MediaPipe models (segmenter, face landmarker, pose landmarker).

**Approach:** Modular Effect Showcase (Approach A) — lean main app, pre-configured regions, each effect is an independent file extending BaseEffect.

## File Structure

```
prototype/unified-effects/
├── index.html                    # Single-page app shell
├── main.js                       # App controller (~600-800 lines, ES module)
├── render-pipeline.js            # Rendering pipeline extracted from multi-region-art (~300 lines)
├── styles.css                    # UI styles
├── vite.config.js                # Vite dev server config
├── effects/
│   ├── base-effect.js            # Copied from multi-region-art (unchanged)
│   ├── utils.js                  # Copied from multi-region-art (unchanged)
│   ├── scanner-sequence.js       # Copied from multi-region-art (unchanged)
│   ├── transition-manager.js     # Extended — supports multiple concurrent effects
│   ├── mesh-shimmer.js           # Copied from multi-region-art (unchanged)
│   ├── edge-wireframe.js         # Copied from multi-region-art (unchanged)
│   ├── ambient-aura.js           # NEW
│   ├── depth-parallax.js         # NEW
│   ├── region-reactivity.js      # NEW
│   ├── contour-particles.js      # NEW
│   ├── portal-dissolve.js        # NEW
│   ├── wireframe-morph.js        # NEW
│   └── environmental-glow.js     # NEW
```

## Effects

### Existing (copied from multi-region-art)

1. **Mesh Shimmer** (15s) — Face mesh wireframe + pose skeleton + person mask overlay + scan lines + contour outline. Matrix-green aesthetic.
2. **Edge Wireframe Flash** (8s) — Sobel edge detection overlay, green-tinted, screen blend.
3. **Scanner Sequence** — Onboarding state machine: IDLE → WAITING → SCAN → LOCK_ON → REVEAL → DONE. Region entrance animations.

### New Effects

#### 1. Ambient Aura (12s)
Colored glow radiates outward from person contour. Glow color sampled from nearest region's art dominant color via `detectDominantColor()` from `lib/color-sampler.js`.

- Radial gradient circles (40-80px radius) at contour points, expanding outward
- Color: dominant color of nearest region art, HSL saturation boosted
- Blend: `screen`, alpha oscillates 0.3-0.6 (sine breathing)
- Fade-in 2s, sustain, fade-out 3s

#### 2. Depth Parallax (15s)
Wall art shifts as you move your head, creating window-into-deeper-space illusion.

- Track nose tip (face landmark 1) relative to canvas center
- Compute pan offset: `deltaX = (nose.x - centerX) * parallaxStrength`
- Each region gets offset proportional to distance from center (farther = more shift)
- Implemented by modifying source rect in triangle mesh — no extra draw calls
- Strength ramps in 1s, sustains, ramps out 2s

#### 3. Region Reactivity (20s)
Art responds to gestures.

- **Smile:** Mouth corner distance (landmarks 61, 291) vs face width → warm hue-shift overlay on regions
- **Hand raise:** Wrist (pose 15, 16) above shoulder (11, 12) → pulsing highlight border on nearest region
- **Head tilt:** Eye landmark angle (33, 263) → small rotation on region rendering (±5 deg max)
- All values smoothed with EMA (0.3 factor)

#### 4. Contour Particles (10s)
Luminous particles emit from person contour edge and drift outward.

- Pool: 100-200 particles
- Spawn: 2-4 per frame at random contour points
- Physics: outward velocity from contour normal + randomness, gentle gravity, lifetime 1.5-3s
- Render: 2-4px circles with radial gradient glow, alpha fades with lifetime
- Color: white/gold default or sampled from nearest region
- Blend: `lighter` (additive)

#### 5. Portal Dissolve (12s)
One region becomes a portal — person mask inverts for that region only, making you appear to step into the art.

- Select largest/center-most region as portal target
- Over first 3s: gradually blend from normal occlusion to portal mode (skip mask cutout for portal region)
- Dissolve edge: glowing line where contour intersects region boundary
- Reverse over last 3s

#### 6. Wireframe Morph (16s)
Face/pose mesh transitions between 4 visual styles (4s each).

- **Matrix:** Green (#00ff41), 1.2px lines, scan-line sweep
- **Blueprint:** Blue (#4488ff), 0.8px lines, small squares at joints
- **Neon:** Pink (#ff44aa), 2px lines, 8px shadowBlur glow, round halos
- **Circuit:** Amber (#ffaa00), 1px lines, manhattan-routed connections, small circles
- Cross-fade between styles via HSL interpolation over 2s transitions

#### 7. Environmental Glow (15s)
Simulated light spill from wall art onto person.

- Per region: compute center + dominant color
- Per contour pixel: distance/angle to each region center
- Directional color tint: intensity proportional to 1/distance² (inverse-square falloff)
- Rendered as semi-transparent overlay clipped to person mask
- Intensity scaled by `artBrightnessMultiplier` from `LightingDetector`
- Blend: `screen`

## Render Pipeline

Per-frame composition order:

1. **Frame setup** — timestamp, jiggle compensator process, apply stabilization offsets
2. **Draw webcam** — `ctx.drawImage(video, 0, 0)`
3. **Segmentation** — MediaPipe segmenter, copy mask (WASM memory!), cache contour
4. **Landmarks** — face + pose detection, smooth with EMA, cache on manager
5. **Render regions** — per region in z-order: get art source, compute stabilized corners, triangle mesh warp, mask cutout, composite. Portal effect overrides mask for its target.
6. **Effects layer** — `transitionManager.update()` calls each active effect's `render()`
7. **Scanner sequence** — if onboarding active
8. **UI overlays** — region outlines, debug info if toggled

### render-pipeline.js exports

Pure functions extracted from multi-region-art:
- `bilinearPoint(tl, tr, bl, br, u, v)` — grid interpolation
- `drawTexturedTriangle(ctx, source, sx0..sy2, p0, p1, p2)` — affine-mapped triangle
- `drawPerspectiveImage(ctx, source, corners, transform, canvasW, canvasH)` — 8x8 mesh warp
- `applyPersonMask(ctx, mask, maskW, maskH)` — mask cutout with scaling

### main.js responsibilities (~600-800 lines)

- Webcam init
- MediaPipe model loading (segmenter, face landmarker, pose landmarker)
- Pre-configured region definitions (2-3 default regions with bundled art)
- Jiggle compensator lifecycle
- Render loop orchestration
- Sidebar UI event handlers
- Color sampling on region art (once at setup)

## UI Layout

70/30 split — canvas left, sidebar right.

### Sidebar sections

**Effects** (collapsible groups):
- Existing: Mesh Shimmer, Edge Wireframe, Scanner Sequence
- New: Ambient Aura, Depth Parallax, Region Reactivity, Contour Particles, Portal Dissolve, Wireframe Morph, Environmental Glow
- Each button: click to trigger, shows progress bar while active

**Settings:**
- Person Occlusion toggle (checkbox)
- Stabilization toggle (checkbox)
- Region preset selector: 2, 3, or 4 pre-configured regions
- Reset All button

**Status:**
- Segmentation Ready indicator (dot + text)
- Face Mesh Ready indicator
- Pose Ready indicator
- FPS counter

**Bottom bar:**
- Play All Sequentially — triggers each effect with 2s gap
- Trigger Random — random effect
- Active indicator — shows running effect name(s)

### Styling
Dark theme (#111 bg, #e85d04 accent, Space Grotesk font). Consistent with multi-region-art.

## Shared Library Usage

| Library | Used By | Purpose |
|---------|---------|---------|
| `lib/color-sampler.js` | Ambient Aura, Environmental Glow | `detectDominantColor()`, `adjustBrightness()` |
| `lib/lighting-detector.js` | Environmental Glow | `artBrightnessMultiplier` for adaptive intensity |
| `lib/jiggle-compensator.js` | main.js render loop | Camera stabilization for all regions |
| `lib/feature-tracking.js` | JiggleCompensator (internal) | Harris corners + Lucas-Kanade optical flow |
| `lib/segmentation-mask.js` | main.js render loop | `convertResultToImageData()`, `applyMaskCutout()` |
| `lib/wall-segmentation.js` | main.js init | `WallArtSegmenter` class for MediaPipe |

## Pre-configured Regions

Default layout (3 regions):
- **Left:** 10%-40% horizontal, 15%-75% vertical (portrait orientation)
- **Center:** 42%-72% horizontal, 20%-65% vertical (landscape orientation)
- **Right:** 74%-95% horizontal, 25%-70% vertical (portrait orientation)

Each assigned a different bundled gallery art (abstract/nature/pattern mix). User can switch between 2, 3, or 4 region presets via sidebar toggle.

## TransitionEffectManager Extensions

The manager is extended to support:
- **Multiple concurrent effects** — effects array, each ticked independently
- **Shared landmark cache** — `getCachedFaceLandmarks()`, `getCachedPoseLandmarks()` so effects don't re-run detection
- **Region data access** — `getRegions()`, `getRegionColors()` for effects that interact with regions
- **Portal hook** — `setPortalRegion(regionId)` / `getPortalRegion()` for portal-dissolve to communicate with render loop
