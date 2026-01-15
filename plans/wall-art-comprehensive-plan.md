# Feature: Wall Art - Partial Background Replacement

> Replace specific areas of your background (pictures, posters, blank walls) with custom digital art while maintaining natural person occlusion.

## Summary

Wall Art is a differentiating feature that allows Google Meet users to replace portions of their background with custom images, GIFs, or video loops—without replacing the entire background. Unlike full virtual backgrounds, users keep their real environment while enhancing specific areas (e.g., swapping a picture frame for company branding, or covering a messy bookshelf with abstract art).

The feature includes **Wall Paint** - a prep layer that lets users cover existing wall elements (old picture frames, messy shelves) with a solid color before placing art on top. Wall Paint can also be used standalone to simply hide unwanted areas with color-matched fill.

The feature uses MediaPipe Selfie Segmentation to ensure people in the frame naturally occlude the wall art. This creates a seamless, realistic effect that competitors don't offer. No other Google Meet extension provides partial/selective background replacement.

The feature will be fully free to drive adoption and will target remote workers as the primary audience, with secondary messaging for teachers, streamers, and churches.

## Requirements

### Must Have (Phase 1 MVP)

**Region & Selection:**
- [ ] Manual region selection with 4-corner quadrilateral handles
- [ ] Edge snapping to help align with picture frames and wall features
- [ ] Multiple wall art regions active simultaneously

**Wall Paint (Prep Layer):**
- [ ] Optional solid color fill before placing art (Region → Paint → Art flow)
- [ ] Standalone paint mode (cover areas without placing art on top)
- [ ] Color selection via eyedropper (averages 10x10 pixel area for stability)
- [ ] Color selection via color picker (any color)
- [ ] AI-suggested wall color (detect dominant wall color, user confirms)
- [ ] Adjustable paint opacity (0-100% slider)
- [ ] Solid color fill only (no texture replication)

**Wall Art Content:**
- [ ] Static image support (PNG, JPG, WebP)
- [ ] Animated GIF support (leverage existing GIF decoder)
- [ ] Video loop support (MP4, WebM)
- [ ] User-controlled aspect ratio: stretch, fit (letterbox), or crop
- [ ] Curated gallery of 20-30 default images (abstract, nature, patterns, solid colors)

**Person Occlusion:**
- [ ] Person segmentation for natural occlusion (MediaPipe Selfie Segmentation)
- [ ] Support for ALL people in frame (multi-person occlusion)

**Platform Integration:**
- [ ] Detect Google Meet virtual background active → disable wall art with explanation
- [ ] IndexedDB storage for uploaded images (bypass Chrome storage limits)
- [ ] Integration with existing overlay system (wall art + text banners + timers work together)

**UX & Feedback:**
- [ ] Guided tutorial on first use
- [ ] Warning badge when segmentation quality is low
- [ ] Warning when FPS drops below threshold (user decides whether to continue)

### Should Have (Phase 2)

- [ ] Jiggle compensation via feature point tracking
- [ ] Named presets ("Home Office", "Kitchen") that persist across sessions
- [ ] Auto-reset on large camera motion with notification
- [ ] Manual recalibrate button

### Could Have (Phase 3)

- [ ] Automatic wall detection via depth estimation (MiDaS)
- [ ] Suggest 1-3 candidate regions to user
- [ ] "Just let me draw" fallback when auto-detect fails

### Out of Scope (v1)

