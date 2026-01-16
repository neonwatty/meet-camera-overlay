/**
 * Reference Frame Capture Module
 *
 * Captures video frames and computes a median reference frame
 * for background subtraction and wall color pre-computation.
 */

import { detectDominantColor, rgbToHex } from './color-sampler.js';

/**
 * @typedef {Object} ReferenceFrameData
 * @property {ImageData} medianFrame - Computed median frame
 * @property {number} width - Frame width in pixels
 * @property {number} height - Frame height in pixels
 * @property {number} capturedAt - Timestamp of capture
 * @property {number} frameCount - Number of frames used
 */

/**
 * ReferenceFrameCapture - Captures and processes background frames.
 */
export class ReferenceFrameCapture {
  /**
   * @param {Object} [options]
   * @param {number} [options.frameCount=150] - Target frames to capture (5 sec @ 30fps)
   * @param {number} [options.captureInterval=33] - Milliseconds between captures (~30fps)
   * @param {function(number, number): void} [options.onProgress] - Progress callback
   * @param {function(ReferenceFrameData): void} [options.onComplete] - Completion callback
   * @param {function(): void} [options.onPersonDetected] - Called when person in frame
   */
  constructor(options = {}) {
    this.targetFrameCount = options.frameCount || 150;
    this.captureInterval = options.captureInterval || 33;
    this.onProgress = options.onProgress || null;
    this.onComplete = options.onComplete || null;
    this.onPersonDetected = options.onPersonDetected || null;

    /** @type {ImageData[]} */
    this.capturedFrames = [];
    this.isCapturing = false;
    this._aborted = false;
    this._personDetectedCount = 0;
  }

  /**
   * Start capturing frames from video source.
   * @param {HTMLVideoElement} video - Source video element
   * @param {Object} [segmenter] - Optional segmenter for person detection
   * @returns {Promise<ReferenceFrameData>}
   */
  async startCapture(video, segmenter = null) {
    if (this.isCapturing) {
      throw new Error('Capture already in progress');
    }

    this.isCapturing = true;
    this._aborted = false;
    this.capturedFrames = [];
    this._personDetectedCount = 0;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    return new Promise((resolve, reject) => {
      let lastCaptureTime = 0;

      const captureFrame = async (timestamp) => {
        if (this._aborted) {
          this.isCapturing = false;
          reject(new Error('Capture cancelled'));
          return;
        }

        // Check if enough time has passed since last capture
        if (timestamp - lastCaptureTime < this.captureInterval) {
          requestAnimationFrame(captureFrame);
          return;
        }
        lastCaptureTime = timestamp;

        // Check video is ready
        if (video.readyState < 2) {
          requestAnimationFrame(captureFrame);
          return;
        }

        // Optionally check for person in frame
        if (segmenter && segmenter.isReady) {
          try {
            const { mask } = await segmenter.segment(video, { forceSegment: true });
            if (this._hasPerson(mask)) {
              this._personDetectedCount++;
              if (this.onPersonDetected) {
                this.onPersonDetected();
              }
            }
          } catch (e) {
            // Ignore segmentation errors during capture
            console.warn('[ReferenceFrame] Segmentation check failed:', e);
          }
        }

        // Capture frame
        const frameData = this._captureFrameData(video, width, height);
        this.capturedFrames.push(frameData);

        // Report progress
        const progress = this.capturedFrames.length / this.targetFrameCount;
        if (this.onProgress) {
          this.onProgress(progress, this.capturedFrames.length);
        }

        // Check if done
        if (this.capturedFrames.length >= this.targetFrameCount) {
          this.isCapturing = false;

          try {
            const result = this._computeMedianFrame();
            if (this.onComplete) {
              this.onComplete(result);
            }
            resolve(result);
          } catch (error) {
            reject(error);
          }
        } else {
          requestAnimationFrame(captureFrame);
        }
      };

      requestAnimationFrame(captureFrame);
    });
  }

  /**
   * Stop capturing.
   */
  stopCapture() {
    this._aborted = true;
    this.isCapturing = false;
  }

