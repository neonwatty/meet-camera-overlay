# Sci-Fi Scanner Onboarding Sequence

## Overview

A phased scanner animation that plays when a first-time user picks a demo scene. The sequence uses the existing matrix-green shimmer effects to create a cinematic "system is analyzing you" moment, then transitions into revealing the demo art regions.

Part of a broader plan to expand shimmer effects into setup/onboarding and art manipulation UX. This is the first feature; future work includes body-aware guides, region scan-on-drop, and live warp wireframe.

## Sequence Flow

```
User opens app
  → Camera starts, render loop begins
  → Welcome modal appears (500ms delay)
  → User picks a demo scene
  → Welcome modal closes immediately
  → Segmenter detects person (may already have detected)
  ─── Scanner Sequence Begins ───
  → Phase 1 "SCAN" (3s): sweep line reveals contour + mask
  → Phase 2 "LOCK-ON" (2s): face mesh + skeleton snap on, pulse
  → Phase 3 "REVEAL" (2s): effects fade, art regions animate in
  ─── Scanner Sequence Ends ───
  → Normal app — user can drag/adjust art
```

- Scanner starts after welcome modal closes, not while it's up.
- If segmentation already detected the person before modal closes, cached data is used immediately.
- Demo art regions load into state instantly but are visually hidden until Phase 3.
- Skip button lets users jump to the app.

## Phase Details

### Phase 1 — SCAN (0s–3s)

A horizontal scan line sweeps top-to-bottom. As it passes each row:

- Person contour draws in progressively (left/right edges appear row by row)
- Green mask overlay fades in behind the scan line at low opacity
- Faint monospace corner text: `ANALYZING SUBJECT...`

Scan line: bright green, full-width, ~80px trailing glow. Only contour above the scan line is visible — literally "revealed" top to bottom.

### Phase 2 — LOCK-ON (3s–5s)

All at once:

- Face mesh tessellation appears with brightness pulse (flare 0 → full → shimmer)
- Pose skeleton bones draw in, each animating from center-out
- Full contour visible with orbiting scanner dots
- Corner text changes to `SUBJECT LOCKED`
- Subtle pulse ring radiates outward from person's center

Peak visual intensity. Everything glowing for ~2 seconds.

### Phase 3 — REVEAL (5s–7s)

- All scanner effects fade out (easeOutCubic)
- Art regions animate in: scale 0.8 → 1.0 with fade-in, staggered ~300ms apart
- Corner text: `SCENE READY` then fades
- By 7s, scanner gone, art visible, user in normal mode

## Architecture

### New file: `effects/scanner-sequence.js`

`ScannerSequence` class — a higher-level coordinator, not a BaseEffect subclass.

```
ScannerSequence
  ├── owns: phase state machine (IDLE → WAITING → SCAN → LOCK_ON → REVEAL → DONE)
  ├── uses: MeshShimmerEffect (triggers in LOCK_ON)
  ├── uses: EdgeWireframeFlashEffect (triggers in LOCK_ON)
  ├── draws: scan line + progressive contour reveal (SCAN)
  ├── draws: pulse ring + text readout (LOCK_ON)
  ├── draws: region fade-in animations (REVEAL)
  └── emits: onComplete callback when finished
```

### Integration points in `multi-region.js`

- `handleDemoSelection()`: After closing welcome modal, starts `ScannerSequence` instead of immediately showing regions
- `renderLoop()`: Calls `scannerSequence.update()` alongside `transitionEffects.update()`
- Region rendering: During SCAN/LOCK_ON, skip drawing art regions. During REVEAL, multiply each region's draw with entrance progress (scale + opacity)

### Changes to existing code

- `TransitionEffectManager.triggerFirstSegmentation()`: Scanner sequence calls this internally during LOCK_ON instead of it firing automatically on first detection
- Region draw loop: Wrap existing draw with opacity/scale multiplier from scanner sequence
- `handleDemoSelection()`: Add scanner sequence trigger

### Unchanged

- All existing effects files
- Returning users (scanner only fires for first-time welcome flow)
- Debug panel

### Corner text

Pure canvas `ctx.fillText()` with monospace font. No DOM elements.

### Skip button

Small DOM element over canvas, shown during sequence, removed on complete. Click calls `scannerSequence.skip()` → jumps to REVEAL at full progress. Minimum 44x44px touch target.

## Edge Cases

- **Returning users**: `wallart_welcome_shown` set → no scanner, straight to app
- **Slow model loading**: Scanner enters WAITING state until first detection, then begins Phase 1
- **Face/pose not loaded**: LOCK_ON shows contour + pulse + dots only. If models arrive mid-phase, they snap on
- **No person in frame**: Sequence pauses at current phase, resumes when detection returns
- **Mobile**: Skip button ≥ 44x44px. Low frame rate → simplified scan line (no trailing glow)
- **Duration**: ~7s total. Skip button available throughout.

## Future Features (Not In Scope)

- Body-aware guides: shimmer contour lights up when dragging art near your body
- Region scan-on-drop: edge-detect sweep on region after drag/warp finishes
- Live warp wireframe: matrix-green grid on region during perspective corner dragging