- Enterprise admin controls / push configs to employees
- Logo-specific optimizations or templates
- Auto-detect room changes and prompt reconfigure
- Auto-disable wall art when user moves to different room
- Perspective matching (adjusting art angle to match wall angle)
- Lighting matching (adjusting art brightness to match room)
- Texture replication for wall paint (brick, wood grain, etc.)
- Color harmony suggestions (complementary colors for art)

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Per-Frame Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CAPTURE frame from getUserMedia (existing)                  │
│                                                                  │
│  2. CHECK virtual background status                             │
│     └─ If Meet virtual BG active → skip wall art rendering      │
│                                                                  │
│  3. SEGMENTATION (MediaPipe Selfie Segmentation)                │
│     └─ Input: video frame                                       │
│     └─ Output: person mask (ALL people in frame)                │
│     └─ Cache: reuse if frame similarity > threshold             │
│                                                                  │
│  4. JIGGLE COMPENSATION (Phase 2)                               │
│     └─ Track background feature points                          │
│     └─ Compute frame-to-frame transform                         │
│     └─ Apply compensation to wall regions                       │
│                                                                  │
│  5. WALL PAINT RENDERING (for each region with paint)           │
│     └─ Fill region with solid color at specified opacity        │
│     └─ Apply perspective transform for quadrilateral            │
│     └─ Cut out person mask (destination-out composite)          │
│     └─ Composite onto main canvas                               │
│                                                                  │
│  6. WALL ART RENDERING (for each active wall art region)        │
│     └─ Draw art image into defined region                       │
│     └─ Apply perspective transform for quadrilateral            │
│     └─ Cut out person mask (destination-out composite)          │
│     └─ Composite onto main canvas                               │
│                                                                  │
│  7. EXISTING OVERLAYS (text banners, timers, effects)           │
│     └─ Render on top of wall art as usual                       │
│                                                                  │
│  8. OUTPUT to virtual stream for Meet                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### User Flow: Region → Paint → Art

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  1. USER DRAWS REGION                                           │
│     └─ 4-corner quadrilateral handles                           │
│     └─ Edge snapping assists alignment                          │
│                                                                  │
│  2. OPTIONAL: WALL PAINT                                        │
│     └─ Eyedropper: click to sample wall color (10x10 avg)       │
│     └─ Color picker: choose any color                           │
│     └─ AI suggest: auto-detect dominant wall color              │
│     └─ Opacity slider: 0-100%                                   │
│     └─ Can skip this step entirely                              │
│     └─ Can use paint alone (no art)                             │
│                                                                  │
│  3. OPTIONAL: PLACE ART                                         │
│     └─ Browse curated gallery                                   │
│     └─ Upload custom image/GIF/video                            │
│     └─ Choose aspect ratio mode                                 │
│     └─ Art renders ON TOP of paint layer                        │
│                                                                  │
│  4. SAVE & ACTIVATE                                             │
│     └─ Region saved to IndexedDB                                │
│     └─ Can save as part of named preset                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `WallArtSegmenter` | `lib/wall-segmentation.js` | MediaPipe wrapper, mask caching, multi-person support |
| `WallPaintRenderer` | `lib/wall-paint-renderer.js` | Solid color fill with opacity, perspective transform |
| `WallArtRenderer` | `lib/wall-art-renderer.js` | Image/GIF/video compositing, perspective transform, occlusion |
| `ColorSampler` | `lib/color-sampler.js` | Eyedropper (10x10 avg), AI color detection |
| `EdgeDetector` | `lib/edge-detector.js` | Edge snapping for region alignment |
| `JiggleCompensator` | `lib/jiggle-compensator.js` | Feature tracking, drift correction (Phase 2) |
| `WallDetector` | `lib/wall-detector.js` | Depth estimation, flat region detection (Phase 3) |
| `WallArtStorage` | `lib/wall-art-storage.js` | IndexedDB operations, preset management |
| `WallArtEditor` | `popup/components/WallArtEditor.tsx` | Region selection UI, edge snapping toggle |
| `WallPaintEditor` | `popup/components/WallPaintEditor.tsx` | Color picker, eyedropper, opacity slider |
| `ArtGallery` | `popup/components/ArtGallery.tsx` | Default art browser, upload interface |
| `WallArtTutorial` | `popup/components/WallArtTutorial.tsx` | First-use guided walkthrough |

### Data Model

```typescript
// Wall Region (shared by paint and art)
interface WallRegion {
  // 4 corners as percentages (0-100)
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

// Wall Paint Layer (optional prep layer)
interface WallPaint {
  enabled: boolean;
  color: string;                 // Hex color, e.g., '#FFFFFF'
  opacity: number;               // 0-1
  colorSource: 'eyedropper' | 'picker' | 'ai-detected';
}

// Wall Art Overlay (complete region with optional paint + optional art)
interface WallArtOverlay {
  id: string;
  type: 'wallArt';

  // Region (shared by paint and art layers)
  region: WallRegion;

  // Paint layer (optional, renders first)
  paint?: WallPaint;

  // Art layer (optional, renders on top of paint)
  art?: {
    src: string;                 // IndexedDB key or data URL
    contentType: 'image' | 'gif' | 'video';
    aspectRatioMode: 'stretch' | 'fit' | 'crop';
    opacity: number;             // 0-1
  };

  // State
  active: boolean;
  presetId?: string;             // If part of a named preset

  // Metadata
  createdAt: number;
  updatedAt: number;
}

// Note: A WallArtOverlay can have:
// - Paint only (cover area with color, no art)
// - Art only (place art directly on real background)
// - Paint + Art (cover area, then place art on top)

// Named Preset
interface WallArtPreset {
  id: string;
  name: string;                  // "Home Office", "Kitchen"
  wallArts: WallArtOverlay[];
  createdAt: number;
  updatedAt: number;
}

// Segmentation Quality
interface SegmentationStatus {
  quality: 'good' | 'degraded' | 'poor';
  fps: number;
  lastWarningShown: number | null;
}
```

