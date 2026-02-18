# Rich Content Types Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add photo slideshow and live tab capture content types to wall art regions.

**Architecture:** Two new content types slot into the existing wall art rendering pipeline via duck-typing. `SlideshowPlayer` implements the same `update(timestamp)` / `.currentFrame` interface as `AnimatedImage`, so `renderAllWallArt()` handles it with zero changes. Tab capture uses `getDisplayMedia()` to produce an `HTMLVideoElement`, which the renderer already accepts. Both are loaded through `loadWallArtImage()` in inject.js with new `contentType` branches.

**Tech Stack:** Vanilla JS, Canvas2D, `getDisplayMedia()` Web API, chrome.storage

---

## Part 1: Photo Slideshow Frame

### Task 1: SlideshowPlayer Class — Core Logic

**Files:**
- Create: `lib/slideshow-player.js`
- Test: `tests/unit/slideshow-player.test.js`

This is a classic script (not ES module) since it runs in page context via inject.js, like `animated-image.js`.

**Step 1: Write the failing tests**

Create `tests/unit/slideshow-player.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// SlideshowPlayer is a classic script, so we need to load it differently.
// For unit testing, we'll import a testable ES module version.
// The actual file attaches to window; we test the class directly.

// Mock OffscreenCanvas for Node test environment
class MockCanvas {
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return {
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
    };
  }
}
globalThis.OffscreenCanvas = MockCanvas;

// We'll dynamically import after mocks are set up
let SlideshowPlayer;

beforeEach(async () => {
  // Reset module cache
  vi.resetModules();
  const mod = await import('../../lib/slideshow-player.js');
  SlideshowPlayer = mod.SlideshowPlayer;
});

describe('SlideshowPlayer', () => {
  const makeSlides = (count) =>
    Array.from({ length: count }, (_, i) => ({
      src: `data:image/png;base64,fake${i}`,
      name: `slide${i}.png`,
    }));

  describe('constructor', () => {
    it('stores slides and config', () => {
      const slides = makeSlides(3);
      const player = new SlideshowPlayer(slides, {
        intervalSeconds: 15,
        transition: 'fade',
      });
      expect(player.slides).toHaveLength(3);
      expect(player.intervalMs).toBe(15000);
      expect(player.transition).toBe('fade');
    });

    it('defaults to 30s interval and fade transition', () => {
      const player = new SlideshowPlayer(makeSlides(2));
      expect(player.intervalMs).toBe(30000);
      expect(player.transition).toBe('fade');
    });

    it('requires at least 2 slides', () => {
      expect(() => new SlideshowPlayer(makeSlides(1))).toThrow();
      expect(() => new SlideshowPlayer([])).toThrow();
    });
  });

  describe('duck-type interface', () => {
    it('has update() method', () => {
      const player = new SlideshowPlayer(makeSlides(2));
      expect(typeof player.update).toBe('function');
    });

    it('has currentFrame getter', () => {
      const player = new SlideshowPlayer(makeSlides(2));
      expect(player.currentFrame).toBeDefined();
    });

    it('has width and height properties', () => {
      const player = new SlideshowPlayer(makeSlides(2));
      expect(typeof player.width).toBe('number');
      expect(typeof player.height).toBe('number');
    });
  });

  describe('update() cycling', () => {
    it('stays on first slide before interval elapses', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 10,
        transition: 'none',
      });
      player.update(0);
      expect(player.currentSlideIndex).toBe(0);
      player.update(5000);
      expect(player.currentSlideIndex).toBe(0);
    });

    it('advances to next slide after interval', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 10,
        transition: 'none',
      });
      player.update(0);
      player.update(10001);
      expect(player.currentSlideIndex).toBe(1);
    });

    it('wraps around to first slide', () => {
      const player = new SlideshowPlayer(makeSlides(2), {
        intervalSeconds: 10,
        transition: 'none',
      });
      player.update(0);
      player.update(10001);
      expect(player.currentSlideIndex).toBe(1);
      player.update(20002);
      expect(player.currentSlideIndex).toBe(0);
    });
  });

  describe('fade transition', () => {
    it('sets transitioning flag during crossfade', () => {
      const player = new SlideshowPlayer(makeSlides(2), {
        intervalSeconds: 10,
        transition: 'fade',
        transitionDurationMs: 1000,
      });
      player.update(0);
      // Just before transition
      player.update(9999);
      expect(player.transitioning).toBe(false);
      // Trigger transition
      player.update(10001);
      expect(player.transitioning).toBe(true);
      // After transition completes
      player.update(11002);
      expect(player.transitioning).toBe(false);
    });

    it('computes transition progress 0-1', () => {
      const player = new SlideshowPlayer(makeSlides(2), {
        intervalSeconds: 10,
        transition: 'fade',
        transitionDurationMs: 1000,
      });
      player.update(0);
      player.update(10001); // start transition
      expect(player.transitionProgress).toBeCloseTo(0, 1);
      player.update(10500); // halfway
      expect(player.transitionProgress).toBeCloseTo(0.5, 1);
      player.update(11001); // done
      expect(player.transitionProgress).toBeGreaterThanOrEqual(1);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/slideshow-player.test.js`
