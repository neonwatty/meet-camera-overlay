/**
 * Jiggle Compensator Module
 *
 * Stabilizes wall art regions by tracking background feature points
 * and compensating for small camera movements (desk bumps, typing, etc.)
 *
 * Uses Harris corner detection for feature points and
 * Lucas-Kanade style optical flow for tracking.
 */

/**
 * Configuration constants
 */
const CONFIG = {
  // Feature detection
  MAX_FEATURES: 50,           // Maximum number of feature points to track
  HARRIS_K: 0.04,             // Harris corner detector sensitivity
  CORNER_THRESHOLD: 0.01,     // Minimum corner response threshold
  MIN_DISTANCE: 20,           // Minimum distance between features (pixels)

  // Tracking
  SEARCH_WINDOW: 15,          // Search window size for tracking (pixels)
  MAX_ITERATIONS: 10,         // Max iterations for Lucas-Kanade
  CONVERGENCE_THRESHOLD: 0.1, // Stop when movement < this

  // Motion detection
  LARGE_MOTION_THRESHOLD: 20, // Reset if average motion > this (pixels)
  DRIFT_THRESHOLD: 50,        // Reset if cumulative drift > this (pixels)

  // Performance
  DOWNSAMPLE_FACTOR: 4,       // Process at 1/4 resolution for speed
  SKIP_FRAMES: 2              // Only track every Nth frame
};

/**
 * @typedef {Object} FeaturePoint
 * @property {number} x - X coordinate (in full resolution)
 * @property {number} y - Y coordinate (in full resolution)
 * @property {number} response - Harris corner response value
 */

/**
 * @typedef {Object} Transform
 * @property {number} dx - Translation in X
 * @property {number} dy - Translation in Y
 * @property {number} scale - Scale factor (1.0 = no scale)
 * @property {number} rotation - Rotation in radians
 */

/**
 * JiggleCompensator - Tracks background features and compensates for camera shake
 */
