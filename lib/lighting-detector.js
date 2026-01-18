/**
 * Lighting Detector Module
 *
 * Detects lighting changes during meetings and triggers compensation
 * to maintain visual consistency for wall art and paint.
 *
 * Piggybacks on the segmentation loop (no extra overhead).
 * Uses a 20% brightness threshold and 7.5 second cooldown.
 */

/**
 * Configuration constants
 */
const CONFIG = {
  // Detection thresholds
  BRIGHTNESS_THRESHOLD: 0.20,    // 20% change triggers adjustment
  COLOR_TEMP_THRESHOLD: 0.15,    // 15% color temp change
  CONTRAST_THRESHOLD: 0.25,      // 25% contrast change

  // Cooldown
  COOLDOWN_MS: 7500,             // 7.5 seconds between adjustments

  // Sampling
  SAMPLE_GRID_SIZE: 8,           // 8x8 grid for sampling (64 points)
  MIN_SAMPLES: 20,               // Minimum valid samples needed

  // Smoothing
  HISTORY_SIZE: 5,               // Rolling average over 5 measurements

  // Art brightness adjustment range
  MIN_BRIGHTNESS_MULTIPLIER: 0.6,
  MAX_BRIGHTNESS_MULTIPLIER: 1.4
};

/**
 * @typedef {Object} LightingMetrics
 * @property {number} brightness - Average brightness (0-255)
 * @property {number} colorTemp - Color temperature (-1 to 1, negative=cool, positive=warm)
 * @property {number} contrast - Contrast ratio (0-1)
 */

/**
 * @typedef {Object} LightingChange
 * @property {boolean} changed - Whether lighting changed significantly
 * @property {number} brightnessDelta - Change in brightness (0-1)
 * @property {number} colorTempDelta - Change in color temp
 * @property {number} contrastDelta - Change in contrast
 * @property {number} artBrightnessMultiplier - Suggested multiplier for art brightness
 */

/**
 * LightingDetector - Monitors lighting conditions and triggers compensation
 */
class LightingDetector {
  constructor() {
    /** @type {LightingMetrics|null} */
    this.referenceMetrics = null;

    /** @type {LightingMetrics|null} */
    this.currentMetrics = null;

    /** @type {LightingMetrics[]} */
    this.metricsHistory = [];

    /** @type {number} */
    this.lastAdjustmentTime = 0;

    /** @type {boolean} */
    this.enabled = true;

    /** @type {boolean} */
    this.initialized = false;

    /** @type {number} */
    this.artBrightnessMultiplier = 1.0;

    /** @type {Function|null} */
    this.onLightingChange = null;
  }

  /**
   * Initialize with reference lighting conditions
   * @param {HTMLCanvasElement|HTMLVideoElement} source - Video or canvas source
   * @param {ImageData|null} personMask - Person mask to exclude
   * @param {Object|null} region - Wall region to sample (or null for full frame)
   */
  initialize(source, personMask = null, region = null) {
    this.referenceMetrics = this._measureLighting(source, personMask, region);
    this.currentMetrics = { ...this.referenceMetrics };
    this.metricsHistory = [this.referenceMetrics];
    this.artBrightnessMultiplier = 1.0;
    this.initialized = true;
    this.lastAdjustmentTime = 0;

    console.log('[LightingDetector] Initialized with reference:', this.referenceMetrics);
  }

  /**
   * Process a frame and check for lighting changes
   * @param {HTMLCanvasElement|HTMLVideoElement} source - Video or canvas source
   * @param {ImageData|null} personMask - Person mask to exclude
   * @param {Object|null} region - Wall region to sample
   * @returns {LightingChange} Lighting change information
   */
  process(source, personMask = null, region = null) {
    if (!this.enabled || !this.initialized) {
      return {
        changed: false,
        brightnessDelta: 0,
        colorTempDelta: 0,
        contrastDelta: 0,
        artBrightnessMultiplier: this.artBrightnessMultiplier
      };
    }

    // Measure current lighting
    const metrics = this._measureLighting(source, personMask, region);

    // Add to history for smoothing
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > CONFIG.HISTORY_SIZE) {
      this.metricsHistory.shift();
    }

    // Use smoothed metrics
    this.currentMetrics = this._getSmoothedMetrics();