Expected: FAIL — module not found

**Step 3: Write SlideshowPlayer implementation**

Create `lib/slideshow-player.js`:

```js
/**
 * SlideshowPlayer - Cycles through multiple images with transitions.
 *
 * Implements the same duck-type interface as AnimatedImage:
 * - update(timestamp) — called each render frame
 * - currentFrame — returns a drawable canvas
 * - width / height — dimensions
 *
 * This allows renderAllWallArt() to handle slideshows
 * identically to animated GIFs with zero renderer changes.
 */

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_INTERVAL_S = 30;
const DEFAULT_TRANSITION_MS = 1000;
const MIN_SLIDES = 2;

class SlideshowPlayer {
  constructor(slides, options = {}) {
    if (!slides || slides.length < MIN_SLIDES) {
      throw new Error(`SlideshowPlayer requires at least ${MIN_SLIDES} slides`);
    }

    this.slides = slides;
    this.intervalMs = (options.intervalSeconds || DEFAULT_INTERVAL_S) * 1000;
    this.transition = options.transition || 'fade';
    this.transitionDurationMs = options.transitionDurationMs || DEFAULT_TRANSITION_MS;
    this.shuffle = options.shuffle || false;

    this.width = DEFAULT_WIDTH;
    this.height = DEFAULT_HEIGHT;

    this.currentSlideIndex = 0;
    this.nextSlideIndex = 1;
    this.lastAdvanceTime = 0;
    this.transitioning = false;
    this.transitionStartTime = 0;
    this.transitionProgress = 0;
    this.playing = true;

    this.outputCanvas = new OffscreenCanvas(this.width, this.height);
    this.outputCtx = this.outputCanvas.getContext('2d');

    this.loadedImages = new Map();
    this._loadSlideImages();
  }

  _loadSlideImages() {
    for (let i = 0; i < this.slides.length; i++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = this.slides[i].src;
      this.loadedImages.set(i, img);
    }
  }

  get currentFrame() {
    return this.outputCanvas;
  }

  update(timestamp) {
    if (!this.playing) return;

    if (this.lastAdvanceTime === 0) {
      this.lastAdvanceTime = timestamp;
      this._renderCurrentSlide();
      return;
    }

    const elapsed = timestamp - this.lastAdvanceTime;

    if (this.transitioning) {
      this.transitionProgress =
        (timestamp - this.transitionStartTime) / this.transitionDurationMs;

      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.transitioning = false;
        this.currentSlideIndex = this.nextSlideIndex;
        this.nextSlideIndex = (this.currentSlideIndex + 1) % this.slides.length;
        this.lastAdvanceTime = timestamp;
        this._renderCurrentSlide();
      } else {
        this._renderTransition();
      }
      return;
    }

    if (elapsed >= this.intervalMs) {
      if (this.transition === 'none') {
        this.currentSlideIndex = this.nextSlideIndex;
        this.nextSlideIndex = (this.currentSlideIndex + 1) % this.slides.length;
        this.lastAdvanceTime = timestamp;
        this._renderCurrentSlide();
      } else {
        this.transitioning = true;
        this.transitionStartTime = timestamp;
        this.transitionProgress = 0;
        this._renderTransition();
      }
    }
  }

  _renderCurrentSlide() {
    const img = this.loadedImages.get(this.currentSlideIndex);
    if (!img || !img.complete || !img.naturalWidth) return;

    this.outputCtx.clearRect(0, 0, this.width, this.height);
    this.outputCtx.drawImage(img, 0, 0, this.width, this.height);
  }

  _renderTransition() {
    const fromImg = this.loadedImages.get(this.currentSlideIndex);
    const toImg = this.loadedImages.get(this.nextSlideIndex);

    if (!fromImg?.complete || !toImg?.complete) {
      this._renderCurrentSlide();
      return;
    }

    const ctx = this.outputCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.transition === 'fade') {
      ctx.save();
      ctx.globalAlpha = 1 - this.transitionProgress;
      ctx.drawImage(fromImg, 0, 0, this.width, this.height);
      ctx.globalAlpha = this.transitionProgress;
      ctx.drawImage(toImg, 0, 0, this.width, this.height);
      ctx.restore();
    } else if (this.transition === 'slide-left') {
      const offset = this.transitionProgress * this.width;
      ctx.drawImage(fromImg, -offset, 0, this.width, this.height);
      ctx.drawImage(toImg, this.width - offset, 0, this.width, this.height);
    }
  }

  reset() {
    this.currentSlideIndex = 0;
    this.nextSlideIndex = 1;
    this.lastAdvanceTime = 0;
    this.transitioning = false;
  }
}

// Export for both ES module (tests) and classic script (inject.js) contexts
export { SlideshowPlayer };

if (typeof window !== 'undefined') {
  window.SlideshowPlayer = SlideshowPlayer;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/slideshow-player.test.js`