class JiggleCompensator {
  constructor() {
    /** @type {FeaturePoint[]} */
    this.features = [];

    /** @type {ImageData|null} */
    this.prevFrame = null;

    /** @type {number} */
    this.frameCount = 0;

    /** @type {Transform} */
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
   * Get dimensions from a video or canvas source
   * @param {HTMLVideoElement|HTMLCanvasElement} source
   * @returns {{width: number, height: number}}
   * @private
   */
  _getSourceDimensions(source) {
    // Check if it's a video element by looking for videoWidth property
    if ('videoWidth' in source && source.videoWidth > 0) {
      return { width: source.videoWidth, height: source.videoHeight };
    }
    // Otherwise it's a canvas
    return { width: source.width, height: source.height };
  }

  /**
   * Initialize the compensator with the first frame
   * @param {HTMLVideoElement|HTMLCanvasElement} source - Video or canvas source
   * @param {ImageData|null} personMask - Person mask to exclude from feature detection
   */
  initialize(source, personMask = null) {
    // Create work canvas if needed
    if (!this._workCanvas) {
      this._workCanvas = document.createElement('canvas');
      this._workCtx = this._workCanvas.getContext('2d', { willReadFrequently: true });
    }

    const { width, height } = this._getSourceDimensions(source);

    // Set downsampled size
    this._workCanvas.width = Math.floor(width / CONFIG.DOWNSAMPLE_FACTOR);
    this._workCanvas.height = Math.floor(height / CONFIG.DOWNSAMPLE_FACTOR);

    // Draw downsampled frame
    this._workCtx.drawImage(source, 0, 0, this._workCanvas.width, this._workCanvas.height);

    // Convert to grayscale
    const frame = this._workCtx.getImageData(0, 0, this._workCanvas.width, this._workCanvas.height);
    const grayFrame = this._toGrayscale(frame);

    // Detect features in the background (excluding person)
    const downsampledMask = personMask ? this._downsampleMask(personMask, width, height) : null;
    this.features = this._detectFeatures(grayFrame, downsampledMask);

    // Store frame for next comparison
    this.prevFrame = grayFrame;
    this.cumulativeTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
    this.initialized = true;
    this._lastResetTime = performance.now();

    console.log(`[JiggleCompensator] Initialized with ${this.features.length} features`);
  }

  /**
   * Process a new frame and compute compensation transform
   * @param {HTMLVideoElement|HTMLCanvasElement} source - Video or canvas source
   * @param {ImageData|null} personMask - Person mask to exclude
   * @returns {Transform} The compensation transform to apply
   */
  process(source, personMask = null) {
    if (!this.enabled || !this.initialized) {
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    this.frameCount++;

    // Skip frames for performance
    if (this.frameCount % CONFIG.SKIP_FRAMES !== 0) {
      return this.cumulativeTransform;
    }

    // Draw downsampled frame
    this._workCtx.drawImage(source, 0, 0, this._workCanvas.width, this._workCanvas.height);
    const frame = this._workCtx.getImageData(0, 0, this._workCanvas.width, this._workCanvas.height);
    const grayFrame = this._toGrayscale(frame);

    // Track features
    const { trackedPoints, lostCount } = this._trackFeatures(this.prevFrame, grayFrame, this.features);

    // If we lost too many features, reinitialize
    if (lostCount > this.features.length * 0.5 || trackedPoints.length < 10) {
      console.log('[JiggleCompensator] Lost too many features, reinitializing...');
      this.initialize(source, personMask);
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    // Compute transform from tracked points
    const frameTransform = this._computeTransform(this.features, trackedPoints);

    // Check for large motion (intentional camera move)
    const avgMotion = Math.sqrt(frameTransform.dx * frameTransform.dx + frameTransform.dy * frameTransform.dy);
    if (avgMotion > CONFIG.LARGE_MOTION_THRESHOLD) {
      console.log(`[JiggleCompensator] Large motion detected (${avgMotion.toFixed(1)}px), resetting...`);
      this._triggerReset();
      this.initialize(source, personMask);
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    // Accumulate transform (we want to COUNTERACT the motion)
    this.cumulativeTransform.dx -= frameTransform.dx * CONFIG.DOWNSAMPLE_FACTOR;
    this.cumulativeTransform.dy -= frameTransform.dy * CONFIG.DOWNSAMPLE_FACTOR;

    // Check for excessive drift
    const totalDrift = Math.sqrt(
      this.cumulativeTransform.dx * this.cumulativeTransform.dx +
      this.cumulativeTransform.dy * this.cumulativeTransform.dy
    );
    if (totalDrift > CONFIG.DRIFT_THRESHOLD) {
      console.log(`[JiggleCompensator] Excessive drift (${totalDrift.toFixed(1)}px), resetting...`);
      this._triggerReset();
      this.initialize(source, personMask);
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    // Update features and previous frame
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
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.cumulativeTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }
  }

  /**
   * Convert ImageData to grayscale
   * @private
   */
  _toGrayscale(imageData) {
    const gray = new ImageData(imageData.width, imageData.height);
    const src = imageData.data;
    const dst = gray.data;

    for (let i = 0; i < src.length; i += 4) {
      // Luminance formula
      const g = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
      dst[i] = dst[i + 1] = dst[i + 2] = g;
      dst[i + 3] = 255;
    }

    return gray;
  }

  /**
   * Downsample a person mask
   * @private
   */
  _downsampleMask(mask, origWidth, origHeight) {
    const dw = this._workCanvas.width;
    const dh = this._workCanvas.height;
    const downsampled = new Uint8Array(dw * dh);

    const scaleX = origWidth / dw;
    const scaleY = origHeight / dh;

    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcY = Math.floor(y * scaleY);
        const srcIdx = (srcY * origWidth + srcX) * 4;
        // Assume mask is in alpha or red channel
        downsampled[y * dw + x] = mask.data[srcIdx] > 128 ? 255 : 0;
      }
    }

    return downsampled;
  }

  /**
   * Detect Harris corners as feature points
   * @private
   */
  _detectFeatures(grayFrame, personMask = null) {
    const w = grayFrame.width;
    const h = grayFrame.height;
    const data = grayFrame.data;

    // Compute gradients
    const Ix = new Float32Array(w * h);
    const Iy = new Float32Array(w * h);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        // Sobel-like gradient
        Ix[idx] = (data[((y) * w + (x + 1)) * 4] - data[((y) * w + (x - 1)) * 4]) / 2;
        Iy[idx] = (data[((y + 1) * w + x) * 4] - data[((y - 1) * w + x) * 4]) / 2;
      }
    }

    // Compute Harris response
    const responses = [];
    const windowSize = 3;

    for (let y = windowSize; y < h - windowSize; y += 3) {
      for (let x = windowSize; x < w - windowSize; x += 3) {
        // Skip if in person mask
        if (personMask && personMask[y * w + x] > 128) {
          continue;
        }

        let sumIx2 = 0, sumIy2 = 0, sumIxIy = 0;

        // Sum over window
        for (let wy = -windowSize; wy <= windowSize; wy++) {
          for (let wx = -windowSize; wx <= windowSize; wx++) {
            const idx = (y + wy) * w + (x + wx);
            const ix = Ix[idx];
            const iy = Iy[idx];
            sumIx2 += ix * ix;
            sumIy2 += iy * iy;
            sumIxIy += ix * iy;
          }
        }

        // Harris response: det(M) - k * trace(M)^2
        const det = sumIx2 * sumIy2 - sumIxIy * sumIxIy;
        const trace = sumIx2 + sumIy2;
        const response = det - CONFIG.HARRIS_K * trace * trace;

        if (response > CONFIG.CORNER_THRESHOLD) {
          responses.push({ x, y, response });
        }
      }
    }

    // Sort by response and take top features
    responses.sort((a, b) => b.response - a.response);

    // Non-maximum suppression
    /** @type {FeaturePoint[]} */
    const features = [];
    for (const r of responses) {
      if (features.length >= CONFIG.MAX_FEATURES) break;

      // Check distance to existing features
      let tooClose = false;
      for (const f of features) {
        const dist = Math.sqrt((r.x - f.x) ** 2 + (r.y - f.y) ** 2);
        if (dist < CONFIG.MIN_DISTANCE / CONFIG.DOWNSAMPLE_FACTOR) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        features.push(r);
      }
    }

    return features;
  }

