/**
 * Wall Art Segmentation Module
 *
 * Provides person segmentation using MediaPipe Selfie Segmentation
 * for natural occlusion of wall art overlays.
 *
 * Features:
 * - Lazy initialization (model loaded on first use)
 * - Multi-person support (all people in frame)
 * - Mask caching for performance
 * - Configurable segmentation frequency
 */

// Performance presets for segmentation frequency
export const SEGMENTATION_PRESETS = {
  quality: {
    name: 'Quality',
    skipFrames: 0,      // Segment every frame
    modelSelection: 1,  // Landscape model (more accurate)
  },
  balanced: {
    name: 'Balanced',
    skipFrames: 2,      // Segment every 3rd frame
    modelSelection: 1,
  },
  performance: {
    name: 'Performance',
    skipFrames: 4,      // Segment every 5th frame
    modelSelection: 0,  // General model (faster)
  }
};

/**
 * WallArtSegmenter - Person segmentation for wall art occlusion
 *
 * Uses MediaPipe Selfie Segmentation to create masks that exclude
 * people from wall art regions, creating natural occlusion.
 */
export class WallArtSegmenter {
  constructor(options = {}) {
    // Model state
    this._segmenter = null;
    this._initialized = false;
    this._initializing = false;
    this._initError = null;

    // Configuration
    this._preset = options.preset || 'balanced';
    this._config = SEGMENTATION_PRESETS[this._preset] || SEGMENTATION_PRESETS.balanced;

    // Frame tracking
    this._frameCount = 0;

    // Mask caching
    this._cachedMask = null;
    this._cachedMaskCanvas = null;
    this._maskWidth = 0;
    this._maskHeight = 0;

    // Average mask for interpolation (built during setup phase)
    this._averageMask = null;

    // Performance tracking
    this._lastSegmentationTime = 0;
    this._segmentationTimes = [];

    // Callbacks
    this._onInitialized = options.onInitialized || null;
    this._onError = options.onError || null;
  }

  /**
   * Check if the segmenter is ready to use.
   */
  get isReady() {
    return this._initialized && this._segmenter !== null;
  }

  /**
   * Check if initialization is in progress.
   */
  get isInitializing() {
    return this._initializing;
  }

  /**
   * Get the last initialization error, if any.
   */
  get initError() {
    return this._initError;
  }

  /**
   * Get the current preset name.
   */
  get preset() {
    return this._preset;
  }

  /**
   * Get average segmentation time in ms.
   */
  get avgSegmentationTime() {
    if (this._segmentationTimes.length === 0) return 0;
    const sum = this._segmentationTimes.reduce((a, b) => a + b, 0);
    return sum / this._segmentationTimes.length;
  }

  /**
   * Set the performance preset.
   * @param {string} presetName - 'quality', 'balanced', or 'performance'
   */
  setPreset(presetName) {
    if (SEGMENTATION_PRESETS[presetName]) {
      this._preset = presetName;
      this._config = SEGMENTATION_PRESETS[presetName];
      console.log(`[WallArtSegmenter] Preset changed to: ${presetName}`);
    }
  }

  /**
   * Initialize the segmentation model.
   * This is called lazily on first segment() call, or can be called explicitly.
   *
   * @returns {Promise<boolean>} True if initialization succeeded
   */
  async initialize() {
    if (this._initialized) return true;
    if (this._initializing) {
      // Wait for existing initialization
      return new Promise((resolve) => {
        const checkInit = setInterval(() => {
          if (!this._initializing) {
            clearInterval(checkInit);
            resolve(this._initialized);
          }
        }, 100);
      });
    }

    this._initializing = true;
    this._initError = null;

    try {
      console.log('[WallArtSegmenter] Loading TensorFlow.js and MediaPipe...');

      // Dynamic imports for lazy loading
      const [tf, bodySegmentation] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('@tensorflow-models/body-segmentation')
      ]);

      // Ensure TF.js backend is ready
      await tf.ready();
      console.log(`[WallArtSegmenter] TF.js backend: ${tf.getBackend()}`);

      // Create the segmenter with MediaPipe backend
      console.log('[WallArtSegmenter] Creating MediaPipe Selfie Segmentation model...');