Expected: PASS

**Step 5: Run lint**

Run: `npm run lint -- lib/slideshow-player.js tests/unit/slideshow-player.test.js`
Expected: No errors

**Step 6: Commit**

```bash
git add lib/slideshow-player.js tests/unit/slideshow-player.test.js
git commit -m "feat: add SlideshowPlayer class with fade/slide transitions"
```

---

### Task 2: Wire Slideshow into inject.js Content Loading

**Files:**
- Modify: `inject.js:382-425` (the `loadWallArtImage` function)
- Modify: `content.js` (add slideshow-player.js to script injection list)

**Step 1: Add slideshow-player.js to content.js script injection**

In `content.js`, find the array of lib scripts that get injected. Add `'lib/slideshow-player.js'` after `'lib/animated-image.js'` (since it follows the same pattern — a classic script attached to `window`).

Search for the script injection list in content.js (look for `animated-image.js` in the array) and add the new file adjacent to it.

**Step 2: Add slideshow branch to `loadWallArtImage` in inject.js**

In `inject.js`, find the `loadWallArtImage` function (around line 382). After the video check block (lines 410-421), add a new block for slideshow:

```js
    // Check if it's a slideshow
    if (contentType === 'slideshow' && window.SlideshowPlayer) {
      try {
        console.log('[Meet Overlay] Loading wall art slideshow:', wallArt.id);
        const slides = wallArt.art.slides || [];
        if (slides.length >= 2) {
          const player = new window.SlideshowPlayer(slides, {
            intervalSeconds: wallArt.art.intervalSeconds,
            transition: wallArt.art.transition,
            transitionDurationMs: wallArt.art.transitionDurationMs,
          });
          wallArtImages.set(wallArt.id, player);
          console.log('[Meet Overlay] Loaded slideshow with', slides.length, 'slides');
        }
      } catch (e) {
        console.error('[Meet Overlay] Failed to create slideshow:', e);
      }
      return;
    }
```

**Step 3: Fix the active filter in renderAllWallArt**

In `lib/wall-art-renderer.js:329-331`, the filter requires `overlay.art.src` to be truthy. Slideshows don't have `.src` — they have `.slides`. Update the filter:

```js
  const artOverlays = wallArtOverlays.filter(
    overlay => overlay.type === 'wallArt' && overlay.art &&
      (overlay.art.src || overlay.art.contentType === 'slideshow' || overlay.art.contentType === 'tabCapture') &&
      overlay.active
  );
```

**Step 4: Test manually by loading the extension with a test slideshow config**

Verify inject.js logs `[Meet Overlay] Loaded slideshow with N slides` when a slideshow wall art overlay is configured.

**Step 5: Run lint on modified files**

Run: `npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add inject.js content.js lib/wall-art-renderer.js
git commit -m "feat: wire SlideshowPlayer into inject.js content loading pipeline"
```

---

### Task 3: Slideshow UI in Extension Popup

**Files:**
- Modify: `popup.html` (add Slideshow tab to art source tabs)
- Modify: `popup.js` (add slideshow tab logic, image list management, config controls)

**Step 1: Add "Slideshow" art source tab button in popup.html**

Find the art source tabs (around line 300-303):

