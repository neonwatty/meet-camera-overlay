/**
 * Development VideoProcessor adapter.
 * Uses the same lib/ modules as production inject.js.
 */

import { sortOverlaysByLayer, TYPE_EFFECT, TYPE_TEXT_BANNER, TYPE_TIMER } from '../lib/overlay-utils.js';
import { drawOverlay, renderTextBanner, renderTimer } from '../lib/canvas-renderer.js';
import { WallArtSegmenter, SEGMENTATION_PRESETS, checkSegmentationSupport } from '../lib/wall-segmentation.js';

export class DevVideoProcessor {
  constructor() {
    this.running = false;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.outputStream = null;
    this.overlays = [];
    this.overlayImages = new Map();

    // Debug options
    this.debugOptions = {
      showFps: true,
      showMask: false,
      showCoords: false
    };

    // FPS tracking
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.currentFps = 0;

    // Timing metrics
    this.lastRenderTime = 0;
    this.lastSegmentTime = 0;

    // Segmentation
    this.segmenter = null;
    this.segmentationEnabled = false;
    this.currentMask = null;
    this.segmentationSupported = null;

    // Callbacks
    this.onDebugUpdate = null;
    this.onFrameRendered = null;
    this.onSegmentationReady = null;
  }

  /**
   * Start processing video frames.
   * @param {HTMLVideoElement} sourceElement - Video element playing demo video
   * @param {number} width - Canvas width (default 1280)
   * @param {number} height - Canvas height (default 720)
   * @returns {{ canvas: HTMLCanvasElement, stream: MediaStream }}
   */
  async start(sourceElement, width = 1280, height = 720) {
    this.video = sourceElement;

    // Create output canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');

    // Start render loop
    this.running = true;
    this.lastFpsUpdate = performance.now();
    requestAnimationFrame((ts) => this.render(ts));

    // Create output stream (for potential future use)
    this.outputStream = this.canvas.captureStream(30);

    return {
      canvas: this.canvas,
      stream: this.outputStream
    };
  }

  /**
   * Update overlay configuration.
   * @param {Array} overlays - Array of overlay objects
   */
  setOverlays(overlays) {
    this.overlays = overlays || [];
  }

  /**
   * Register a loaded image for an overlay.
   * @param {string} id - Overlay ID
   * @param {HTMLImageElement|HTMLCanvasElement} img - Loaded image
   */
  setOverlayImage(id, img) {
    this.overlayImages.set(id, img);
  }

  /**
   * Remove an overlay image.
   * @param {string} id - Overlay ID
   */
  removeOverlayImage(id) {
    this.overlayImages.delete(id);
  }

  /**
   * Update debug display options.
   * @param {Object} options - Debug options
   */
  setDebugOptions(options) {
    this.debugOptions = { ...this.debugOptions, ...options };
  }

  /**
   * Check if segmentation is supported in this browser.
   * @returns {Object} { supported: boolean, reason: string|null }
   */
  checkSegmentationSupport() {
    if (this.segmentationSupported === null) {
      this.segmentationSupported = checkSegmentationSupport();
    }
    return this.segmentationSupported;
  }

  /**
   * Enable person segmentation.
   * @param {string} preset - Performance preset: 'quality', 'balanced', or 'performance'
   * @returns {Promise<boolean>} True if successfully enabled
   */
  async enableSegmentation(preset = 'balanced') {
    const support = this.checkSegmentationSupport();
    if (!support.supported) {
      console.warn('[DevVideoProcessor] Segmentation not supported:', support.reason);
      return false;
    }

    if (this.segmenter) {
      this.segmenter.setPreset(preset);
      this.segmentationEnabled = true;
      return true;
    }

    console.log('[DevVideoProcessor] Enabling segmentation with preset:', preset);

    this.segmenter = new WallArtSegmenter({
      preset,
      onInitialized: () => {
        console.log('[DevVideoProcessor] Segmenter initialized');
        if (this.onSegmentationReady) {
          this.onSegmentationReady();
        }
      },
      onError: (error) => {
        console.error('[DevVideoProcessor] Segmenter error:', error);
        this.segmentationEnabled = false;
      }
    });

    // Start initialization (will complete asynchronously)
    const success = await this.segmenter.initialize();
    if (success) {
      this.segmentationEnabled = true;
    }
    return success;
  }

