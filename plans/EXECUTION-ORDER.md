# Wall Art Feature - Execution Order

> This document defines the implementation sequence for the Wall Art feature. Each phase builds on the previous one.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION SEQUENCE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PHASE 0: Dev Environment                                                │
│  ════════════════════════                                                │
│  └─ Testing harness with demo videos                                     │
│  └─ Enables rapid iteration for ALL subsequent phases                    │
│                                                                          │
│          │                                                               │
│          ▼                                                               │
│                                                                          │
│  PHASE 1: Core Feature (MVP)                                             │
│  ═══════════════════════════                                             │
│  ├─ 1A: Segmentation Foundation                                          │
│  │      └─ MediaPipe integration, person masking                         │
│  │                                                                       │
│  ├─ 1B: Region Selection + Wall Paint                                    │
│  │      └─ UI for drawing regions, color sampling, paint rendering       │
│  │                                                                       │
│  ├─ 1C: Wall Art Rendering                                               │
│  │      └─ Image/GIF/video compositing with occlusion                    │
│  │                                                                       │
│  └─ 1D: Setup Wizard + Optimization                                      │
│         └─ Reference frame capture, pre-computation, caching             │
│                                                                          │
│          │                                                               │
│          ▼                                                               │
│                                                                          │
│  PHASE 2: Stability & Polish                                             │
│  ═══════════════════════════                                             │
│  ├─ 2A: Jiggle Compensation                                              │
│  │      └─ Feature tracking, drift correction                            │
│  │                                                                       │
│  └─ 2B: Lighting Compensation                                            │
│         └─ Brightness detection, auto-adjustment                         │
│                                                                          │
│          │                                                               │
│          ▼                                                               │
│                                                                          │
│  PHASE 3: Auto Detection (Future)                                        │
│  ════════════════════════════════                                        │
│  └─ Depth estimation, automatic wall region suggestions                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Dev Environment

**Status:** 📋 Planned
**Plan File:** `dev-environment.md`
**Estimated Effort:** 2-3 days
**Prerequisite:** None

### What This Delivers
- Standalone HTML page for testing without Google Meet
- Demo video playback through actual VideoProcessor
- Mock popup panel with real React components
- Debug tools (mask overlay, FPS, coordinates)
- Visual regression testing

### Why First
Every subsequent phase requires iteration and testing. Without the dev environment, each test cycle requires:
1. Rebuild extension
2. Reload in Chrome
3. Open Google Meet
4. Join/create a meeting
5. Position yourself
6. Test the feature
7. Repeat

With the dev environment: refresh page, see changes instantly.

### Definition of Done
- [ ] `npm run dev:wall-art` launches dev environment
- [ ] Demo video plays through VideoProcessor
- [ ] Can toggle segmentation mask overlay
- [ ] Can see FPS and timing metrics
- [ ] Mock popup renders and functions

### Blocked By
Nothing - can start immediately.

---

## Phase 1A: Segmentation Foundation

**Status:** 📋 Planned
**Plan File:** `wall-art-comprehensive-plan.md` (Section 1.1)
**Estimated Effort:** 3-4 days
**Prerequisite:** Phase 0

### What This Delivers
- TensorFlow.js + MediaPipe body-segmentation integrated
- `WallArtSegmenter` class with lazy initialization
- Multi-person mask generation
- Mask caching to reduce redundant computation
- Integration into VideoProcessor render loop

### Why This Order
Segmentation is the foundation—wall art rendering is meaningless without the person mask for occlusion. This must work before any UI or rendering code.

### Definition of Done
- [ ] MediaPipe model loads successfully
- [ ] Person mask generated from video frame
- [ ] Multiple people detected and masked
- [ ] Mask visible in dev environment debug overlay
- [ ] Performance acceptable (target: <20ms inference)

### Blocked By
- Phase 0 (need dev environment to iterate)

---

## Phase 1B: Region Selection + Wall Paint

**Status:** 📋 Planned
**Plan File:** `wall-art-comprehensive-plan.md` (Sections 1.2, 1.3)
**Estimated Effort:** 4-5 days
**Prerequisite:** Phase 1A