```html
<div class="art-source-tabs">
  <button type="button" class="art-source-tab active" data-source="upload">Upload</button>
  <button type="button" class="art-source-tab" data-source="gallery">Gallery</button>
</div>
```

Add a third tab button:

```html
  <button type="button" class="art-source-tab" data-source="slideshow">Slideshow</button>
```

**Step 2: Add slideshow tab content in popup.html**

After the `art-source-gallery` div (around line 331), add:

```html
<!-- Slideshow Source Content -->
<div id="art-source-slideshow" class="art-source-content hidden">
  <div class="form-group">
    <label>Images (2-20)</label>
    <div id="slideshow-image-list" class="slideshow-image-list">
      <!-- Populated by JS -->
    </div>
    <input type="file" id="slideshow-add-images" accept="image/*,.gif" multiple
           style="display:none">
    <button type="button" id="slideshow-add-btn" class="btn btn-secondary btn-small">
      Add Images
    </button>
  </div>
  <div class="form-row">
    <div class="form-group form-group-half">
      <label>Interval</label>
      <select id="slideshow-interval">
        <option value="10">10 seconds</option>
        <option value="15">15 seconds</option>
        <option value="30" selected>30 seconds</option>
        <option value="60">1 minute</option>
        <option value="120">2 minutes</option>
      </select>
    </div>
    <div class="form-group form-group-half">
      <label>Transition</label>
      <select id="slideshow-transition">
        <option value="fade">Fade</option>
        <option value="slide-left">Slide Left</option>
        <option value="none">None (cut)</option>
      </select>
    </div>
  </div>
</div>
```

**Step 3: Add slideshow JS logic in popup.js**

Add event handling for:
- Tab switching to show/hide the slideshow content div
- `slideshow-add-btn` click → triggers `slideshow-add-images` file input
- File input change → reads files, resizes to max 1280px, converts to JPEG data URL quality 0.8, adds to a `slideshowImages` array
- Renders thumbnail list in `slideshow-image-list` with remove (X) buttons
- On modal save: builds the `overlay.art` object with `contentType: 'slideshow'`, `slides`, `intervalSeconds`, `transition`, `transitionDurationMs: 1000`
- Enforces min 2, max 20 slides

The image resize helper:

```js
function resizeImageForStorage(dataUrl, maxDim = 1280, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}
```

**Step 4: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 5: Test manually**

Load the extension, open popup, navigate to wall art modal → Art tab → Slideshow tab. Add multiple images, verify they appear in the list, configure interval/transition, save. Verify the overlay is saved to chrome.storage with correct `contentType: 'slideshow'` and `slides` array.

**Step 6: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add slideshow tab to wall art picker UI"
```

---

## Part 2: Live Tab Capture

### Task 4: Tab Capture Module

**Files:**
- Create: `lib/tab-capture.js`
- Test: `tests/unit/tab-capture.test.js`

This is a classic script for page context.

**Step 1: Write the failing tests**

Create `tests/unit/tab-capture.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

let TabCapture;

beforeEach(async () => {
  vi.resetModules();

  // Mock getDisplayMedia
  const mockTrack = {
    label: 'Tab: YouTube - Music',
    onended: null,
    stop: vi.fn(),
    addEventListener: vi.fn((event, cb) => {
      if (event === 'ended') mockTrack._endedCb = cb;
    }),
    _endedCb: null,
  };

  const mockStream = {
    getVideoTracks: () => [mockTrack],
    active: true,
  };

  const mockVideo = {
    srcObject: null,
    autoplay: false,
    muted: false,
    playsInline: false,
    play: vi.fn(() => Promise.resolve()),
    videoWidth: 1280,
    videoHeight: 720,
  };

  globalThis.navigator = {
    mediaDevices: {
      getDisplayMedia: vi.fn(() => Promise.resolve(mockStream)),
    },
  };

  globalThis.document = {
    createElement: vi.fn(() => mockVideo),
  };

  const mod = await import('../../lib/tab-capture.js');
  TabCapture = mod.TabCapture;
});

