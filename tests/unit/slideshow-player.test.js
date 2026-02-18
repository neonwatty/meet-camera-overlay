import { describe, it, expect } from 'vitest';

// Mock OffscreenCanvas and Image for Node test environment
class MockCanvasContext {
  constructor() {
    this.operations = [];
    this.globalAlpha = 1;
  }

  clearRect(x, y, w, h) {
    this.operations.push({ op: 'clearRect', args: [x, y, w, h] });
  }

  drawImage(source, x, y, w, h) {
    const args = w !== undefined ? [source, x, y, w, h] : [source, x, y];
    this.operations.push({ op: 'drawImage', args });
  }

  save() {
    this.operations.push({ op: 'save' });
  }

  restore() {
    this.operations.push({ op: 'restore' });
  }
}

class MockOffscreenCanvas {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this._ctx = new MockCanvasContext();
  }

  getContext() {
    return this._ctx;
  }
}

class MockImage {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.crossOrigin = null;
    this.src = '';
    this._onloadHandler = null;
  }

  set onload(fn) {
    this._onloadHandler = fn;
  }

  get onload() {
    return this._onloadHandler;
  }

  _triggerLoad(w = 1280, h = 720) {
    this.width = w;
    this.height = h;
    if (this._onloadHandler) {
      this._onloadHandler();
    }
  }
}

// Install globals before importing
globalThis.OffscreenCanvas = MockOffscreenCanvas;
globalThis.Image = MockImage;
globalThis.window = globalThis.window || {};

const { SlideshowPlayer } = await import('../../lib/slideshow-player.js');

function makeSlides(count = 3) {
  const slides = [];
  for (let i = 0; i < count; i++) {
    slides.push({ src: `https://example.com/slide${i}.jpg`, name: `Slide ${i}` });
  }
  return slides;
}

function loadAllImages(player) {
  for (const img of player._images) {
    img._triggerLoad(1280, 720);
  }
}