### What This Delivers
- `WallArtEditor` component with 4-corner draggable handles
- Edge snapping via Canny edge detection
- `ColorSampler` with eyedropper (10x10 pixel average)
- AI color detection (dominant color in region)
- `WallPaintEditor` with color picker and opacity slider
- `WallPaintRenderer` for solid color fill with perspective
- Paint layer renders before art (compositing order)

### Why This Order
Region selection is the user's entry point. Wall Paint comes with it because:
1. Same region definition is used
2. Paint is simpler than art rendering (good stepping stone)
3. Tests the occlusion pipeline with solid colors first

### Definition of Done
- [ ] Can draw 4-corner region on video preview
- [ ] Edge snapping helps align to picture frames
- [ ] Eyedropper samples wall color correctly
- [ ] Paint fills region with person correctly occluded
- [ ] Opacity slider works
- [ ] Region persists to storage

### Blocked By
- Phase 1A (need segmentation mask for occlusion)

---

## Phase 1C: Wall Art Rendering

**Status:** 📋 Planned
**Plan File:** `wall-art-comprehensive-plan.md` (Sections 1.4, 1.5, 1.6)
**Estimated Effort:** 4-5 days
**Prerequisite:** Phase 1B

### What This Delivers
- `WallArtRenderer` with perspective transform
- Static image support (PNG, JPG, WebP)
- Animated GIF support (reuse existing decoder)
- Video loop support (MP4, WebM)
- User-controlled aspect ratio (stretch/fit/crop)
- Virtual background detection and graceful disable
- IndexedDB storage for uploaded images
- Curated gallery of 20-30 default images

### Why This Order
With regions and paint working, art rendering builds directly on top:
1. Same region coordinates
2. Same occlusion pipeline
3. Just adds image/video source and aspect ratio handling

### Definition of Done
- [ ] Static image renders in region with occlusion
- [ ] GIF animates correctly
- [ ] Video loops correctly
- [ ] Aspect ratio modes work as expected
- [ ] Virtual background detection disables feature gracefully
- [ ] Gallery UI allows browsing and selection
- [ ] Upload works, images persist in IndexedDB

### Blocked By
- Phase 1B (need region selection and compositing pipeline)

---

## Phase 1D: Setup Wizard + Optimization

**Status:** 📋 Planned
**Plan File:** `wall-art-comprehensive-plan.md` (Setup Phase sections)
**Estimated Effort:** 5-6 days
**Prerequisite:** Phase 1C

### What This Delivers
- `SetupWizard` with step-by-step flow
- "Step away" countdown for reference frame capture
- `ReferenceFrameCapture` (5 sec video → median frame)
- Pre-compute wall colors from reference
- `SetupBenchmark` with silent performance test
- Pre-render art cache for fast blitting
- `MaskInterpolator` for frame-skip optimization
- Performance presets (Quality/Balanced/Performance)
- Persist setup data to IndexedDB
- Manual "Recalibrate" button

### Why This Order
Optimization comes after the feature works:
1. First make it correct (Phases 1A-1C)
2. Then make it fast (Phase 1D)
3. Can measure actual performance to know what to optimize

### Definition of Done
- [ ] Setup wizard guides user through all steps
- [ ] Reference frame captured when user steps away
- [ ] Wall colors pre-computed and instant
- [ ] Benchmark warns if device is underpowered
- [ ] Art cache improves rendering performance
- [ ] Frame-skip interpolation works smoothly
- [ ] Presets measurably affect FPS
- [ ] Setup data persists across sessions
- [ ] Recalibrate works correctly

### Blocked By
- Phase 1C (need complete rendering pipeline to optimize)

---

## Phase 2A: Jiggle Compensation

**Status:** 📋 Planned
**Plan File:** `wall-art-phase-2-jiggle-compensation.md`
**Estimated Effort:** 4-5 days
**Prerequisite:** Phase 1D

### What This Delivers
- Harris corner detection for feature points
- `JiggleCompensator` with feature tracking
- Frame-to-frame transform computation
- Compensation applied to wall regions
- Auto-reset on large camera motion
- Manual recalibrate button enhancement

### Why This Order
Jiggle compensation is a polish feature—the core feature must work first. Also:
1. Needs setup wizard's reference frame for initial feature points
2. Builds on the optimization infrastructure from Phase 1D

