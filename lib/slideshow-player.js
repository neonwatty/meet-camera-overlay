/**
 * SlideshowPlayer — plays a sequence of image slides with transitions.
 * Duck-type compatible with AnimatedImage (update, currentFrame, width, height).
 * Classic script for page-context injection + ES module export for testing.
 */

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_INTERVAL_S = 30;
const DEFAULT_TRANSITION = 'fade';
const DEFAULT_TRANSITION_MS = 1000;
const VALID_TRANSITIONS = ['none', 'fade', 'slide-left'];

class SlideshowPlayer {
  /**
   * @param {Array<{src: string, name: string}>} slides
   * @param {object} [options]
   * @param {number} [options.intervalSeconds]
   * @param {string} [options.transition]
   * @param {number} [options.transitionDurationMs]
   * @param {boolean} [options.shuffle]
   */
  constructor(slides, options = {}) {
    if (!Array.isArray(slides) || slides.length < 2) {
      throw new Error('SlideshowPlayer requires at least 2 slides');
    }

    this.slides = slides;
    this.intervalMs = (options.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    this.transition = VALID_TRANSITIONS.includes(options.transition)
      ? options.transition
      : DEFAULT_TRANSITION;
    this.transitionDurationMs = options.transitionDurationMs ?? DEFAULT_TRANSITION_MS;
    this.shuffle = options.shuffle ?? false;

    this.width = DEFAULT_WIDTH;
    this.height = DEFAULT_HEIGHT;

    this.currentSlideIndex = 0;
    this.nextSlideIndex = -1;
    this.transitioning = false;
    this.transitionProgress = 0;

    this._lastAdvanceTime = 0;
    this._transitionStartTime = 0;
    this._firstUpdate = true;

    this._canvas = new OffscreenCanvas(this.width, this.height);
    this._ctx = this._canvas.getContext('2d');

    this._images = [];
    this._loaded = [];
    this._loadImages();
  }

  _loadImages() {
    for (let i = 0; i < this.slides.length; i++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      this._loaded.push(false);
      img.onload = () => {
        this._loaded[i] = true;
      };
      img.src = this.slides[i].src;
      this._images.push(img);
    }
  }

  get currentFrame() {
    return this._canvas;
  }

  /**
   * Called every animation frame. Advances slides and renders.
   * @param {number} timestamp — DOMHighResTimeStamp from requestAnimationFrame
   */
  update(timestamp) {
    if (this._firstUpdate) {
      this._firstUpdate = false;
      this._lastAdvanceTime = timestamp;
      this._render();
      return;
    }

    if (this.transitioning) {
      this._updateTransition(timestamp);
    } else {
      this._checkAdvance(timestamp);
    }

    this._render();
  }

  _checkAdvance(timestamp) {
    const elapsed = timestamp - this._lastAdvanceTime;
    if (elapsed < this.intervalMs) return;

    const next = this._findNextLoadedIndex();
    if (next === -1) return;

    if (this.transition === 'none') {
      this.currentSlideIndex = next;
      this._lastAdvanceTime = timestamp;
    } else {
      this.nextSlideIndex = next;
      this.transitioning = true;
      this.transitionProgress = 0;
      this._transitionStartTime = timestamp;
    }
  }

  _findNextLoadedIndex() {
    const count = this.slides.length;
    for (let offset = 1; offset <= count; offset++) {
      const idx = (this.currentSlideIndex + offset) % count;
      if (this._loaded[idx]) return idx;
    }
    return -1;
  }

  _updateTransition(timestamp) {
    const elapsed = timestamp - this._transitionStartTime;
    this.transitionProgress = Math.min(elapsed / this.transitionDurationMs, 1);

    if (this.transitionProgress >= 1) {
      this.currentSlideIndex = this.nextSlideIndex;
      this.nextSlideIndex = -1;
      this.transitioning = false;
      this.transitionProgress = 0;
      this._lastAdvanceTime = timestamp;
    }
  }

  _render() {
    this._ctx.clearRect(0, 0, this.width, this.height);

    const currentImg = this._images[this.currentSlideIndex];
    if (!this._loaded[this.currentSlideIndex]) return;

    if (!this.transitioning) {
      this._ctx.drawImage(currentImg, 0, 0, this.width, this.height);
      return;
    }

    if (this.transition === 'fade') {
      this._renderFade(currentImg);
    } else if (this.transition === 'slide-left') {
      this._renderSlideLeft(currentImg);
    }
  }

  _renderFade(currentImg) {
    const nextImg = this._images[this.nextSlideIndex];
    const t = this.transitionProgress;

    this._ctx.save();
    this._ctx.globalAlpha = 1 - t;
    this._ctx.drawImage(currentImg, 0, 0, this.width, this.height);
    this._ctx.restore();

    this._ctx.save();
    this._ctx.globalAlpha = t;
    this._ctx.drawImage(nextImg, 0, 0, this.width, this.height);
    this._ctx.restore();
  }

  _renderSlideLeft(currentImg) {
    const nextImg = this._images[this.nextSlideIndex];
    const t = this.transitionProgress;
    const offset = t * this.width;

    this._ctx.drawImage(currentImg, -offset, 0, this.width, this.height);
    this._ctx.drawImage(nextImg, this.width - offset, 0, this.width, this.height);
  }

  reset() {
    this.currentSlideIndex = 0;
    this.nextSlideIndex = -1;
    this.transitioning = false;
    this.transitionProgress = 0;
    this._lastAdvanceTime = 0;
    this._transitionStartTime = 0;
    this._firstUpdate = true;
  }
}

// Dual export: window global for page context, ES module export for testing
if (typeof window !== 'undefined') {
  window.SlideshowPlayer = SlideshowPlayer;
}

export { SlideshowPlayer };
