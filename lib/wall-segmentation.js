/**
 * Wall Art Segmentation Module
 *
 * Provides person segmentation using MediaPipe Tasks Vision direct SDK
 * for natural occlusion of wall art overlays.
 *
 * Depends on window._SegmentationMask (segmentation-mask.js).
 */

/** @type {any} */
const _mask = window._SegmentationMask;

// CDN paths for WASM and models
const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';

const MODEL_PATHS = {
  landscape: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
  general: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
};

// Performance presets for segmentation frequency
export const SEGMENTATION_PRESETS = {
  quality: { name: 'Quality', skipFrames: 0, modelSelection: 1 },
  balanced: { name: 'Balanced', skipFrames: 2, modelSelection: 1 },
  performance: { name: 'Performance', skipFrames: 4, modelSelection: 0 }
};

/**
 * WallArtSegmenter - Person segmentation for wall art occlusion
 */
export class WallArtSegmenter {
  constructor(options = {}) {
    this._segmenter = null;
    this._initialized = false;
    this._initializing = false;
    this._initError = null;
    this._preset = options.preset || 'balanced';
    this._config = SEGMENTATION_PRESETS[this._preset] || SEGMENTATION_PRESETS.balanced;
    this._frameCount = 0;
    this._lastTimestamp = 0;
    this._cachedMask = null;
    this._maskState = { canvas: null, width: 0, height: 0 };
    this._averageMask = null;
    this._lastSegmentationTime = 0;
    this._segmentationTimes = [];
    this._onInitialized = options.onInitialized || null;
    this._onError = options.onError || null;
  }

  get isReady() {
    return this._initialized && this._segmenter !== null;
  }

  get isInitializing() {
    return this._initializing;
  }

  get initError() {
    return this._initError;
  }

  get preset() {
    return this._preset;
  }

  get avgSegmentationTime() {
    if (this._segmentationTimes.length === 0) return 0;
    const sum = this._segmentationTimes.reduce((a, b) => a + b, 0);
    return sum / this._segmentationTimes.length;
  }

  setPreset(presetName) {
    if (SEGMENTATION_PRESETS[presetName]) {
      this._preset = presetName;
      this._config = SEGMENTATION_PRESETS[presetName];
      console.log(`[WallArtSegmenter] Preset changed to: ${presetName}`);
    }
  }

  async initialize() {
    if (this._initialized) return true;
    if (this._initializing) {
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
      console.log('[WallArtSegmenter] Loading MediaPipe Tasks Vision...');

      const vision = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, ImageSegmenter } = vision;

      console.log('[WallArtSegmenter] Initializing WASM runtime...');
      const wasmFileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

      const modelPath = this._config.modelSelection === 1
        ? MODEL_PATHS.landscape
        : MODEL_PATHS.general;

      console.log(`[WallArtSegmenter] Loading model: ${this._config.modelSelection === 1 ? 'landscape' : 'general'}`);

      this._segmenter = await ImageSegmenter.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false
      });

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

  async segment(source, options = {}) {
    const { forceSegment = false } = options;

    if (!this._initialized && !this._initializing) {
      const success = await this.initialize();
      if (!success) {
        return { mask: this._cachedMask, fromCache: true, skipped: false };
      }
    }

    if (this._initializing) {
      await this.initialize();
    }

    this._frameCount++;
    const shouldSkip = !forceSegment &&
                       this._config.skipFrames > 0 &&
                       (this._frameCount % (this._config.skipFrames + 1)) !== 0;

    if (shouldSkip && this._cachedMask) {
      return { mask: this._cachedMask, fromCache: true, skipped: true };
    }

    if (!this._segmenter) {
      return { mask: this._cachedMask, fromCache: true, skipped: false };
    }

    try {
      const startTime = performance.now();

      const result = this._runSegmentation(source);

      const mask = _mask.convertResultToImageData(result, source, this._maskState);

      this._cachedMask = mask;

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

  _runSegmentation(source) {
    const now = performance.now();
    const timestamp = Math.max(now, this._lastTimestamp + 1);
    this._lastTimestamp = timestamp;
    return this._segmenter.segmentForVideo(source, timestamp);
  }

  applyMaskCutout(ctx, mask) {
    _mask.applyMaskCutout(ctx, mask);
  }

  applyMaskWithFeathering(ctx, mask, featherRadius = 2) {
    _mask.applyMaskWithFeathering(ctx, mask, featherRadius);
  }

  getCachedMask() {
    return this._cachedMask;
  }

  setAverageMask(mask) {
    this._averageMask = mask;
  }

  getAverageMask() {
    return this._averageMask;
  }

  buildAverageMask(masks) {
    this._averageMask = _mask.buildAverageMask(masks);
    return this._averageMask;
  }

  resetFrameCount() {
    this._frameCount = 0;
  }

  clearCache() {
    this._cachedMask = null;
    this._averageMask = null;
    this._segmentationTimes = [];
  }

  dispose() {
    if (this._segmenter) {
      this._segmenter.close();
      this._segmenter = null;
    }

    this._initialized = false;
    this._cachedMask = null;
    this._maskState = { canvas: null, width: 0, height: 0 };
    this._averageMask = null;
    this._lastTimestamp = 0;

    console.log('[WallArtSegmenter] Disposed');
  }
}

export function checkSegmentationSupport() {
  return _mask.checkSegmentationSupport();
}

// Export for use in inject.js (non-module context)
if (typeof window !== 'undefined') {
  window.WallSegmentation = {
    SEGMENTATION_PRESETS,
    WallArtSegmenter,
    checkSegmentationSupport
  };
}