### Definition of Done
- [ ] Feature points detected in background
- [ ] Small camera movements compensated (desk bumps, typing)
- [ ] Large movements trigger auto-reset with notification
- [ ] < 5ms overhead per frame
- [ ] No visible drift over 10-minute session

### Blocked By
- Phase 1D (needs reference frame and setup infrastructure)

---

## Phase 2B: Lighting Compensation

**Status:** 📋 Planned
**Plan File:** `wall-art-comprehensive-plan.md` (Lighting Compensation sections)
**Estimated Effort:** 3-4 days
**Prerequisite:** Phase 2A

### What This Delivers
- `LightingDetector` piggybacks on segmentation
- Brightness/color temp/contrast monitoring
- 20% threshold detection
- 7.5 second cooldown between adjustments
- Auto re-sample wall paint color
- Auto-adjust art brightness
- Increase edge feathering when quality degrades
- Silent adjustment (no notifications)
- Setup wizard preference toggle

### Why This Order
Lighting compensation builds on:
1. Segmentation loop (piggybacks on Nth-frame processing)
2. Wall paint color sampling (reuses ColorSampler)
3. Setup wizard (adds preference toggle)

### Definition of Done
- [ ] Lighting changes detected at 20% threshold
- [ ] Wall paint color auto-updates
- [ ] Art brightness adjusts to match room
- [ ] Cooldown prevents oscillation
- [ ] Adjustments are silent/seamless
- [ ] User can disable in setup wizard

### Blocked By
- Phase 2A (shares infrastructure, testing sequence)

---

## Phase 3: Auto Wall Detection (Future)

**Status:** 🔮 Future
**Plan File:** `wall-art-phase-3-auto-wall-detection.md`
**Estimated Effort:** 5-7 days
**Prerequisite:** Phase 2B

### What This Delivers
- MiDaS depth estimation model (TensorFlow.js)
- Flat region detection algorithm
- Region ranking by "wall-likeness"
- UI showing detected regions with highlighting
- User click to select or adjust
- "Draw manually" fallback option

### Why Last
Auto-detection is nice-to-have, not essential:
1. Manual region selection works fine
2. Large model (~20MB) adds complexity
3. Detection quality varies by room
4. Can ship MVP without this

### Definition of Done
- [ ] Correctly identifies primary wall in 80%+ of setups
- [ ] Detection completes in < 3 seconds
- [ ] Clear fallback when detection doesn't work
- [ ] User can adjust auto-detected region

### Blocked By
- Phase 2B (all core features must be stable first)

---

## Summary Table

| Phase | Name | Effort | Prerequisite | Delivers |
|-------|------|--------|--------------|----------|
| **0** | Dev Environment | 2-3 days | None | Testing harness |
| **1A** | Segmentation | 3-4 days | Phase 0 | Person masking |
| **1B** | Region + Paint | 4-5 days | Phase 1A | UI, color sampling |
| **1C** | Art Rendering | 4-5 days | Phase 1B | Images, GIFs, video |
| **1D** | Setup + Optimize | 5-6 days | Phase 1C | Performance, caching |
| **2A** | Jiggle Compensation | 4-5 days | Phase 1D | Camera stabilization |
| **2B** | Lighting Compensation | 3-4 days | Phase 2A | Auto brightness adjust |
| **3** | Auto Detection | 5-7 days | Phase 2B | AI wall suggestions |

**Total estimated effort:** 26-39 days (5-8 weeks)

---

## Milestone Checkpoints

### Milestone 1: "It Works" (End of Phase 1C)
- User can add wall art that renders with person occlusion
- Basic functionality complete, may have performance issues
- **Testable with real users**

### Milestone 2: "It's Fast" (End of Phase 1D)
- Setup wizard optimizes for user's environment
- Performance acceptable for typical hardware
- **Ready for beta release**

### Milestone 3: "It's Polished" (End of Phase 2B)
- Handles camera movement and lighting changes
- Professional, stable experience
- **Ready for public launch**

### Milestone 4: "It's Smart" (End of Phase 3)
- Auto-detects walls for easier setup
- Premium feature differentiator
- **Post-launch enhancement**

---

## Updating This Document

When priorities change or new requirements emerge:
1. Update the relevant phase section
2. Adjust effort estimates if needed
3. Update the dependency graph if phases are reordered
4. Keep the summary table in sync