  /**
   * Disable person segmentation.
   */
  disableSegmentation() {
    this.segmentationEnabled = false;
    this.currentMask = null;
  }

  /**
   * Set segmentation preset.
   * @param {string} preset - 'quality', 'balanced', or 'performance'
   */
  setSegmentationPreset(preset) {
    if (this.segmenter) {
      this.segmenter.setPreset(preset);
    }
  }

  /**
   * Get available segmentation presets.
   * @returns {Object} Preset configurations
   */
  getSegmentationPresets() {
    return SEGMENTATION_PRESETS;
  }

  /**
   * Check if segmentation is currently active.
   * @returns {boolean}
   */
  isSegmentationActive() {
    return this.segmentationEnabled && this.segmenter && this.segmenter.isReady;
  }

  /**
   * Get segmentation status info.
   * @returns {Object} Status information
   */
  getSegmentationStatus() {
    return {
      enabled: this.segmentationEnabled,
      initialized: this.segmenter?.isReady || false,
      initializing: this.segmenter?.isInitializing || false,
      preset: this.segmenter?.preset || null,
      avgTime: this.segmenter?.avgSegmentationTime || 0,
      lastTime: this.lastSegmentTime,
      hasMask: this.currentMask !== null
    };
  }

  /**
   * Main render loop - called every frame.
   * @param {number} timestamp - Current timestamp from requestAnimationFrame
   */
  async render(timestamp) {
    if (!this.running) return;

    const startTime = performance.now();

    // FPS calculation
    this.frameCount++;
    if (timestamp - this.lastFpsUpdate >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;

      if (this.onDebugUpdate) {
        this.onDebugUpdate({
          fps: this.currentFps,
          renderTime: this.lastRenderTime,
          segmentTime: this.lastSegmentTime,
          segmentationStatus: this.getSegmentationStatus()
        });
      }
    }

    // Only render if video has data
    if (this.video && this.video.readyState >= 2) {
      // Draw original video frame
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Run segmentation if enabled
      if (this.segmentationEnabled && this.segmenter && this.segmenter.isReady) {
        const segStartTime = performance.now();
        const { mask, fromCache } = await this.segmenter.segment(this.video);
        this.currentMask = mask;
        if (!fromCache) {
          this.lastSegmentTime = performance.now() - segStartTime;
        }
      }

      // Sort overlays by layer (background first, then foreground)
      const sortedOverlays = sortOverlaysByLayer(this.overlays);

      // Render each overlay
      sortedOverlays.forEach(overlay => {
        // Skip inactive effects/text/timers
        if ((overlay.type === TYPE_EFFECT || overlay.type === TYPE_TEXT_BANNER || overlay.type === TYPE_TIMER) && !overlay.active) {
          return;
        }

        // Text banners
        if (overlay.type === TYPE_TEXT_BANNER) {
          renderTextBanner(this.ctx, overlay, this.canvas.width, this.canvas.height, { mirror: false });
          return;
        }

        // Timers
        if (overlay.type === TYPE_TIMER) {
          // Update timer elapsed time if running
          if (overlay.timerState && overlay.timerState.running && overlay.timerState.startTime) {
            overlay.timerState.elapsed = Math.floor((Date.now() - overlay.timerState.startTime) / 1000);
          }
          renderTimer(this.ctx, overlay, this.canvas.width, this.canvas.height, timestamp, { mirror: false });
          return;
        }

        // Image overlays (standard and effects)
        const img = this.overlayImages.get(overlay.id);
        if (img && img.width > 0) {
          drawOverlay(this.ctx, overlay, img, this.canvas.width, this.canvas.height, { mirror: false });
        }
      });

      // Debug overlays
      if (this.debugOptions.showFps) {
        this.drawFpsCounter();
      }

      if (this.debugOptions.showMask && this.currentMask) {
        this.drawMaskVisualization();
      } else if (this.debugOptions.showMask) {
        this.drawMaskPlaceholder();
      }
    }

    // Track render time
    this.lastRenderTime = performance.now() - startTime;

    // Notify frame rendered
    if (this.onFrameRendered) {
      this.onFrameRendered(this.canvas);
    }

    // Continue loop
    requestAnimationFrame((ts) => this.render(ts));
  }