    // Calculate deltas from reference
    const brightnessDelta = Math.abs(
      (this.currentMetrics.brightness - this.referenceMetrics.brightness) /
      Math.max(this.referenceMetrics.brightness, 1)
    );
    const colorTempDelta = Math.abs(
      this.currentMetrics.colorTemp - this.referenceMetrics.colorTemp
    );
    const contrastDelta = Math.abs(
      this.currentMetrics.contrast - this.referenceMetrics.contrast
    );

    // Check if change exceeds threshold
    const brightnessChanged = brightnessDelta >= CONFIG.BRIGHTNESS_THRESHOLD;
    const colorTempChanged = colorTempDelta >= CONFIG.COLOR_TEMP_THRESHOLD;
    // contrastChanged kept for potential future use
    const _contrastChanged = contrastDelta >= CONFIG.CONTRAST_THRESHOLD;

    const significantChange = brightnessChanged || colorTempChanged;

    // Check cooldown
    const now = performance.now();
    const cooldownExpired = (now - this.lastAdjustmentTime) >= CONFIG.COOLDOWN_MS;

    const shouldTrigger = significantChange && cooldownExpired;

    if (shouldTrigger) {
      this.lastAdjustmentTime = now;

      // Calculate art brightness multiplier based on lighting change
      this.artBrightnessMultiplier = this._calculateArtBrightnessMultiplier();

      // Update reference to new baseline
      this.referenceMetrics = { ...this.currentMetrics };

      console.log('[LightingDetector] Lighting change detected:', {
        brightnessDelta: (brightnessDelta * 100).toFixed(1) + '%',
        colorTempDelta: colorTempDelta.toFixed(3),
        artBrightnessMultiplier: this.artBrightnessMultiplier.toFixed(2)
      });

      // Trigger callback if set
      if (this.onLightingChange) {
        this.onLightingChange({
          brightnessDelta,
          colorTempDelta,
          contrastDelta,
          artBrightnessMultiplier: this.artBrightnessMultiplier
        });
      }
    }