describe('TabCapture', () => {
  it('exports TabCapture class', () => {
    expect(TabCapture).toBeDefined();
    expect(typeof TabCapture).toBe('function');
  });

  describe('startCapture', () => {
    it('calls getDisplayMedia with correct constraints', async () => {
      const capture = new TabCapture();
      await capture.start();

      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ displaySurface: 'browser' }),
          audio: false,
        })
      );
    });

    it('returns an HTMLVideoElement', async () => {
      const capture = new TabCapture();
      const video = await capture.start();
      expect(video).toBeDefined();
      expect(video.autoplay).toBe(true);
      expect(video.muted).toBe(true);
    });

    it('extracts tab name from track label', async () => {
      const capture = new TabCapture();
      await capture.start();
      expect(capture.tabName).toContain('YouTube');
    });
  });

  describe('stop', () => {
    it('stops the video track', async () => {
      const capture = new TabCapture();
      await capture.start();
      capture.stop();
      expect(capture.active).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tab-capture.test.js`
Expected: FAIL — module not found

**Step 3: Write TabCapture implementation**

Create `lib/tab-capture.js`:

```js
/**
 * TabCapture - Captures a browser tab as a live video stream.
 *
 * Uses getDisplayMedia() to let the user pick a tab. The resulting
 * MediaStream is attached to an HTMLVideoElement that can be drawn
 * to canvas by the existing wall art renderer.
 *
 * No new manifest permissions required.
 */

class TabCapture {
  constructor() {
    this.stream = null;
    this.video = null;
    this.active = false;
    this.tabName = '';
    this._onEndedCallback = null;
  }

  async start() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    this.stream = stream;
    this.active = true;

    const track = stream.getVideoTracks()[0];
    this.tabName = this._parseTabName(track.label);

    track.addEventListener('ended', () => {
      this.active = false;
      if (this._onEndedCallback) this._onEndedCallback();
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    await video.play();
    this.video = video;

    return video;
  }

  stop() {
    this.active = false;
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  onEnded(callback) {
    this._onEndedCallback = callback;
  }

  isMeetTab() {
    return this.tabName.toLowerCase().includes('meet.google.com');
  }

  _parseTabName(label) {
    if (!label) return 'Unknown Tab';
    const cleaned = label.replace(/^Tab:\s*/i, '');
    return cleaned || 'Unknown Tab';
  }
}

export { TabCapture };

if (typeof window !== 'undefined') {
  window.TabCapture = TabCapture;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/tab-capture.test.js`
Expected: PASS

**Step 5: Run lint**

Run: `npm run lint -- lib/tab-capture.js tests/unit/tab-capture.test.js`
Expected: No errors

**Step 6: Commit**

```bash
git add lib/tab-capture.js tests/unit/tab-capture.test.js
git commit -m "feat: add TabCapture class wrapping getDisplayMedia"
```

---

### Task 5: Wire Tab Capture into inject.js

**Files:**
- Modify: `inject.js:382-425` (loadWallArtImage — add tabCapture branch)
- Modify: `inject.js` (message handler — add START_TAB_CAPTURE / STOP_TAB_CAPTURE)
- Modify: `content.js` (add tab-capture.js to injection list, relay new messages)

**Step 1: Add tab-capture.js to content.js script injection list**

Same pattern as Task 2 Step 1. Add `'lib/tab-capture.js'` to the script injection array, near `slideshow-player.js`.

**Step 2: Add message handlers in inject.js for tab capture lifecycle**

In inject.js, in the `window.addEventListener('message', ...)` handler block, add cases for:

```js
    if (event.data.type === 'START_TAB_CAPTURE') {
      const wallArtId = event.data.wallArtId;
      try {
        const capture = new window.TabCapture();

        if (capture.isMeetTab && capture.isMeetTab()) {
          console.warn('[Meet Overlay] Cannot capture Meet tab — would cause recursion');
          return;
        }

        const video = await capture.start();

        if (capture.isMeetTab()) {
          console.warn('[Meet Overlay] Cannot capture Meet tab');
          capture.stop();
          return;
        }

        wallArtImages.set(wallArtId, video);
        tabCaptures.set(wallArtId, capture);

        capture.onEnded(() => {
          console.log('[Meet Overlay] Tab capture ended for:', wallArtId);
          wallArtImages.delete(wallArtId);
          tabCaptures.delete(wallArtId);
          // Post message back so popup can update UI
          window.postMessage({
            source: 'meet-overlay-page',
            type: 'TAB_CAPTURE_ENDED',
            wallArtId,
          }, '*');
        });

        console.log('[Meet Overlay] Tab capture started:', capture.tabName);
        window.postMessage({
          source: 'meet-overlay-page',
          type: 'TAB_CAPTURE_STARTED',
          wallArtId,
          tabName: capture.tabName,
        }, '*');
      } catch (e) {
        console.error('[Meet Overlay] Tab capture failed:', e);
      }
    }

    if (event.data.type === 'STOP_TAB_CAPTURE') {
      const wallArtId = event.data.wallArtId;
      const capture = tabCaptures.get(wallArtId);
      if (capture) {
        capture.stop();
        wallArtImages.delete(wallArtId);
        tabCaptures.delete(wallArtId);
      }
    }
```

Also add a `tabCaptures` Map near the top of inject.js (where `wallArtImages` is declared):

```js
  const tabCaptures = new Map();
```

**Step 3: Add tabCapture branch to loadWallArtImage**

In the `loadWallArtImage` function, add before the static image fallback:

```js
    // Tab capture is loaded via START_TAB_CAPTURE message, not here
    if (contentType === 'tabCapture') {
      return;
    }
```

**Step 4: Add message relay in content.js**

Add `'START_TAB_CAPTURE'` and `'STOP_TAB_CAPTURE'` to the message types that content.js relays from popup to page context. Also relay `'TAB_CAPTURE_STARTED'` and `'TAB_CAPTURE_ENDED'` back from page context to popup.

**Step 5: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add inject.js content.js
git commit -m "feat: wire tab capture lifecycle into inject.js message handling"
```

---

### Task 6: Tab Capture UI in Extension Popup

**Files:**
- Modify: `popup.html` (add "Live Tab" art source tab)
- Modify: `popup.js` (add tab capture button, status display, reconnection)

**Step 1: Add "Live Tab" art source tab button in popup.html**

In the art source tabs div (same location as Task 3 Step 1), add:

```html
  <button type="button" class="art-source-tab" data-source="livetab">Live Tab</button>
```

**Step 2: Add live tab content section in popup.html**

After the slideshow source content div, add:

```html
<!-- Live Tab Source Content -->
<div id="art-source-livetab" class="art-source-content hidden">
  <div class="form-group">
    <p class="help-text">
      Capture any browser tab and display it in this region — YouTube, dashboards, websites, anything.
    </p>
    <button type="button" id="livetab-capture-btn" class="btn btn-primary">
      Select a Tab to Capture
    </button>
    <div id="livetab-status" class="livetab-status hidden">
      <span class="livetab-badge">LIVE</span>
      <span id="livetab-name"></span>
      <button type="button" id="livetab-stop-btn" class="btn btn-small btn-danger">Stop</button>
    </div>
    <div id="livetab-reconnect" class="livetab-reconnect hidden">
      <p>Tab closed or stream ended.</p>
      <button type="button" id="livetab-reconnect-btn" class="btn btn-secondary">
        Reconnect
      </button>
    </div>
  </div>
</div>
```

**Step 3: Add live tab JS logic in popup.js**

Handle:
- `livetab-capture-btn` click → send `START_TAB_CAPTURE` message to content script with the current wall art region ID
- Listen for `TAB_CAPTURE_STARTED` response → show `livetab-status` with tab name and LIVE badge, hide capture button
- Listen for `TAB_CAPTURE_ENDED` → hide status, show `livetab-reconnect`
- `livetab-stop-btn` click → send `STOP_TAB_CAPTURE`
- `livetab-reconnect-btn` click → send `START_TAB_CAPTURE` again
- On save: set `overlay.art.contentType = 'tabCapture'`, `overlay.art.src = null`

**Step 4: Add CSS for LIVE badge**

In popup.html's `<style>` block, add:

```css
.livetab-badge {
  display: inline-block;
  background: #e53e3e;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 1px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

**Step 5: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 6: Test manually end-to-end**

1. Open Google Meet with extension loaded
2. Open popup → Add wall art → Art tab → Live Tab
3. Click "Select a Tab to Capture"
4. Chrome's tab picker appears — select a YouTube tab
5. Verify the live feed renders in the wall region with perspective transform
6. Verify person occlusion works (your head appears in front of the live feed)
7. Close the YouTube tab → verify reconnect prompt appears
8. Click reconnect → verify picker reappears

**Step 7: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add live tab capture UI to wall art picker"
```

---

### Task 7: Final Validation

**Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Run dead code detection**

Run: `npm run knip`
Expected: No new unused exports

**Step 5: Run integration tests**

Run: `npm run test:integration`
Expected: All pass (tab capture may need mocking in integration context)

**Step 6: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address lint/type/test issues from rich content types"
```
