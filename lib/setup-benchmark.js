/**
 * Setup Benchmark Module
 *
 * Measures device performance for segmentation and recommends
 * an appropriate performance preset.
 */

/**
 * Performance preset configurations.
 * These control segmentation frequency for different performance levels.
 */
export const PERFORMANCE_PRESETS = {
  quality: {
    name: 'Quality',
    description: 'Best visual quality, segments every frame',
    skipFrames: 0,
    targetFps: 24
  },
  balanced: {
    name: 'Balanced',
    description: 'Good balance of quality and performance',
    skipFrames: 2, // Every 3rd frame
    targetFps: 28
  },
  performance: {
    name: 'Performance',
    description: 'Optimized for slower devices',
    skipFrames: 4, // Every 5th frame
    targetFps: 30
  }
};

/**
 * @typedef {Object} BenchmarkResults
 * @property {number} avgSegmentationTime - Average segmentation time in ms
 * @property {number} avgRenderTime - Average render time in ms
 * @property {number} estimatedFps - Estimated achievable FPS
 * @property {'quality' | 'balanced' | 'performance'} recommendedPreset
 * @property {boolean} isUnderpowered - True if device struggles with segmentation
 * @property {string|null} warning - Warning message for underpowered devices
 */

/**
 * SetupBenchmark - Performance testing for preset recommendation.
 */
export class SetupBenchmark {
  constructor() {
    /** @type {BenchmarkResults|null} */
    this.results = null;
    this.isRunning = false;
    this._aborted = false;
  }

  /**
   * Run performance benchmark.
   * @param {Object} processor - Video processor with video element
   * @param {Object} segmenter - WallArtSegmenter instance
   * @param {number} [iterations=10] - Number of test iterations
   * @param {function(number, number): void} [onProgress] - Progress callback (current, total)
   * @returns {Promise<BenchmarkResults>}
   */
  async runBenchmark(processor, segmenter, iterations = 10, onProgress = null) {
    if (!processor || !processor.video) {
      throw new Error('Processor with video element required');
    }

    if (!segmenter || !segmenter.isReady) {
      throw new Error('Segmenter must be initialized and ready');
    }

    this.isRunning = true;
    this._aborted = false;

    const segmentationTimes = [];

    try {
      // Warm up - run one segmentation to ensure model is loaded
      await segmenter.segment(processor.video, { forceSegment: true });

      // Run benchmark iterations
      for (let i = 0; i < iterations && !this._aborted; i++) {
        // Measure segmentation time
        const segStart = performance.now();
        await segmenter.segment(processor.video, { forceSegment: true });
        const segTime = performance.now() - segStart;
        segmentationTimes.push(segTime);

        // Report progress
        if (onProgress) {
          onProgress(i + 1, iterations);
        }

        // Small delay to not overwhelm the system
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (this._aborted) {
        throw new Error('Benchmark aborted');
      }

      // Calculate results
      const avgSegTime = segmentationTimes.reduce((a, b) => a + b, 0) / segmentationTimes.length;

      // Estimate render time (use processor's tracked time if available, otherwise estimate)
      const avgRenderTime = processor.lastRenderTime || 5;

      // Estimate FPS based on total frame time
      // Total time = segmentation + render + overhead (~5ms)
      const totalFrameTime = avgSegTime + avgRenderTime + 5;
      const estimatedFps = Math.floor(1000 / totalFrameTime);

      // Determine recommended preset based on performance
      /** @type {'quality' | 'balanced' | 'performance'} */
      let recommendedPreset = 'balanced';
      let isUnderpowered = false;
      /** @type {string | null} */
      let warning = null;

      if (avgSegTime < 30 && estimatedFps >= 28) {
        // Fast device - can handle quality mode
        recommendedPreset = 'quality';
      } else if (avgSegTime > 60 || estimatedFps < 20) {
        // Slow device - recommend performance mode
        recommendedPreset = 'performance';
        isUnderpowered = true;
        warning = `Your device may struggle with real-time segmentation (${avgSegTime.toFixed(0)}ms per frame). ` +
          'The Performance preset will provide smoother video by processing fewer frames.';
      } else {
        // Average device - balanced mode
        recommendedPreset = 'balanced';
      }

      this.results = {
        avgSegmentationTime: avgSegTime,
        avgRenderTime,
        estimatedFps,
        recommendedPreset,
        isUnderpowered,
        warning
      };

      console.log('[SetupBenchmark] Results:', this.results);
      return this.results;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get cached benchmark results.
   * @returns {BenchmarkResults|null}
   */
  getResults() {
    return this.results;
  }

  /**
   * Stop a running benchmark.
   */
  stop() {
    this._aborted = true;
    this.isRunning = false;
  }

  /**
   * Get preset description.
   * @param {'quality' | 'balanced' | 'performance'} preset
   * @returns {string}
   */
  static getPresetDescription(preset) {
    return PERFORMANCE_PRESETS[preset]?.description || '';
  }

  /**
   * Get preset configuration.
   * @param {'quality' | 'balanced' | 'performance'} preset
   * @returns {Object}
   */
  static getPresetConfig(preset) {
    return PERFORMANCE_PRESETS[preset] || PERFORMANCE_PRESETS.balanced;
  }
}