  /**
   * Get percentage of frames where person was detected.
   * @returns {number} 0-1 representing percentage
   */
  getPersonDetectedRatio() {
    if (this.capturedFrames.length === 0) return 0;
    return this._personDetectedCount / this.capturedFrames.length;
  }

  /**
   * Check if mask contains a person (more than threshold of non-zero pixels).
   * @param {ImageData} mask
   * @returns {boolean}
   */
  _hasPerson(mask) {
    if (!mask || !mask.data) return false;

    let personPixels = 0;
    const data = mask.data;
    const totalPixels = data.length / 4;

    // Check alpha channel for person pixels
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 128) personPixels++;
    }

    // Person detected if more than 5% of pixels are person
    return (personPixels / totalPixels) > 0.05;
  }

  /**
   * Capture frame data from video.
   * @param {HTMLVideoElement} video
   * @param {number} width
   * @param {number} height
   * @returns {ImageData}
   */
  _captureFrameData(video, width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  /**
   * Compute median frame from captured frames.
   * Uses per-channel median for each pixel for robustness.
   * @returns {ReferenceFrameData}
   */
  _computeMedianFrame() {
    if (this.capturedFrames.length === 0) {
      throw new Error('No frames captured');
    }

    const width = this.capturedFrames[0].width;
    const height = this.capturedFrames[0].height;
    const pixelCount = width * height;

    // Create output ImageData
    const medianData = new Uint8ClampedArray(pixelCount * 4);

    // For efficiency, we'll use a sampling approach for large frame counts
    // Sort and take median for each pixel's RGB channels
    const frameCount = this.capturedFrames.length;
    const midIndex = Math.floor(frameCount / 2);

    // Process each pixel
    for (let i = 0; i < pixelCount; i++) {
      const pixelOffset = i * 4;

      // Collect values for each channel
      const rValues = new Array(frameCount);
      const gValues = new Array(frameCount);
      const bValues = new Array(frameCount);

      for (let f = 0; f < frameCount; f++) {
        const data = this.capturedFrames[f].data;
        rValues[f] = data[pixelOffset];
        gValues[f] = data[pixelOffset + 1];
        bValues[f] = data[pixelOffset + 2];
      }

      // Sort and take median
      rValues.sort((a, b) => a - b);
      gValues.sort((a, b) => a - b);
      bValues.sort((a, b) => a - b);

      medianData[pixelOffset] = rValues[midIndex];
      medianData[pixelOffset + 1] = gValues[midIndex];
      medianData[pixelOffset + 2] = bValues[midIndex];
      medianData[pixelOffset + 3] = 255; // Full opacity
    }

    return {
      medianFrame: new ImageData(medianData, width, height),
      width,
      height,
      capturedAt: Date.now(),
      frameCount: this.capturedFrames.length
    };
  }
}

/**
 * Pre-compute dominant wall colors for each region from reference frame.
 * @param {ImageData} referenceFrame
 * @param {Array} regions - Wall art regions
 * @returns {{[key: string]: string}} Map of regionId -> hex color
 */
export function computeWallColors(referenceFrame, regions) {
  /** @type {{[key: string]: string}} */
  const wallColors = {};

  if (!regions || regions.length === 0) {
    return wallColors;
  }

  // Create a canvas with the reference frame
  const canvas = new OffscreenCanvas(referenceFrame.width, referenceFrame.height);
  const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (canvas.getContext('2d')));
  ctx.putImageData(referenceFrame, 0, 0);

  for (const region of regions) {
    if (!region.region) continue;

    try {
      // Use existing detectDominantColor from color-sampler.js
      const rgb = detectDominantColor(ctx, region.region, {
        sampleDensity: 0.1,
        clusters: 3
      });
      wallColors[region.id] = rgbToHex(rgb);
    } catch (e) {
      console.warn('[ReferenceFrame] Failed to compute color for region:', region.id, e);
      wallColors[region.id] = '#808080'; // Default gray
    }
  }

  return wallColors;
}
