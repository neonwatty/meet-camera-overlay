/**
 * Jiggle Compensator Module
 *
 * Stabilizes wall art regions by tracking background feature points
 * and compensating for small camera movements (desk bumps, typing, etc.)
 *
 * Depends on window._FeatureTracking (feature-tracking.js).
 */

/**
 * JiggleCompensator - Tracks background features and compensates for camera shake
 */
class JiggleCompensator {
  constructor() {
    /** @type {Array} */
    this.features = [];
    /** @type {ImageData|null} */
    this.prevFrame = null;
    /** @type {number} */
    this.frameCount = 0;
    /** @type {{dx: number, dy: number, scale: number, rotation: number}} */
    this.cumulativeTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
    /** @type {boolean} */
    this.initialized = false;
    /** @type {boolean} */
    this.enabled = true;
    /** @type {HTMLCanvasElement|null} */
    this._workCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._workCtx = null;
    /** @type {number} */
    this._lastResetTime = 0;
    /** @type {Function|null} */
    this.onReset = null;
  }

  /**
   * Get the feature tracking API
   * @returns {Object}
   * @private
   */
  get _ft() {
    return window._FeatureTracking;
  }

  /**
   * Get dimensions from a video or canvas source
   * @private
   */
  _getSourceDimensions(source) {
    if ('videoWidth' in source && source.videoWidth > 0) {
      return { width: source.videoWidth, height: source.videoHeight };
    }
    return { width: source.width, height: source.height };
  }

  /**
   * Initialize the compensator with the first frame
   * @param {HTMLVideoElement|HTMLCanvasElement} source
   * @param {ImageData|null} personMask
   */
  initialize(source, personMask = null) {
    if (!this._workCanvas) {
      this._workCanvas = document.createElement('canvas');
      this._workCtx = this._workCanvas.getContext('2d', { willReadFrequently: true });
    }

    const { width, height } = this._getSourceDimensions(source);
    const ft = this._ft;

    this._workCanvas.width = Math.floor(width / ft.CONFIG.DOWNSAMPLE_FACTOR);
    this._workCanvas.height = Math.floor(height / ft.CONFIG.DOWNSAMPLE_FACTOR);

    this._workCtx.drawImage(source, 0, 0, this._workCanvas.width, this._workCanvas.height);

    const frame = this._workCtx.getImageData(0, 0, this._workCanvas.width, this._workCanvas.height);
    const grayFrame = ft.toGrayscale(frame);

    const downsampledMask = personMask
      ? ft.downsampleMask(personMask, width, height, this._workCanvas.width, this._workCanvas.height)
      : null;
    this.features = ft.detectFeatures(grayFrame, downsampledMask);

    this.prevFrame = grayFrame;
    this.cumulativeTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
    this.initialized = true;
    this._lastResetTime = performance.now();

    console.log(`[JiggleCompensator] Initialized with ${this.features.length} features`);
  }

  /**
   * Process a new frame and compute compensation transform
   * @param {HTMLVideoElement|HTMLCanvasElement} source
   * @param {ImageData|null} personMask
   * @returns {{dx: number, dy: number, scale: number, rotation: number}}
   */
  process(source, personMask = null) {
    const ft = this._ft;

    if (!this.enabled || !this.initialized) {
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    this.frameCount++;

    if (this.frameCount % ft.CONFIG.SKIP_FRAMES !== 0) {
      return this.cumulativeTransform;
    }

    this._workCtx.drawImage(source, 0, 0, this._workCanvas.width, this._workCanvas.height);
    const frame = this._workCtx.getImageData(0, 0, this._workCanvas.width, this._workCanvas.height);
    const grayFrame = ft.toGrayscale(frame);

    const { trackedPoints, lostCount } = ft.trackFeatures(this.prevFrame, grayFrame, this.features);

    if (lostCount > this.features.length * 0.5 || trackedPoints.length < 10) {
      console.log('[JiggleCompensator] Lost too many features, reinitializing...');
      this.initialize(source, personMask);
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    const frameTransform = ft.computeTransform(this.features, trackedPoints);

    const avgMotion = Math.sqrt(
      frameTransform.dx * frameTransform.dx + frameTransform.dy * frameTransform.dy
    );
    if (avgMotion > ft.CONFIG.LARGE_MOTION_THRESHOLD) {
      console.log(`[JiggleCompensator] Large motion detected (${avgMotion.toFixed(1)}px), resetting...`);
      this._triggerReset();
      this.initialize(source, personMask);
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    this.cumulativeTransform.dx -= frameTransform.dx * ft.CONFIG.DOWNSAMPLE_FACTOR;
    this.cumulativeTransform.dy -= frameTransform.dy * ft.CONFIG.DOWNSAMPLE_FACTOR;

    const totalDrift = Math.sqrt(
      this.cumulativeTransform.dx * this.cumulativeTransform.dx +
      this.cumulativeTransform.dy * this.cumulativeTransform.dy
    );
    if (totalDrift > ft.CONFIG.DRIFT_THRESHOLD) {
      console.log(`[JiggleCompensator] Excessive drift (${totalDrift.toFixed(1)}px), resetting...`);
      this._triggerReset();
      this.initialize(source, personMask);
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    this.features = trackedPoints;
    this.prevFrame = grayFrame;

    return this.cumulativeTransform;
  }

  /**
   * Reset the compensator
   */
  reset() {
    this.features = [];
    this.prevFrame = null;
    this.cumulativeTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
    this.initialized = false;
    this.frameCount = 0;
  }

  /**
   * Enable/disable compensation
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.cumulativeTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }
  }

  /** @private */
  _triggerReset() {
    if (this.onReset && (performance.now() - this._lastResetTime) > 1000) {
      this.onReset();
    }
  }

  /**
   * Apply compensation transform to a region
   * @param {Object} region
   * @param {{dx: number, dy: number}} transform
   * @returns {Object}
   */
  static applyToRegion(region, transform) {
    if (!transform || (transform.dx === 0 && transform.dy === 0)) {
      return region;
    }

    const dxPercent = (transform.dx / 1280) * 100;
    const dyPercent = (transform.dy / 720) * 100;

    return {
      topLeft: { x: region.topLeft.x + dxPercent, y: region.topLeft.y + dyPercent },
      topRight: { x: region.topRight.x + dxPercent, y: region.topRight.y + dyPercent },
      bottomLeft: { x: region.bottomLeft.x + dxPercent, y: region.bottomLeft.y + dyPercent },
      bottomRight: { x: region.bottomRight.x + dxPercent, y: region.bottomRight.y + dyPercent }
    };
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    return {
      initialized: this.initialized,
      enabled: this.enabled,
      featureCount: this.features.length,
      cumulativeDx: this.cumulativeTransform.dx.toFixed(2),
      cumulativeDy: this.cumulativeTransform.dy.toFixed(2)
    };
  }
}

// Export for use in different contexts
if (typeof window !== 'undefined') {
  window.JiggleCompensator = JiggleCompensator;
}

// Also export for module systems
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  // eslint-disable-next-line no-undef
  module.exports = { JiggleCompensator };
}