describe('SlideshowPlayer', () => {
  describe('constructor', () => {
    it('throws if fewer than 2 slides', () => {
      expect(() => new SlideshowPlayer([{ src: 'a.jpg', name: 'a' }])).toThrow();
      expect(() => new SlideshowPlayer([])).toThrow();
    });

    it('accepts 2 or more slides', () => {
      const player = new SlideshowPlayer(makeSlides(2));
      expect(player).toBeDefined();
    });

    it('applies default options', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(player.intervalMs).toBe(30000);
      expect(player.transition).toBe('fade');
      expect(player.transitionDurationMs).toBe(1000);
      expect(player.shuffle).toBe(false);
    });

    it('accepts custom options', () => {
      const player = new SlideshowPlayer(makeSlides(), {
        intervalSeconds: 10,
        transition: 'none',
        transitionDurationMs: 500,
        shuffle: true,
      });
      expect(player.intervalMs).toBe(10000);
      expect(player.transition).toBe('none');
      expect(player.transitionDurationMs).toBe(500);
      expect(player.shuffle).toBe(true);
    });

    it('creates Image objects with crossOrigin for each slide', () => {
      const slides = makeSlides(3);
      const player = new SlideshowPlayer(slides);
      expect(player._images).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(player._images[i].crossOrigin).toBe('anonymous');
        expect(player._images[i].src).toBe(slides[i].src);
      }
    });

    it('creates an OffscreenCanvas with default 1280x720', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(player.width).toBe(1280);
      expect(player.height).toBe(720);
    });
  });

  describe('duck-type interface (AnimatedImage compatibility)', () => {
    it('has an update method', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(typeof player.update).toBe('function');
    });

    it('has a currentFrame getter that returns the canvas', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(player.currentFrame).toBeDefined();
      expect(player.currentFrame.width).toBe(1280);
      expect(player.currentFrame.height).toBe(720);
    });

    it('has width and height properties', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(player.width).toBe(1280);
      expect(player.height).toBe(720);
    });
  });

  describe('slide tracking', () => {
    it('starts at slide 0', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(player.currentSlideIndex).toBe(0);
    });

    it('is not transitioning initially', () => {
      const player = new SlideshowPlayer(makeSlides());
      expect(player.transitioning).toBe(false);
      expect(player.transitionProgress).toBe(0);
    });
  });

  describe('update() — slide advancement', () => {
    it('does not advance before interval elapses', () => {
      const player = new SlideshowPlayer(makeSlides(), { intervalSeconds: 10 });
      loadAllImages(player);
      player.update(0);
      player.update(5000);
      expect(player.currentSlideIndex).toBe(0);
      expect(player.transitioning).toBe(false);
    });

    it('begins transition after interval elapses', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 10,
        transition: 'fade',
        transitionDurationMs: 1000,
      });
      loadAllImages(player);
      player.update(0);
      player.update(10001);
      expect(player.transitioning).toBe(true);
      expect(player.nextSlideIndex).toBe(1);
    });

    it('completes transition after transitionDurationMs', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 10,
        transition: 'fade',
        transitionDurationMs: 1000,
      });
      loadAllImages(player);
      player.update(0);
      player.update(10001);
      expect(player.transitioning).toBe(true);
      player.update(11002);
      expect(player.transitioning).toBe(false);
      expect(player.currentSlideIndex).toBe(1);
    });

    it('wraps around to first slide after last', () => {
      const player = new SlideshowPlayer(makeSlides(2), {
        intervalSeconds: 1,
        transition: 'none',
      });
      loadAllImages(player);
      player.update(0);
      player.update(1001);
      expect(player.currentSlideIndex).toBe(1);
      player.update(2002);
      expect(player.currentSlideIndex).toBe(0);
    });
  });

  describe('transition: none', () => {
    it('hard-cuts to next slide without transition', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 5,
        transition: 'none',
      });
      loadAllImages(player);
      player.update(0);
      player.update(5001);
      expect(player.currentSlideIndex).toBe(1);
      expect(player.transitioning).toBe(false);
    });
  });

  describe('transition: fade', () => {
    it('sets transitionProgress during fade', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 5,
        transition: 'fade',
        transitionDurationMs: 1000,
      });
      loadAllImages(player);
      player.update(0);
      player.update(5001);
      expect(player.transitioning).toBe(true);
      player.update(5501);
      expect(player.transitionProgress).toBeGreaterThan(0);
      expect(player.transitionProgress).toBeLessThan(1);
    });

    it('renders with globalAlpha during fade', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 5,
        transition: 'fade',
        transitionDurationMs: 1000,
      });
      loadAllImages(player);
      player.update(0);
      player.update(5001);
      player.update(5500);
      const ctx = player.currentFrame.getContext('2d');
      const drawOps = ctx.operations.filter(op => op.op === 'drawImage');
      expect(drawOps.length).toBeGreaterThan(0);
    });
  });

  describe('transition: slide-left', () => {
    it('sets transitionProgress during slide-left', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 5,
        transition: 'slide-left',
        transitionDurationMs: 1000,
      });
      loadAllImages(player);
      player.update(0);
      player.update(5001);
      expect(player.transitioning).toBe(true);
      player.update(5500);
      expect(player.transitionProgress).toBeGreaterThan(0);
      expect(player.transitionProgress).toBeLessThan(1);
    });

    it('completes slide-left transition', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 5,
        transition: 'slide-left',
        transitionDurationMs: 1000,
      });
      loadAllImages(player);
      player.update(0);
      player.update(5001);
      player.update(6002);
      expect(player.transitioning).toBe(false);
      expect(player.currentSlideIndex).toBe(1);
    });
  });

  describe('reset()', () => {
    it('resets to initial state', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 1,
        transition: 'none',
      });
      loadAllImages(player);
      player.update(0);
      player.update(1001);
      expect(player.currentSlideIndex).toBe(1);

      player.reset();
      expect(player.currentSlideIndex).toBe(0);
      expect(player.transitioning).toBe(false);
      expect(player.transitionProgress).toBe(0);
    });
  });

  describe('image loading', () => {
    it('tracks loaded state per image', () => {
      const player = new SlideshowPlayer(makeSlides(3));
      expect(player._loaded[0]).toBe(false);
      player._images[0]._triggerLoad();
      expect(player._loaded[0]).toBe(true);
    });

    it('does not advance to unloaded slide', () => {
      const player = new SlideshowPlayer(makeSlides(3), {
        intervalSeconds: 1,
        transition: 'none',
      });
      player._images[0]._triggerLoad();
      // slide 1 not loaded
      player.update(0);
      player.update(1001);
      expect(player.currentSlideIndex).toBe(0);
    });
  });

  describe('exports', () => {
    it('exports SlideshowPlayer class', () => {
      expect(SlideshowPlayer).toBeDefined();
      expect(typeof SlideshowPlayer).toBe('function');
    });

    it('assigns to window.SlideshowPlayer', () => {
      expect(globalThis.window.SlideshowPlayer).toBe(SlideshowPlayer);
    });
  });
});
