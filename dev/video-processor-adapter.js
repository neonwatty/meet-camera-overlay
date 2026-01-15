/**
 * Development VideoProcessor adapter.
 * Uses the same lib/ modules as production inject.js.
 */

import { sortOverlaysByLayer, TYPE_EFFECT, TYPE_TEXT_BANNER, TYPE_TIMER } from '../lib/overlay-utils.js';
import { drawOverlay, renderTextBanner, renderTimer } from '../lib/canvas-renderer.js';

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

    // Callbacks
    this.onDebugUpdate = null;
    this.onFrameRendered = null;
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
   * Main render loop - called every frame.
   * @param {number} timestamp - Current timestamp from requestAnimationFrame
   */
  render(timestamp) {
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
          renderTime: this.lastRenderTime
        });
      }
    }

    // Only render if video has data
    if (this.video && this.video.readyState >= 2) {
      // Draw original video frame
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

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

      if (this.debugOptions.showMask) {
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
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, 10, 120, 50);
    this.ctx.fillStyle = '#00ff00';
    this.ctx.font = 'bold 16px monospace';
    this.ctx.fillText(`FPS: ${this.currentFps}`, 20, 32);
    this.ctx.fillStyle = '#ffff00';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Render: ${this.lastRenderTime.toFixed(1)}ms`, 20, 50);
    this.ctx.restore();
  }

  /**
   * Draw mask placeholder (for future segmentation).
   */
  drawMaskPlaceholder() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
    this.ctx.fillRect(10, 70, 120, 25);
    this.ctx.fillStyle = '#ff00ff';
    this.ctx.font = '12px monospace';
    this.ctx.fillText('Mask: N/A', 20, 87);
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
