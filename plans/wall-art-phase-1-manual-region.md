# Wall Art Feature - Phase 1: Manual Region Selection + Person Occlusion

## Overview

Add the ability for users to replace a portion of their background (e.g., a picture on the wall) with custom digital art. The replacement appears behind the user naturally through person segmentation.

## Goals

- User can define a rectangular/quadrilateral region in their video preview
- User can upload an image to display in that region
- The image renders BEHIND the user (person occludes the digital art)
- Works in real-time during Google Meet calls

## Technical Approach

### Person Segmentation

Use MediaPipe Selfie Segmentation via TensorFlow.js:
- Same model family that powers Google Meet's background blur
- Landscape model (144x256) optimized for video conferencing
- Runs in browser via WebGL (GPU-accelerated)
- Apache 2.0 license

```javascript
import * as bodySegmentation from '@tensorflow-models/body-segmentation';

const segmenter = await bodySegmentation.createSegmenter(
  bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
  {
    runtime: 'tfjs',
    modelType: 'landscape' // faster, same as Meet uses
  }
);
```

### Region Selection UI

In the popup/preview:
1. User clicks "Add Wall Art" button
2. Preview shows their current camera feed
3. User drags 4 corner handles to define a quadrilateral
4. User uploads or selects an image
5. Region + image saved to overlay storage

### Compositing Pipeline

Modify `VideoProcessor.render()` in `inject.js`:

```javascript
render(timestamp) {
  // 1. Draw original video frame
  ctx.drawImage(this.video, 0, 0, this.width, this.height);

  // 2. Wall Art rendering (NEW)
  if (this.wallArtOverlays.length > 0) {
    const segmentation = await this.segmenter.segmentPeople(this.video);
    const personMask = segmentation[0]?.mask;

    for (const wallArt of this.wallArtOverlays) {
      this.renderWallArt(ctx, wallArt, personMask);
    }
  }

  // 3. Existing overlay rendering
  const sorted = sortOverlaysByLayer(this.overlays);
  // ... existing overlay code
}
```

### Wall Art Rendering with Occlusion

```javascript
renderWallArt(ctx, wallArt, personMask) {
  const { region, image } = wallArt;

  // Create temp canvas for compositing
  const temp = document.createElement('canvas');
  temp.width = this.width;
  temp.height = this.height;
  const tempCtx = temp.getContext('2d');

  // Draw wall art image into the defined region
  // (with perspective transform if quadrilateral)
  this.drawImageInRegion(tempCtx, image, region);

  // Cut out person shape so they occlude the art
  if (personMask) {
    tempCtx.globalCompositeOperation = 'destination-out';
    tempCtx.drawImage(personMask.toCanvasImageSource(), 0, 0);
    tempCtx.globalCompositeOperation = 'source-over';
  }

  // Composite onto main canvas
  ctx.drawImage(temp, 0, 0);
}
```

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/wall-segmentation.js` | MediaPipe segmenter wrapper, caching, performance optimization |
| `lib/wall-art-renderer.js` | Wall art compositing logic |
| `popup/components/WallArtEditor.tsx` | Region selection UI component |

### Modified Files

| File | Changes |
|------|---------|
| `inject.js` | Initialize segmenter, call wall art rendering in render loop |
| `lib/overlay-utils.js` | Add `createWallArt()` factory, validation |
| `lib/canvas-renderer.js` | Add perspective transform helper |
| `popup/App.tsx` | Add Wall Art section to UI |
| `manifest.json` | May need to add TensorFlow.js to web_accessible_resources |

## Data Structure

```typescript
interface WallArtOverlay {
  id: string;
  type: 'wallArt';
  src: string; // image data URL or URL
  region: {
    // Four corners as percentages (0-100)
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
  opacity: number;
  active: boolean;
  createdAt: number;
}
```

## Performance Considerations

1. **Segmentation frequency**: Run segmentation every frame initially, optimize later if needed
2. **Mask caching**: Cache segmentation result, only re-run if significant frame change
3. **Resolution**: Segmenter uses 144x256 internally, upscales mask to canvas size
4. **Async handling**: Use `requestAnimationFrame` timing, don't block render loop

## Testing Plan

1. Unit tests for region calculation and perspective transforms
2. Integration test: Wall art renders in correct position
3. Integration test: Person correctly occludes wall art
4. Performance test: Measure FPS impact with segmentation enabled
5. Manual test: Various lighting conditions, multiple people in frame

## Success Criteria

- [ ] User can define a 4-corner region in the preview
- [ ] User can upload an image to fill that region
- [ ] Image renders with correct perspective in the region
- [ ] Person in foreground naturally occludes the wall art
- [ ] Feature maintains 24+ FPS on mid-tier hardware
- [ ] Works with existing overlay features (text banners, timers)

## Dependencies

```json
{
  "@tensorflow/tfjs": "^4.x",
  "@tensorflow-models/body-segmentation": "^1.x"
}
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Segmentation too slow | Use landscape model, reduce frequency, add quality toggle |
| Mask edges look rough | Apply slight blur/feather to mask edges |
| Bundle size increase | Lazy-load TensorFlow.js only when wall art is used |
| Browser compatibility | Test on Chrome, Edge; document requirements |
