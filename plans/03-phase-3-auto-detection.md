# Wall Art Feature - Phase 3: Automatic Wall Detection

## Overview

Automatically detect flat surfaces (walls) in the user's background and suggest regions for wall art placement. Falls back to manual selection (Phase 1) if auto-detection doesn't work well.

## Goals

- Automatically identify wall/flat surface regions in the background
- Suggest 1-3 candidate regions to the user
- User confirms/adjusts the suggested region
- Provide sensible default art recommendations
- Graceful fallback to manual mode

## User Flow

```
1. User clicks "Add Wall Art"
           ↓
2. System analyzes background (2-3 seconds)
           ↓
3. Show detected regions with highlighting
   "We found these wall areas. Click one to add art."
           ↓
4. User clicks a region (or "Draw my own")
           ↓
5. Show art gallery / upload option
           ↓
6. Wall art applied with occlusion (Phase 1)
```

## Technical Approach

### Depth Estimation

Use a monocular depth estimation model to identify flat surfaces:

**Model Options:**

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| MiDaS Small | ~20MB | Fast | Good |
| MiDaS Hybrid | ~120MB | Medium | Better |
| DPT-Hybrid | ~350MB | Slow | Best |

Recommend **MiDaS Small** for real-time browser use.

```javascript
import * as tf from '@tensorflow/tfjs';

class WallDetector {
  async initialize() {
    // Load MiDaS model (converted to TensorFlow.js format)
    this.model = await tf.loadGraphModel('models/midas-small/model.json');
  }

  async detectWalls(videoFrame) {
    // 1. Run depth estimation
    const depthMap = await this.estimateDepth(videoFrame);

    // 2. Find flat regions (consistent depth values)
    const flatRegions = this.findFlatRegions(depthMap);

    // 3. Filter to background (exclude foreground/person)
    const backgroundRegions = this.filterToBackground(flatRegions, depthMap);

    // 4. Rank by size and "wall-likeness"
    const rankedRegions = this.rankRegions(backgroundRegions);

    return rankedRegions.slice(0, 3); // Top 3 candidates
  }
}
```

### Flat Region Detection

```javascript
findFlatRegions(depthMap) {
  const regions = [];

  // Use flood-fill or connected components to find
  // areas with similar depth values

  for (let y = 0; y < height; y += gridStep) {
    for (let x = 0; x < width; x += gridStep) {
      const depth = depthMap[y][x];

      // Check if this starts a flat region
      if (this.isFlat(depthMap, x, y, depth)) {
        const region = this.floodFill(depthMap, x, y, depth, tolerance);
        if (region.area > MIN_REGION_SIZE) {
          regions.push(region);
        }
      }
    }
  }

  return this.mergeOverlapping(regions);
}

isFlat(depthMap, x, y, centerDepth) {
  // Check variance in local neighborhood
  const neighborhood = this.getNeighborhood(depthMap, x, y, 20);
  const variance = this.calculateVariance(neighborhood);
  return variance < FLATNESS_THRESHOLD;
}
```

### Wall vs Other Surfaces

Not all flat surfaces are walls. Use heuristics:

```javascript
rankRegions(regions) {
  return regions
    .map(region => ({
      ...region,
      score: this.calculateWallScore(region)
    }))
    .sort((a, b) => b.score - a.score);
}

calculateWallScore(region) {
  let score = 0;

  // Walls are typically:
  // - Vertical (top edge roughly same depth as bottom edge)
  score += this.isVertical(region) ? 30 : 0;

  // - In the background (further from camera)
  score += this.isBackground(region) ? 20 : 0;

  // - Larger (small regions might be objects)
  score += Math.min(region.area / 10000, 20);

  // - Rectangular-ish
  score += this.isRectangular(region) ? 15 : 0;

  // - Not the floor (not at bottom of frame at steep angle)
  score += this.isNotFloor(region) ? 15 : 0;

  return score;
}
```

### Integration with Person Segmentation

Reuse the segmentation from Phase 1:

```javascript
async detectWalls(videoFrame, personMask) {
  const depthMap = await this.estimateDepth(videoFrame);

  // Zero out person area in depth map
  // (we don't want to detect person as a "flat surface")
  const backgroundDepth = this.maskOut(depthMap, personMask);

  return this.findFlatRegions(backgroundDepth);
}
```

## UI Design

### Detection Phase