  /**
   * Track features using Lucas-Kanade optical flow
   * @private
   */
  _trackFeatures(prevFrame, currFrame, features) {
    const w = prevFrame.width;
    const h = prevFrame.height;
    const prevData = prevFrame.data;
    const currData = currFrame.data;

    const trackedPoints = [];
    let lostCount = 0;

    for (const feature of features) {
      const { x: fx, y: fy } = feature;
      const win = CONFIG.SEARCH_WINDOW;

      // Skip if too close to edge
      if (fx < win || fx >= w - win || fy < win || fy >= h - win) {
        lostCount++;
        continue;
      }

      // Lucas-Kanade iterative search
      let dx = 0, dy = 0;

      for (let iter = 0; iter < CONFIG.MAX_ITERATIONS; iter++) {
        let sumIx2 = 0, sumIy2 = 0, sumIxIy = 0;
        let sumIxIt = 0, sumIyIt = 0;

        const nx = fx + dx;
        const ny = fy + dy;

        if (nx < win || nx >= w - win || ny < win || ny >= h - win) {
          break;
        }

        // Compute over window
        for (let wy = -win; wy <= win; wy++) {
          for (let wx = -win; wx <= win; wx++) {
            const px = Math.floor(fx + wx);
            const py = Math.floor(fy + wy);
            const cx = Math.floor(nx + wx);
            const cy = Math.floor(ny + wy);

            const prevIdx = (py * w + px) * 4;
            const currIdx = (cy * w + cx) * 4;

            const Ix = (prevData[(py * w + px + 1) * 4] - prevData[(py * w + px - 1) * 4]) / 2;
            const Iy = (prevData[((py + 1) * w + px) * 4] - prevData[((py - 1) * w + px) * 4]) / 2;
            const It = currData[currIdx] - prevData[prevIdx];

            sumIx2 += Ix * Ix;
            sumIy2 += Iy * Iy;
            sumIxIy += Ix * Iy;
            sumIxIt += Ix * It;
            sumIyIt += Iy * It;
          }
        }

        // Solve 2x2 system
        const det = sumIx2 * sumIy2 - sumIxIy * sumIxIy;
        if (Math.abs(det) < 1e-6) break;

        const vx = -(sumIy2 * sumIxIt - sumIxIy * sumIyIt) / det;
        const vy = -(sumIx2 * sumIyIt - sumIxIy * sumIxIt) / det;

        dx += vx;
        dy += vy;

        // Check convergence
        if (Math.abs(vx) < CONFIG.CONVERGENCE_THRESHOLD && Math.abs(vy) < CONFIG.CONVERGENCE_THRESHOLD) {
          break;
        }
      }

      // Validate tracked point
      const newX = fx + dx;
      const newY = fy + dy;

      if (newX >= 0 && newX < w && newY >= 0 && newY < h && Math.abs(dx) < win && Math.abs(dy) < win) {
        trackedPoints.push({ x: newX, y: newY, response: feature.response });
      } else {
        lostCount++;
      }
    }

    return { trackedPoints, lostCount };
  }

