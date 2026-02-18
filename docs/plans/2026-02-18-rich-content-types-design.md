# Rich Content Types for Wall Regions

## Date: 2026-02-18

## Problem

The extension's wall art regions currently support static images, animated GIFs, solid colors/gradients, and video file uploads. Users lack compelling reasons to use the tool repeatedly. Richer content types — specifically a photo slideshow mode and live tab capture — would make wall regions significantly more useful and differentiated.

## Features

### Feature 1: Photo Slideshow Frame

A wall region can hold multiple images that cycle automatically, like a digital photo frame.

#### Data Model

Extend `overlay.art` with a new `contentType: 'slideshow'`:

```js
overlay.art = {
  contentType: 'slideshow',
  slides: [
    { src: 'data:image/jpeg;base64,...', name: 'family.jpg' },
    { src: 'data:image/jpeg;base64,...', name: 'vacation.png' }
  ],
  intervalSeconds: 30,          // 10, 15, 30, 60, 120
  transition: 'fade',           // 'fade', 'slide-left', 'dissolve', 'none'
  transitionDurationMs: 1000,
  shuffle: false,
  currentIndex: 0               // runtime only, not persisted
}
```

#### SlideshowPlayer Class

A new class (likely in `lib/slideshow-player.js`) that:

- Pre-loads the current image and the next image as `HTMLImageElement`s
- Tracks elapsed time since last transition
- When interval elapses, begins crossfade to next image
- During crossfade: renders both images to an intermediate `OffscreenCanvas`, blending with `globalAlpha`
- Exposes a `.currentFrame` canvas (same interface as `AnimatedImage`) so the renderer treats it identically to a GIF
- Supports `update(timestamp)` method called each render frame

The key design decision: `SlideshowPlayer` presents the **same interface** as `AnimatedImage` — it has `update(timestamp)` and `.currentFrame`. This means `renderAllWallArt()` needs zero changes; it already handles objects with that interface.

#### Transitions

- **fade**: Crossfade via globalAlpha on intermediate canvas
- **slide-left**: Draw outgoing image sliding left, incoming sliding in from right
- **dissolve**: Random pixel-block reveal (optional, can defer)
- **none**: Hard cut

#### Art Picker UI

A new "Slideshow" tab in the art picker modal:

- Image list showing thumbnails (drag to reorder, X to remove)
- "Add images" button opening a multi-select file picker
- Interval dropdown (10s, 15s, 30s, 1min, 2min)
- Transition type dropdown (fade, slide, none)
- Live preview cycling through the images

#### Storage

Slides stored as JPEG data URLs (quality 80) in `chrome.storage.local`. Cap at 20 slides per region to stay within the ~10MB local storage budget. Large images resized to max 1280px on longest edge before storage.

---

### Feature 2: Live Tab Capture

A wall region can display a live feed of any browser tab at up to 30fps.

#### Capture Method: `getDisplayMedia()`

```js
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { displaySurface: 'browser', frameRate: 30 },
  audio: false
});
```

Reasons for this approach over alternatives:
- No new manifest permissions required
- No offscreen document complexity
- Uses Chrome's native tab picker (familiar UX)
- Works from page context (inject.js) where rendering happens
- Stream persists when user switches back to Meet tab

#### Data Model

```js
overlay.art = {
  contentType: 'tabCapture',
  src: null,                    // no persistent source — stream is ephemeral
  streamActive: true,           // runtime state
  name: 'YouTube - My Playlist' // from stream track label
}
```

Tab capture is inherently ephemeral. When Meet refreshes or the source tab closes, the stream ends. The region config persists but displays a reconnection prompt.

#### Integration with Existing Renderer

The `getDisplayMedia()` stream is attached to an `HTMLVideoElement`:

```js
const video = document.createElement('video');
video.srcObject = stream;
video.autoplay = true;
video.muted = true;
await video.play();
```

This `HTMLVideoElement` is stored in the `wallArtImages` Map (same as current image/GIF/video sources). The existing `renderWallArt()` already accepts `HTMLVideoElement` as a source via `drawImage()`. The perspective transform, person occlusion, and brightness compensation all work unchanged.

#### UX Flow

1. User creates or selects a wall region
2. In the art picker, they choose the "Live Tab" tab
3. They click "Select a tab to capture"
4. Chrome's native tab picker appears
5. User selects a tab (YouTube, dashboard, etc.)
6. Live feed immediately renders in the wall region
7. Sidebar shows a "LIVE" badge on the region

#### Reconnection

When stream ends (tab closed, track ended):
- Listen for `stream.getVideoTracks()[0].onended`
- Freeze the last frame as a static image
- Show overlay message: "Tab closed — click to reconnect"
- Clicking re-triggers `getDisplayMedia()`

#### Edge Cases

- **Audio**: Set `audio: false` to prevent echo/feedback in Meet call
- **Performance**: Constrain capture to 720p or 480p since it renders into a small region. Use `video.width`/`video.height` constraints if needed.
- **Meet tab self-capture**: Detect via track label containing "meet.google.com". Show warning and reject.
- **Multiple captures**: Support one live tab capture per session initially. Multiple captures require multiple user interactions (each `getDisplayMedia` call shows a picker).
- **Resolution**: The captured stream resolution matches the source tab's viewport. For large monitors, request lower resolution via constraints to reduce GPU load.

#### What This Enables

- Digital TV with YouTube or any streaming content playing on the wall
- Live dashboards (Grafana, analytics) updating in real-time
- Presentation companion — slide deck visible in background
- Live scoreboards, weather, news tickers
- Any web content as a wall-mounted display

---

## Architecture Notes

### New Files

- `lib/slideshow-player.js` — SlideshowPlayer class (~150 lines)
- `lib/tab-capture.js` — Tab capture lifecycle management (~100 lines)

### Modified Files

- `inject.js` — Add slideshow and tabCapture content type handling in art loading
- `popup.js` — Add Slideshow tab and Live Tab tab to art picker modal
- `popup.html` — Add UI elements for new tabs
- `content.js` — Relay new message types for tab capture start/stop
- `lib/overlay-factory.js` — Support new contentType values in factory/migration

### No Changes Needed

- `lib/wall-art-renderer.js` — Already handles any drawable source (Image, Canvas, Video)
- `lib/wall-region.js` — Region geometry unchanged
- `lib/segmentation-mask.js` — Person occlusion unchanged
- `lib/wall-paint-renderer.js` — Unaffected

## Implementation Order

1. **Slideshow** first (simpler, no new APIs, validates the multi-content-type pattern)
2. **Tab capture** second (builds on the pattern established by slideshow, adds the "wow factor")