```
┌─────────────────────────────────────────┐
│                                         │
│     [Video Preview]                     │
│                                         │
│     ┌─────────┐                         │
│     │ Region 1│  ← Highlighted overlay  │
│     └─────────┘                         │
│                  ┌──────┐               │
│                  │Reg 2 │               │
│                  └──────┘               │
│                                         │
├─────────────────────────────────────────┤
│  We found 2 wall areas.                 │
│  [Click a region] or [Draw manually]    │
└─────────────────────────────────────────┘
```

### Default Art Gallery

Offer curated options:

```javascript
const DEFAULT_WALL_ART = [
  { category: 'Abstract', items: [...] },
  { category: 'Nature', items: [...] },
  { category: 'Patterns', items: [...] },
  { category: 'Solid Colors', items: [...] },
  { category: 'Upload Your Own', items: null }
];
```

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/wall-detector.js` | Depth estimation + flat region detection |
| `lib/depth-estimation.js` | MiDaS model wrapper |
| `models/midas-small/*` | TensorFlow.js model files |
| `popup/components/WallDetectionUI.tsx` | Detection results UI |
| `popup/components/ArtGallery.tsx` | Default art selection |
| `assets/default-art/*` | Bundled default art options |

### Modified Files

| File | Changes |
|------|---------|
| `popup/components/WallArtEditor.tsx` | Add auto-detect flow |
| `manifest.json` | Add model files to web_accessible_resources |

## Performance Considerations

### Depth Estimation Timing

- Don't run every frame - only during setup
- Run once when user clicks "Add Wall Art"
- Show loading indicator during analysis

```javascript
async onAddWallArtClick() {
  this.showLoading("Analyzing your background...");

  const frame = await this.captureFrame();
  const personMask = await this.segmenter.segment(frame);
  const wallRegions = await this.wallDetector.detectWalls(frame, personMask);

  this.hideLoading();
  this.showDetectedRegions(wallRegions);
}
```

### Model Loading Strategy

```javascript
// Lazy load - don't load model until user wants wall art
let wallDetector = null;

async function getWallDetector() {
  if (!wallDetector) {
    wallDetector = new WallDetector();
    await wallDetector.initialize(); // Load model
  }
  return wallDetector;
}
```

### Bundle Size Management

| Asset | Size | Loading Strategy |
|-------|------|------------------|
| MiDaS Small model | ~20MB | Lazy load on demand |
| Default art | ~2MB | Lazy load gallery |
| Detection code | ~15KB | Include in bundle |

## Fallback Behavior

```javascript
async detectWallsWithFallback(frame) {
  try {
    const regions = await this.wallDetector.detectWalls(frame);

    if (regions.length === 0) {
      return { success: false, reason: 'no_walls_found' };
    }

    return { success: true, regions };

  } catch (error) {
    console.warn('Wall detection failed:', error);
    return { success: false, reason: 'detection_error' };
  }
}

// In UI
if (!result.success) {
  showMessage("We couldn't detect walls automatically. You can draw a region manually.");
  openManualEditor();
}
```

## Testing Plan

1. **Accuracy test**: Test on 20+ different room setups, measure detection success rate
2. **Edge cases**: Plain walls, textured walls, multiple walls, no visible walls
3. **Performance test**: Measure detection time on various devices
4. **Fallback test**: Verify graceful degradation when detection fails
5. **User test**: Have users try the flow, gather feedback

## Success Criteria

- [ ] Correctly identifies primary wall in 80%+ of typical home office setups
- [ ] Detection completes in < 3 seconds on mid-tier hardware
- [ ] Clear fallback path when detection doesn't work
- [ ] User can adjust auto-detected region before confirming
- [ ] Default art gallery provides appealing options
- [ ] Model lazy-loads without blocking initial extension load

## Dependencies

```json
{
  "@tensorflow/tfjs": "^4.x",
  "midas-tfjs": "custom build or self-hosted model"
}
```

Note: MiDaS model will need to be converted to TensorFlow.js format using `tensorflowjs_converter`.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Model too large | Use MiDaS Small, lazy load, consider CDN hosting |
| Poor detection in cluttered rooms | Set expectations in UI, easy manual fallback |
| Depth estimation inaccurate | Combine with edge detection for region boundaries |
| User confused by options | Clear UI with "Just let me draw" escape hatch |
| Different lighting conditions | Test extensively, document limitations |

## Future Enhancements (Beyond Phase 3)

- **Learn from corrections**: If user adjusts region, use that data to improve future detection
- **Object detection**: Identify specific objects (picture frames, posters) to replace
- **Perspective matching**: Match perspective of replacement art to detected wall angle
- **Lighting matching**: Adjust art brightness/contrast to match room lighting
