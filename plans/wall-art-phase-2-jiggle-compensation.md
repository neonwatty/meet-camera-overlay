# Wall Art Feature - Phase 2: Jiggle Compensation

## Overview

Add camera stabilization so that the wall art region stays anchored correctly when the laptop/camera experiences minor movements (desk bumps, typing vibrations, lid adjustments).

## Goals

- Wall art region stays visually stable despite minor camera movement
- Compensation happens automatically without user intervention
- Re-calibration available if drift accumulates
- Minimal performance impact

## Problem Statement

When a user defines a wall region, they do so relative to their current camera view. If the laptop lid moves slightly or someone bumps the desk, the camera's view shifts but the defined region coordinates don't update. This causes the wall art to appear misaligned.

**Constraint that simplifies the problem:**
- Users are NOT walking around the room
- Camera is relatively stationary on a desk
- We only need to compensate for small shifts (5-20 pixels)
- Not doing full 3D tracking or perspective changes

## Technical Approach

### Option A: Frame Differencing (Simplest)

Detect global shift between consecutive frames:

```javascript
class JiggleCompensator {
  constructor() {
    this.previousFrame = null;
    this.offset = { x: 0, y: 0 };
  }

  update(currentFrame) {
    if (!this.previousFrame) {
      this.previousFrame = currentFrame;
      return this.offset;
    }

    // Compute global motion between frames
    const motion = this.computeGlobalMotion(this.previousFrame, currentFrame);

    // Accumulate offset
    this.offset.x += motion.x;
    this.offset.y += motion.y;

    this.previousFrame = currentFrame;
    return this.offset;
  }

  reset() {
    this.offset = { x: 0, y: 0 };
  }
}
```

**Pros:** Fast, simple, no external dependencies
**Cons:** Can drift over time, sensitive to scene changes

### Option B: Feature Point Tracking (Recommended)

Track stable background points and anchor the region to them:

```javascript
class FeatureTracker {
  constructor() {
    this.referencePoints = null;
    this.currentPoints = null;
  }

  initialize(frame, wallRegion) {
    // Find good features to track in the background
    // (corners, edges - preferably near the wall region)
    this.referencePoints = this.detectFeatures(frame, wallRegion);
  }

  update(frame) {
    if (!this.referencePoints) return null;

    // Track where reference points moved to
    this.currentPoints = this.trackPoints(frame, this.referencePoints);

    // Compute transform (translation + optional rotation)
    const transform = this.computeTransform(
      this.referencePoints,
      this.currentPoints
    );

    return transform;
  }
}
```

**Implementation options:**
1. **js-aruco / tracking.js** - Lightweight feature tracking
2. **OpenCV.js** - Full-featured but larger bundle
3. **Custom implementation** - Use canvas to detect high-contrast corners

### Option C: Homography Estimation (Most Robust)

Compute full 2D transform between frames:

```javascript
// Detect how the entire frame shifted/rotated
const H = computeHomography(previousFeatures, currentFeatures);

// Apply inverse to wall region to compensate
const compensatedRegion = applyInverseHomography(wallRegion, H);
```

**Pros:** Handles rotation and minor perspective changes
**Cons:** More complex, potentially overkill for jiggle

## Recommended Implementation

Use **Option B (Feature Point Tracking)** with these specifics:

### Feature Selection

```javascript
selectTrackingFeatures(frame, wallRegion) {
  // Look for features NEAR but OUTSIDE the wall region
  // (inside the region will be replaced, can't track it)

  const margin = 50; // pixels
  const searchArea = expandRegion(wallRegion, margin);

  // Find high-contrast corners using Harris corner detection
  const corners = harrisCornerDetection(frame, searchArea);

  // Filter to stable, non-person areas
  // (use person mask from Phase 1 to exclude person)
  const backgroundCorners = corners.filter(c => !isInPersonMask(c));

  // Select top N most distinct corners
  return selectBestCorners(backgroundCorners, 8);
}
```

### Tracking Loop

```javascript
// In VideoProcessor.render()
if (this.wallArtEnabled && this.featureTracker) {
  const transform = this.featureTracker.update(this.video);

  if (transform) {
    // Apply compensation to wall region before rendering
    const compensatedRegion = applyTransform(wallArt.region, transform);
    this.renderWallArt(ctx, { ...wallArt, region: compensatedRegion }, personMask);
  }
}
```

### Drift Correction

Over time, small errors accumulate. Provide escape hatches:

1. **Auto-reset on large motion**: If detected motion > threshold, assume intentional camera move
2. **Manual recalibrate button**: User clicks to re-anchor region to current view
3. **Periodic re-initialization**: Every N seconds, refresh reference features

```javascript
if (transform.magnitude > LARGE_MOTION_THRESHOLD) {
  // Camera was deliberately moved, reset tracking
  this.featureTracker.initialize(this.video, wallArt.region);
  this.showNotification("Camera moved - wall art re-anchored");
}
```

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/jiggle-compensator.js` | Feature tracking and transform computation |
| `lib/feature-detection.js` | Harris corner detection, feature matching |

### Modified Files

| File | Changes |
|------|---------|
| `inject.js` | Initialize tracker, apply compensation in render loop |
| `lib/wall-art-renderer.js` | Accept compensated region |
| `popup/components/WallArtEditor.tsx` | Add "Recalibrate" button |

## Performance Budget

| Operation | Target Time | Notes |
|-----------|-------------|-------|
| Feature detection | < 5ms | Only on init/recalibrate |
| Feature tracking | < 2ms per frame | Tracking 8-12 points |
| Transform computation | < 1ms | Simple matrix math |

Total overhead: ~3ms per frame (negligible at 30fps)

## Testing Plan

1. **Stability test**: Define region, tap desk repeatedly, verify art stays aligned
2. **Drift test**: Run for 5 minutes, measure accumulated drift
3. **Recovery test**: Move camera significantly, verify auto-reset works
4. **Performance test**: Measure FPS with tracking enabled vs disabled

## Success Criteria

- [ ] Wall art stays aligned during normal desk vibrations
- [ ] Typing on laptop keyboard doesn't cause visible jitter
- [ ] Deliberate camera movements trigger automatic re-anchor
- [ ] Manual recalibrate button works reliably
- [ ] < 5ms overhead per frame
- [ ] No visible drift over 10-minute call

## Dependencies

Evaluate these options:
- `tracking.js` - Lightweight (~30KB), feature tracking
- `jsfeat` - Computer vision library with optical flow
- Custom implementation using canvas pixel operations

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Poor tracking in low light | Require minimum contrast, show warning |
| Features occluded by person moving | Select features away from typical person position |
| Drift accumulates | Auto-reset threshold + manual recalibrate |
| Performance impact | Profile early, optimize hot paths |
