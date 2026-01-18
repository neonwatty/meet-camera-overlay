/**
 * Performance Monitor Module
 *
 * Tracks FPS and segmentation performance metrics,
 * providing warnings when performance degrades.
 */

/**
 * Performance thresholds for warnings
 */
const THRESHOLDS = {
  FPS_WARNING: 20,      // Warn if FPS drops below this
  FPS_CRITICAL: 15,     // Critical warning threshold
  SEGMENT_WARNING: 50,  // Warn if segmentation takes longer (ms)
  SEGMENT_CRITICAL: 100 // Critical threshold (ms)
};

/**
 * Warning types
 */
const WARNING_TYPES = {
  FPS_LOW: 'fps_low',
  FPS_CRITICAL: 'fps_critical',
  SEGMENTATION_SLOW: 'segmentation_slow',
  SEGMENTATION_CRITICAL: 'segmentation_critical'
};

/**
 * PerformanceMonitor - Tracks metrics and generates warnings
 */
class PerformanceMonitor {
  constructor() {
    /** @type {number} */
    this.fps = 30;

    /** @type {number} */
    this.segmentationTime = 0;

    /** @type {number} */
    this.renderTime = 0;

    /** @type {'good' | 'degraded' | 'poor'} */
    this.segmentationQuality = 'good';

    /** @type {number[]} */
    this._fpsHistory = [];

    /** @type {number[]} */
    this._segmentHistory = [];

    /** @type {number} */
    this._historySize = 30; // Keep last 30 samples for smoothing

    /** @type {number} */
    this._lastFrameTime = 0;

    /** @type {number} */
    this._frameCount = 0;

    /** @type {number} */
    this._lastFpsUpdate = 0;
  }

  /**
   * Record a frame for FPS calculation
   * @param {number} timestamp - Current timestamp from requestAnimationFrame
   */
  recordFrame(timestamp) {
    this._frameCount++;

    // Update FPS every second
    if (timestamp - this._lastFpsUpdate >= 1000) {
      this.fps = Math.round((this._frameCount * 1000) / (timestamp - this._lastFpsUpdate));
      this._fpsHistory.push(this.fps);

      if (this._fpsHistory.length > this._historySize) {
        this._fpsHistory.shift();
      }

      this._frameCount = 0;
      this._lastFpsUpdate = timestamp;
    }

    this._lastFrameTime = timestamp;
  }

  /**
   * Record segmentation time
   * @param {number} timeMs - Time taken for segmentation in milliseconds
   */
  recordSegmentationTime(timeMs) {
    this.segmentationTime = timeMs;
    this._segmentHistory.push(timeMs);

    if (this._segmentHistory.length > this._historySize) {
      this._segmentHistory.shift();
    }

    // Update quality assessment
    const avgSegTime = this.getAverageSegmentationTime();
    if (avgSegTime > THRESHOLDS.SEGMENT_CRITICAL) {
      this.segmentationQuality = 'poor';
    } else if (avgSegTime > THRESHOLDS.SEGMENT_WARNING) {
      this.segmentationQuality = 'degraded';
    } else {
      this.segmentationQuality = 'good';
    }
  }

  /**
   * Record render time
   * @param {number} timeMs - Time taken for rendering in milliseconds
   */
  recordRenderTime(timeMs) {
    this.renderTime = timeMs;
  }

  /**
   * Get average FPS from history
   * @returns {number}
   */
  getAverageFps() {
    if (this._fpsHistory.length === 0) return this.fps;
    return Math.round(
      this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length
    );
  }

  /**
   * Get average segmentation time from history
   * @returns {number}
   */
  getAverageSegmentationTime() {
    if (this._segmentHistory.length === 0) return this.segmentationTime;
    return this._segmentHistory.reduce((a, b) => a + b, 0) / this._segmentHistory.length;
  }

  /**
   * Get current warnings based on metrics
   * @returns {Array<{type: string, message: string, severity: string}>}
   */
  getWarnings() {
    const warnings = [];
    const avgFps = this.getAverageFps();
    const avgSegTime = this.getAverageSegmentationTime();

    // FPS warnings
    if (avgFps < THRESHOLDS.FPS_CRITICAL) {
      warnings.push({
        type: WARNING_TYPES.FPS_CRITICAL,
        message: `Very low frame rate (${avgFps} FPS)`,
        severity: 'critical'
      });
    } else if (avgFps < THRESHOLDS.FPS_WARNING) {
      warnings.push({
        type: WARNING_TYPES.FPS_LOW,
        message: `Low frame rate (${avgFps} FPS)`,
        severity: 'warning'
      });
    }

    // Segmentation warnings (only if segmentation is active)
    if (avgSegTime > 0) {
      if (avgSegTime > THRESHOLDS.SEGMENT_CRITICAL) {
        warnings.push({
          type: WARNING_TYPES.SEGMENTATION_CRITICAL,
          message: `Segmentation very slow (${Math.round(avgSegTime)}ms)`,
          severity: 'critical'
        });
      } else if (avgSegTime > THRESHOLDS.SEGMENT_WARNING) {
        warnings.push({
          type: WARNING_TYPES.SEGMENTATION_SLOW,
          message: `Segmentation slow (${Math.round(avgSegTime)}ms)`,
          severity: 'warning'
        });
      }
    }

    return warnings;
  }

  /**
   * Get all current metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      fps: this.fps,
      avgFps: this.getAverageFps(),
      segmentationTime: this.segmentationTime,
      avgSegmentationTime: this.getAverageSegmentationTime(),
      renderTime: this.renderTime,
      segmentationQuality: this.segmentationQuality,
      warnings: this.getWarnings()
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.fps = 30;
    this.segmentationTime = 0;
    this.renderTime = 0;
    this.segmentationQuality = 'good';
    this._fpsHistory = [];
    this._segmentHistory = [];
    this._frameCount = 0;
    this._lastFpsUpdate = 0;
  }
}

// Export for use in different contexts
if (typeof window !== 'undefined') {
  window.PerformanceMonitor = PerformanceMonitor;
  window.PERFORMANCE_THRESHOLDS = THRESHOLDS;
  window.WARNING_TYPES = WARNING_TYPES;
}

// Also export for module systems (Node.js, bundlers)
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  // eslint-disable-next-line no-undef
  module.exports = { PerformanceMonitor, THRESHOLDS, WARNING_TYPES };
}