    return {
      changed: shouldTrigger,
      brightnessDelta,
      colorTempDelta,
      contrastDelta,
      artBrightnessMultiplier: this.artBrightnessMultiplier
    };
  }

  /**
   * Measure lighting metrics from source
   * @param {HTMLCanvasElement|HTMLVideoElement} source
   * @param {ImageData|null} personMask
   * @param {Object|null} region
   * @returns {LightingMetrics}
   * @private
   */
  _measureLighting(source, personMask, region) {
    // Get source dimensions
    const width = 'videoWidth' in source && source.videoWidth > 0
      ? source.videoWidth
      : source.width;
    const height = 'videoHeight' in source && source.videoHeight > 0
      ? source.videoHeight
      : source.height;

    // Create temp canvas for sampling
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Use smaller size for performance
    const sampleWidth = Math.min(width, 320);
    const sampleHeight = Math.min(height, 240);
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;

    // Draw source
    ctx.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imageData.data;

    // Calculate region bounds (or use full frame)
    let startX = 0, startY = 0, endX = sampleWidth, endY = sampleHeight;
    if (region) {
      // Convert percentage region to pixel coordinates
      startX = Math.floor((Math.min(region.topLeft.x, region.bottomLeft.x) / 100) * sampleWidth);
      startY = Math.floor((Math.min(region.topLeft.y, region.topRight.y) / 100) * sampleHeight);
      endX = Math.ceil((Math.max(region.topRight.x, region.bottomRight.x) / 100) * sampleWidth);
      endY = Math.ceil((Math.max(region.bottomLeft.y, region.bottomRight.y) / 100) * sampleHeight);
    }

    // Scale mask if provided
    let scaledMask = null;
    if (personMask) {
      scaledMask = this._scaleMask(personMask, sampleWidth, sampleHeight);
    }

    // Sample on a grid within the region
    const gridSize = CONFIG.SAMPLE_GRID_SIZE;
    const stepX = (endX - startX) / gridSize;
    const stepY = (endY - startY) / gridSize;

    let totalBrightness = 0;
    let totalR = 0, totalG = 0, totalB = 0;
    let minBrightness = 255, maxBrightness = 0;
    let validSamples = 0;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const x = Math.floor(startX + gx * stepX + stepX / 2);
        const y = Math.floor(startY + gy * stepY + stepY / 2);

        // Skip if outside bounds
        if (x < 0 || x >= sampleWidth || y < 0 || y >= sampleHeight) continue;

        // Skip if person mask covers this pixel
        if (scaledMask) {
          const maskIdx = (y * sampleWidth + x) * 4;
          if (scaledMask[maskIdx] > 128) continue; // Person pixel
        }

        const idx = (y * sampleWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Calculate luminance (perceived brightness)
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        totalBrightness += brightness;
        totalR += r;
        totalG += g;
        totalB += b;
        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
        validSamples++;
      }
    }

    // Handle case with too few valid samples
    if (validSamples < CONFIG.MIN_SAMPLES) {
      return this.currentMetrics || {
        brightness: 128,
        colorTemp: 0,
        contrast: 0.5
      };
    }

    const avgBrightness = totalBrightness / validSamples;
    const avgR = totalR / validSamples;
    const _avgG = totalG / validSamples; // Kept for potential future color analysis
    const avgB = totalB / validSamples;

    // Calculate color temperature (warm vs cool)
    // Positive = warm (more red/yellow), Negative = cool (more blue)
    const colorTemp = ((avgR - avgB) / 255) * 2; // Range: -2 to 2

    // Calculate contrast (normalized range of brightness)
    const contrast = (maxBrightness - minBrightness) / 255;

    return {
      brightness: avgBrightness,
      colorTemp,
      contrast
    };
  }

  /**
   * Scale person mask to match sample dimensions
   * @param {ImageData} mask
   * @param {number} targetWidth
   * @param {number} targetHeight
   * @returns {Uint8ClampedArray}
   * @private
   */
  _scaleMask(mask, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Create temp canvas with original mask
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = mask.width;
    tempCanvas.height = mask.height;
    tempCtx.putImageData(mask, 0, 0);

    // Scale to target size
    ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight).data;
  }

  /**
   * Get smoothed metrics from history
   * @returns {LightingMetrics}
   * @private
   */
  _getSmoothedMetrics() {
    if (this.metricsHistory.length === 0) {
      return { brightness: 128, colorTemp: 0, contrast: 0.5 };
    }

    const sum = this.metricsHistory.reduce((acc, m) => ({
      brightness: acc.brightness + m.brightness,
      colorTemp: acc.colorTemp + m.colorTemp,
      contrast: acc.contrast + m.contrast
    }), { brightness: 0, colorTemp: 0, contrast: 0 });

    const count = this.metricsHistory.length;
    return {
      brightness: sum.brightness / count,
      colorTemp: sum.colorTemp / count,
      contrast: sum.contrast / count
    };
  }

  /**
   * Calculate art brightness multiplier based on current vs reference lighting
   * @returns {number}
   * @private
   */
  _calculateArtBrightnessMultiplier() {
    if (!this.referenceMetrics || !this.currentMetrics) {
      return 1.0;
    }

    // Calculate ratio of current to reference brightness
    const ratio = this.currentMetrics.brightness / Math.max(this.referenceMetrics.brightness, 1);

    // Clamp to reasonable range
    return Math.max(
      CONFIG.MIN_BRIGHTNESS_MULTIPLIER,
      Math.min(CONFIG.MAX_BRIGHTNESS_MULTIPLIER, ratio)
    );
  }

  /**
   * Reset to uninitialized state
   */
  reset() {
    this.referenceMetrics = null;
    this.currentMetrics = null;
    this.metricsHistory = [];
    this.artBrightnessMultiplier = 1.0;
    this.initialized = false;
    this.lastAdjustmentTime = 0;
    console.log('[LightingDetector] Reset');
  }

  /**
   * Enable or disable lighting detection
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.artBrightnessMultiplier = 1.0;
    }
    console.log('[LightingDetector] Enabled:', enabled);
  }

  /**
   * Force update reference to current lighting
   */
  updateReference() {
    if (this.currentMetrics) {
      this.referenceMetrics = { ...this.currentMetrics };
      this.artBrightnessMultiplier = 1.0;
      console.log('[LightingDetector] Reference updated to current metrics');
    }
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: this.initialized,
      enabled: this.enabled,
      referenceMetrics: this.referenceMetrics,
      currentMetrics: this.currentMetrics,
      artBrightnessMultiplier: this.artBrightnessMultiplier.toFixed(2),
      cooldownRemaining: Math.max(0,
        CONFIG.COOLDOWN_MS - (performance.now() - this.lastAdjustmentTime)
      )
    };
  }
}

// Export for use in inject.js
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = { LightingDetector, CONFIG };
}

// Make available globally for browser context
window.LightingDetector = LightingDetector;
window.LIGHTING_CONFIG = CONFIG;