      this._segmenter = await bodySegmentation.createSegmenter(
        bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
          modelType: this._config.modelSelection === 1 ? 'landscape' : 'general'
        }
      );

      this._initialized = true;
      this._initializing = false;

      console.log('[WallArtSegmenter] Initialization complete');

      if (this._onInitialized) {
        this._onInitialized();
      }

      return true;
    } catch (error) {
      this._initError = error;
      this._initializing = false;

      console.error('[WallArtSegmenter] Initialization failed:', error);

      if (this._onError) {
        this._onError(error);
      }

      return false;
    }
  }

  /**
   * Segment a video frame to generate a person mask.
   * Returns a mask where person pixels are 1 (opaque) and background is 0.
   *
   * @param {HTMLVideoElement|HTMLCanvasElement} source - Video frame
   * @param {Object} [options] - Segmentation options
   * @param {boolean} [options.forceSegment] - Skip frame-skip logic and always segment
   * @returns {Promise<{mask: ImageData|null, fromCache: boolean, skipped: boolean}>}
   */
  async segment(source, options = {}) {
    const { forceSegment = false } = options;

    // Lazy initialization
    if (!this._initialized && !this._initializing) {
      const success = await this.initialize();
      if (!success) {
        return { mask: this._cachedMask, fromCache: true, skipped: false };
      }
    }

    // Wait for initialization if in progress
    if (this._initializing) {
      await this.initialize();
    }

    // Check if we should skip this frame
    this._frameCount++;
    const shouldSkip = !forceSegment &&
                       this._config.skipFrames > 0 &&
                       (this._frameCount % (this._config.skipFrames + 1)) !== 0;

    if (shouldSkip && this._cachedMask) {
      return { mask: this._cachedMask, fromCache: true, skipped: true };
    }

    // Perform segmentation
    if (!this._segmenter) {
      return { mask: this._cachedMask, fromCache: true, skipped: false };
    }

    try {
      const startTime = performance.now();

      // Run segmentation
      const segmentations = await this._segmenter.segmentPeople(source, {
        flipHorizontal: false,
        multiSegmentation: true,  // Support multiple people
        segmentBodyParts: false   // We just need person/background mask
      });

      // Convert segmentation results to a combined mask
      const mask = this._createCombinedMask(segmentations, source);

      // Update cache
      this._cachedMask = mask;

      // Track performance
      const segmentTime = performance.now() - startTime;
      this._lastSegmentationTime = segmentTime;
      this._segmentationTimes.push(segmentTime);
      if (this._segmentationTimes.length > 30) {
        this._segmentationTimes.shift();
      }

      return { mask, fromCache: false, skipped: false };
    } catch (error) {
      console.error('[WallArtSegmenter] Segmentation error:', error);
      return { mask: this._cachedMask, fromCache: true, skipped: false };
    }
  }

  /**
   * Create a combined mask from multiple segmentation results.
   * Supports multi-person occlusion by combining all person masks.
   *
   * @param {Array} segmentations - Array of segmentation results
   * @param {HTMLVideoElement|HTMLCanvasElement} source - Original source for dimensions
   * @returns {ImageData} Combined mask as ImageData
   */
  _createCombinedMask(segmentations, source) {
    // Get dimensions - handle both video and canvas elements
    const width = /** @type {HTMLVideoElement} */ (source).videoWidth || source.width;
    const height = /** @type {HTMLVideoElement} */ (source).videoHeight || source.height;

    // Ensure we have a canvas for mask operations
    if (!this._cachedMaskCanvas ||
        this._maskWidth !== width ||
        this._maskHeight !== height) {
      this._cachedMaskCanvas = new OffscreenCanvas(width, height);
      this._maskWidth = width;
      this._maskHeight = height;
    }

    const ctx = this._cachedMaskCanvas.getContext('2d');

    // Clear to transparent (0 = background)
    ctx.clearRect(0, 0, width, height);

    if (!segmentations || segmentations.length === 0) {
      return ctx.getImageData(0, 0, width, height);
    }

    // Combine all person masks
    for (const segmentation of segmentations) {
      if (segmentation.mask) {
        // The mask is typically an ImageData or can be converted
        const maskData = segmentation.mask;

        if (maskData.toCanvasImageSource) {
          // MediaPipe returns a mask with toCanvasImageSource method
          const maskSource = maskData.toCanvasImageSource();
          ctx.drawImage(maskSource, 0, 0, width, height);
        } else if (maskData instanceof ImageData) {
          ctx.putImageData(maskData, 0, 0);
        } else if (maskData.data) {
          // Raw mask data - create ImageData
          const imageData = new ImageData(
            new Uint8ClampedArray(maskData.data),
            maskData.width,
            maskData.height
          );
          ctx.putImageData(imageData, 0, 0);
        }
      }
    }

    return ctx.getImageData(0, 0, width, height);
  }

  /**
   * Get the cached mask without running segmentation.
   * Useful for frame-skip interpolation.
   *
   * @returns {ImageData|null} Cached mask or null if none
   */
  getCachedMask() {
    return this._cachedMask;
  }

  /**
   * Set an average mask for use when segmentation is skipped.
   * Built during the setup phase from multiple frames.
   *
   * @param {ImageData} mask - Average person mask
   */
  setAverageMask(mask) {
    this._averageMask = mask;
  }

  /**
   * Get the average mask.
   *
   * @returns {ImageData|null} Average mask or null
   */
  getAverageMask() {
    return this._averageMask;
  }

  /**
   * Build an average mask from multiple segmentation results.
   * Used during setup to create a mask for frame-skip interpolation.
   *
   * @param {Array<ImageData>} masks - Array of masks to average
   * @returns {ImageData} Averaged mask
   */
  buildAverageMask(masks) {
    if (!masks || masks.length === 0) return null;

    const width = masks[0].width;
    const height = masks[0].height;
    const avgData = new Uint8ClampedArray(width * height * 4);

    // Sum all mask values
    for (const mask of masks) {
      const data = mask.data;
      for (let i = 0; i < data.length; i++) {
        avgData[i] += data[i] / masks.length;
      }
    }

    this._averageMask = new ImageData(avgData, width, height);
    return this._averageMask;
  }

  /**
   * Apply a person mask to a canvas context.
   * This cuts out (makes transparent) the areas where people are.
   * Used for wall art rendering - art shows through where there's no person.
   *
   * @param {CanvasRenderingContext2D} ctx - Target canvas context
   * @param {ImageData} mask - Person mask (white = person, black = background)
   */
  applyMaskCutout(ctx, mask) {
    if (!mask) return;

    const canvas = ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;

    // Create a temporary canvas for the mask
    const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.putImageData(mask, 0, 0);

    // Use destination-out to cut out person areas
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, 0, 0, width, height);
    ctx.restore();
  }

  /**
   * Apply mask with smooth edges (feathering).
   * Useful when segmentation quality is degraded.
   *
   * @param {CanvasRenderingContext2D} ctx - Target canvas context
   * @param {ImageData} mask - Person mask
   * @param {number} featherRadius - Blur radius for feathering (px)
   */
  applyMaskWithFeathering(ctx, mask, featherRadius = 2) {
    if (!mask) return;

    const canvas = ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;

    // Create mask canvas
    const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.putImageData(mask, 0, 0);

    // Apply blur for feathering
    if (featherRadius > 0) {
      maskCtx.filter = `blur(${featherRadius}px)`;
      maskCtx.drawImage(maskCanvas, 0, 0);
      maskCtx.filter = 'none';
    }

    // Apply cutout
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, 0, 0, width, height);
    ctx.restore();
  }

  /**
   * Reset frame counter.
   * Call when switching presets or after recalibration.
   */
  resetFrameCount() {
    this._frameCount = 0;
  }

  /**
   * Clear cached mask.
   * Call when scene changes significantly.
   */
  clearCache() {
    this._cachedMask = null;
    this._averageMask = null;
    this._segmentationTimes = [];
  }

  /**
   * Dispose of the segmenter and free resources.
   */
  dispose() {
    if (this._segmenter) {
      // MediaPipe segmenters don't have a dispose method,
      // but we clear our references
      this._segmenter = null;
    }

    this._initialized = false;
    this._cachedMask = null;
    this._cachedMaskCanvas = null;
    this._averageMask = null;

    console.log('[WallArtSegmenter] Disposed');
  }
}

/**
 * Check if the browser supports the required features for segmentation.
 *
 * @returns {Object} { supported: boolean, reason: string|null }
 */
export function checkSegmentationSupport() {
  // Check for WebGL support
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  if (!gl) {
    return {
      supported: false,
      reason: 'WebGL is not supported. Person segmentation requires WebGL.'
    };
  }

  // Check for OffscreenCanvas support
  if (typeof OffscreenCanvas === 'undefined') {
    return {
      supported: false,
      reason: 'OffscreenCanvas is not supported. Please update your browser.'
    };
  }

  return { supported: true, reason: null };
}