### Storage Architecture

```typescript
// IndexedDB Schema
const DB_NAME = 'MeetCameraOverlay';
const DB_VERSION = 2;

const stores = {
  // Large binary data (images, videos)
  'wall-art-media': {
    keyPath: 'id',
    indexes: ['createdAt']
  },

  // Configuration and presets
  'wall-art-presets': {
    keyPath: 'id',
    indexes: ['name', 'updatedAt']
  }
};

// Storage wrapper
class WallArtStorage {
  async saveMedia(id: string, blob: Blob): Promise<void>;
  async getMedia(id: string): Promise<Blob | null>;
  async deleteMedia(id: string): Promise<void>;

  async savePreset(preset: WallArtPreset): Promise<void>;
  async getPreset(id: string): Promise<WallArtPreset | null>;
  async listPresets(): Promise<WallArtPreset[]>;
  async deletePreset(id: string): Promise<void>;
}
```

## Implementation Plan

### Phase 1: Core Feature (MVP)

**1.1 Segmentation Foundation**
1. Add TensorFlow.js and MediaPipe body-segmentation dependencies
2. Create `WallArtSegmenter` class with lazy initialization
3. Implement multi-person mask generation
4. Add mask caching to reduce redundant computation
5. Integrate into `VideoProcessor.render()` loop

**1.2 Region Selection UI**
1. Create `WallArtEditor` component with video preview
2. Implement 4-corner draggable handles
3. Implement edge snapping via `EdgeDetector` (Canny edge detection)
4. Add aspect ratio mode selector (stretch/fit/crop)
5. Create region persistence to storage

**1.3 Wall Paint System**
1. Create `ColorSampler` class with eyedropper (10x10 pixel average)
2. Implement AI color detection (dominant color in region)
3. Create `WallPaintEditor` component with:
   - Eyedropper mode (click to sample)
   - Color picker (any color)
   - "Detect wall color" button
   - Opacity slider (0-100%)
4. Create `WallPaintRenderer` for solid color fill with perspective
5. Integrate paint layer into render pipeline (before art layer)

**1.4 Wall Art Rendering**
1. Create `WallArtRenderer` with perspective transform
2. Implement occlusion compositing (destination-out)
3. Support multiple simultaneous regions
4. Integrate animated GIF rendering (reuse existing decoder)
5. Add video loop support (HTMLVideoElement)

**1.5 Virtual Background Detection**
1. Detect when Meet's virtual background is enabled
2. Show explanation and disable wall art gracefully
3. Auto-re-enable when virtual background is turned off

**1.6 Content & Storage**
1. Implement IndexedDB storage wrapper
2. Bundle curated gallery (20-30 images, ~2MB total)
3. Create upload interface with drag-and-drop
4. Add content type detection (image/gif/video)

**1.7 Quality & Performance**
1. Implement FPS monitoring
2. Add segmentation quality detection
3. Create warning badge component
4. Show performance warning (non-blocking)

**1.8 Onboarding**
1. Create guided tutorial component
2. Detect first-time use
3. Walk through: draw region → optional paint → choose art → preview → save

### Phase 2: Stability & Presets

**2.1 Jiggle Compensation**
1. Implement Harris corner detection
2. Create feature point tracker
3. Compute frame-to-frame transform
4. Apply compensation to wall regions
5. Add auto-reset on large motion
6. Add manual recalibrate button

**2.2 Named Presets**
1. Add preset management UI
2. Implement save/load/delete operations
3. Add preset selector dropdown
4. Quick-switch between presets

### Phase 3: Auto-Detection

**3.1 Wall Detection**
1. Convert MiDaS Small to TensorFlow.js format
2. Implement depth estimation
3. Create flat region detection algorithm
4. Rank regions by "wall-likeness"

**3.2 Detection UI**
1. Show detected regions with highlighting
2. Let user click to select or adjust
3. "Draw manually" fallback option

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Virtual background active | Detect and disable wall art, show explanation |
| Multiple people in frame | Segment all people, occlude behind all |
| Person walks in front of region | Natural occlusion via segmentation mask |
| Poor lighting / segmentation fails | Show warning badge, continue rendering |
| FPS drops below 15 | Show warning, let user decide |
| Camera moved significantly | Phase 2: Auto-reset tracking, notify user |
| User moves to different room | Keep rendering, user's responsibility to reconfigure |
| Screen share active | Keep wall art processing running |
| Image aspect ratio mismatch | User chooses: stretch, fit, or crop |
| Storage quota exceeded | Prompt to delete old images, use IndexedDB |
| Model fails to load | Graceful fallback, show error, disable feature |
| Browser doesn't support WebGL | Show incompatibility message |
| Eyedropper samples person instead of wall | Use person mask to exclude, sample only background |
| Textured wall (brick, wood) | Solid color fill only, won't match texture |
| Paint-only region (no art) | Valid use case, renders solid color in region |
| Very dark/light sampled color | Show preview before applying, user confirms |
| Edge snapping finds no edges | Fall back to free-form drawing, no snapping |