  /**
   * Compute translation transform from point correspondences
   * @private
   */
  _computeTransform(prevFeatures, currFeatures) {
    if (prevFeatures.length !== currFeatures.length || prevFeatures.length === 0) {
      return { dx: 0, dy: 0, scale: 1, rotation: 0 };
    }

    // Simple translation estimation (median of displacements)
    const dxs = [];
    const dys = [];

    for (let i = 0; i < prevFeatures.length; i++) {
      dxs.push(currFeatures[i].x - prevFeatures[i].x);
      dys.push(currFeatures[i].y - prevFeatures[i].y);
    }

    // Use median for robustness
    dxs.sort((a, b) => a - b);
    dys.sort((a, b) => a - b);

    const medianIdx = Math.floor(dxs.length / 2);

    return {
      dx: dxs[medianIdx],
      dy: dys[medianIdx],
      scale: 1,
      rotation: 0
    };
  }

  /**
   * Trigger reset callback
   * @private
   */
  _triggerReset() {
    if (this.onReset && (performance.now() - this._lastResetTime) > 1000) {
      this.onReset();
    }
  }

  /**
   * Apply compensation transform to a region
   * @param {Object} region - Wall region with corner points
   * @param {Transform} transform - Compensation transform
   * @returns {Object} Adjusted region
   */
  static applyToRegion(region, transform) {
    if (!transform || (transform.dx === 0 && transform.dy === 0)) {
      return region;
    }

    // Convert pixel offset to percentage
    // Assuming 1280x720 as reference resolution
    const dxPercent = (transform.dx / 1280) * 100;
    const dyPercent = (transform.dy / 720) * 100;

    return {
      topLeft: {
        x: region.topLeft.x + dxPercent,
        y: region.topLeft.y + dyPercent
      },
      topRight: {
        x: region.topRight.x + dxPercent,
        y: region.topRight.y + dyPercent
      },
      bottomLeft: {
        x: region.bottomLeft.x + dxPercent,
        y: region.bottomLeft.y + dyPercent
      },
      bottomRight: {
        x: region.bottomRight.x + dxPercent,
        y: region.bottomRight.y + dyPercent
      }
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
  module.exports = { JiggleCompensator, CONFIG };
}