  /**
   * Draw FPS counter overlay.
   */
  drawFpsCounter() {
    this.ctx.save();

    // Determine panel height based on whether segmentation is active
    const showSegmentInfo = this.segmentationEnabled || this.segmenter;
    const panelHeight = showSegmentInfo ? 85 : 50;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, 10, 140, panelHeight);

    // FPS line
    this.ctx.fillStyle = '#00ff00';
    this.ctx.font = 'bold 16px monospace';
    this.ctx.fillText(`FPS: ${this.currentFps}`, 20, 32);

    // Render time line
    this.ctx.fillStyle = '#ffff00';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Render: ${this.lastRenderTime.toFixed(1)}ms`, 20, 50);

    // Segmentation info
    if (showSegmentInfo) {
      const status = this.getSegmentationStatus();
      if (status.initializing) {
        this.ctx.fillStyle = '#ff9900';
        this.ctx.fillText('Seg: Loading...', 20, 68);
      } else if (status.initialized) {
        this.ctx.fillStyle = '#00ffff';
        this.ctx.fillText(`Seg: ${this.lastSegmentTime.toFixed(1)}ms`, 20, 68);
        this.ctx.fillStyle = '#888888';
        this.ctx.fillText(`(${status.preset})`, 20, 84);
      } else if (this.segmentationEnabled) {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillText('Seg: Error', 20, 68);
      } else {
        this.ctx.fillStyle = '#666666';
        this.ctx.fillText('Seg: Off', 20, 68);
      }
    }

    this.ctx.restore();
  }

  /**
   * Draw mask placeholder (when no mask available).
   */
  drawMaskPlaceholder() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
    this.ctx.fillRect(10, 100, 140, 25);
    this.ctx.fillStyle = '#ff00ff';
    this.ctx.font = '12px monospace';
    this.ctx.fillText('Mask: None', 20, 117);
    this.ctx.restore();
  }

  /**
   * Draw mask visualization overlay.
   * Shows the person mask as a colored overlay for debugging.
   */
  drawMaskVisualization() {
    if (!this.currentMask) return;

    this.ctx.save();

    // Create a temporary canvas for the mask visualization
    const maskCanvas = new OffscreenCanvas(this.currentMask.width, this.currentMask.height);
    const maskCtx = maskCanvas.getContext('2d');

    // Draw the mask data
    const maskImageData = new ImageData(
      new Uint8ClampedArray(this.currentMask.data),
      this.currentMask.width,
      this.currentMask.height
    );

    // Convert grayscale mask to colored overlay
    // Person pixels become magenta, background stays transparent
    const coloredData = maskImageData.data;
    for (let i = 0; i < coloredData.length; i += 4) {
      const alpha = coloredData[i + 3]; // Use alpha channel
      if (alpha > 128) {
        // Person pixel - make it magenta semi-transparent
        coloredData[i] = 255;     // R
        coloredData[i + 1] = 0;   // G
        coloredData[i + 2] = 255; // B
        coloredData[i + 3] = 100; // A (semi-transparent)
      } else {
        // Background - fully transparent
        coloredData[i + 3] = 0;
      }
    }

    maskCtx.putImageData(new ImageData(coloredData, maskImageData.width, maskImageData.height), 0, 0);

    // Draw the colored mask overlay onto the main canvas
    this.ctx.drawImage(maskCanvas, 0, 0, this.canvas.width, this.canvas.height);

    // Draw mask info box
    this.ctx.fillStyle = 'rgba(255, 0, 255, 0.7)';
    this.ctx.fillRect(10, 100, 140, 25);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Mask: ${this.currentMask.width}x${this.currentMask.height}`, 20, 117);

    this.ctx.restore();
  }

  /**
   * Stop the render loop.
   */
  stop() {
    this.running = false;
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(track => track.stop());
    }
    // Dispose segmenter resources
    if (this.segmenter) {
      this.segmenter.dispose();
      this.segmenter = null;
    }
    this.segmentationEnabled = false;
    this.currentMask = null;
  }

  /**
   * Get current FPS.
   */
  getFps() {
    return this.currentFps;
  }

  /**
   * Get canvas dimensions.
   */
  getDimensions() {
    return {
      width: this.canvas?.width || 0,
      height: this.canvas?.height || 0
    };
  }
}