## Testing Strategy

### Unit Tests
- Region calculation and coordinate transforms
- Perspective transform math
- Aspect ratio mode calculations
- IndexedDB storage operations
- Preset save/load/delete
- Color sampling (10x10 average calculation)
- Edge detection for snapping
- Paint + art layer compositing order

### Integration Tests
- Wall art renders in correct position
- Person correctly occludes wall art
- Person correctly occludes wall paint
- Paint layer renders before art layer
- Paint-only regions work without art
- Multiple regions render correctly
- GIF animation plays correctly
- Video loops correctly
- Virtual background detection works
- Presets persist across sessions
- Eyedropper excludes person from sampling
- Edge snapping aligns to detected edges

### Performance Tests
- FPS with 1 region, 1 person
- FPS with 3 regions, 2 people
- Memory usage over 30-minute session
- Model initialization time
- IndexedDB read/write speed

### Manual Testing
- Various lighting conditions
- Different room setups (office, bedroom, kitchen)
- Multiple people entering/leaving frame
- Screen share and camera toggle
- Different image sizes and aspect ratios
- First-use tutorial flow
- Low-end hardware (Chromebook, older laptops)

## Open Questions

- [ ] What's the ideal bundle size for default gallery images? (Targeting ~2MB)
- [ ] Should we host TensorFlow.js models on CDN or bundle them?
- [ ] What's the minimum Chrome version we need to support?
- [ ] Do we need to handle Safari/Firefox at all? (Chrome extension, but WebGL compatibility)

## Design Decisions Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Multi-person occlusion | Users share desks, family walks by | Primary person only (simpler) |
| Fully free feature | Drive adoption, differentiate from paid competitors | Pro-only, freemium with limits |
| IndexedDB for images | Chrome storage limits (5-10MB) too restrictive | Aggressive compression, external URLs |
| Keep running during screen share | Simpler state, ready when camera returns | Pause to save CPU |
| Warning vs auto-disable | User autonomy, don't break workflow | Auto-disable on quality/FPS drop |
| Guided tutorial | Feature is novel, needs explanation | Tooltips only, no onboarding |
| User-controlled aspect ratio | Different images need different handling | Auto-detect or force one mode |
| Named presets | Users have different setups (home/office) | Single auto-save, no presets |
| No enterprise admin | Focus on individual user first | Build admin controls for v1 |
| No logo optimizations | KISS principle, logos work as images | Logo-specific templates |
| Combined Region → Paint → Art flow | Single cohesive experience, less mode switching | Separate paint and art features |
| Standalone paint mode | Cover messy areas is valid use case alone | Paint only as art prep step |
| 10x10 pixel average for eyedropper | Stability over precision, reduces noise | Single pixel (noisy), larger area (too averaged) |
| Solid color fill only | Texture replication is complex, KISS | AI texture cloning (expensive, unreliable) |
| Edge snapping | Helps align to picture frames, easier UX | Manual only (more work for user) |
| Adjustable paint opacity | Enables subtle color correction use case | Fixed 100% opacity |
| No color harmony suggestions | Keep focused, avoid scope creep | Suggest complementary colors for art |

## Marketing Plan

### Primary Audience: Remote Workers
**Hook:** "Your background, upgraded"
**Pain point:** Messy home office, boring walls, unprofessional appearance
**Message:** Replace that ugly poster with your company logo. Cover the laundry pile with abstract art. Keep your real space while hiding what you don't want seen.

**Wall Paint angle:** "Match your wall color perfectly with our eyedropper tool. Cover up old picture frames or messy shelves with a clean, solid color—then add your own art on top."

### Secondary Audiences

| Audience | Hook | Use Case |
|----------|------|----------|
| Teachers | "Your virtual classroom" | Display educational content, classroom decor |
| Streamers/Creators | "Make your space uniquely yours" | Animated backgrounds, personal branding |
| Churches | "Worship visuals without the setup" | Display lyrics, religious imagery |

### Launch Channels
1. Chrome Web Store listing update
2. Product Hunt launch
3. Reddit: r/remotework, r/WFH, r/Teachers
4. Twitter/X demo videos
5. Google Meet Community forum posts (answer existing threads)

### Demo Content
- Before/after comparison GIF
- 30-second feature walkthrough video
- Screenshot gallery of use cases
