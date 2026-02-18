/**
 * Wall Region Snapping
 *
 * Snapping initialization, edge detection, and snap guide rendering
 * for the wall region editor. All functions are parameterized (no closure state).
 *
 * Exposed as window._WallRegionSnapping
 */

(function() {
  'use strict';

  /**
   * Initialize snapping system.
   * @returns {{edgeDetector: Object|null, snapEngine: Object|null}}
   */
  function initializeSnapping() {
    let edgeDetector = null;
    let snapEngine = null;

    if (typeof window.EdgeDetector === 'function') {
      edgeDetector = new window.EdgeDetector({
        threshold: 40,
        blurRadius: 1,
        minLineLength: 15
      });
    }

    if (typeof window.SnapEngine === 'function') {
      snapEngine = new window.SnapEngine({
        snapThreshold: 4,
        gridSize: 5
      });
    }

    console.log('[WallRegionEditor] Snapping initialized:', {
      edgeDetector: !!edgeDetector,
      snapEngine: !!snapEngine
    });

    return { edgeDetector, snapEngine };
  }

  /**
   * Capture video frame for edge detection.
   * @param {HTMLElement|null} overlayElement - Editor overlay element
   * @returns {ImageData|null}
   */
  function captureVideoFrame(overlayElement) {
    const container = overlayElement?.parentElement;
    if (!container) return null;

    const video = container.querySelector('video');
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    const scale = 0.5;
    tempCanvas.width = Math.floor(video.videoWidth * scale);
    tempCanvas.height = Math.floor(video.videoHeight * scale);

    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  }

  /**
   * Update edge map from current video frame.
   * @param {Object|null} edgeDetector - EdgeDetector instance
   * @param {boolean} snapEnabled - Whether snapping is enabled
   * @param {HTMLElement|null} overlayElement - Editor overlay element
   * @returns {Object|null} Edge map or null
   */
  function updateEdgeMap(edgeDetector, snapEnabled, overlayElement) {
    if (!edgeDetector || !snapEnabled) {
      return null;
    }

    const imageData = captureVideoFrame(overlayElement);
    if (!imageData) {
      return null;
    }

    const edgeMap = edgeDetector.detectEdges(imageData);
    console.log('[WallRegionEditor] Edge map updated');
    return edgeMap;
  }

  /**
   * Get other corners for alignment snapping.
   * @param {Object} region - Current region
   * @param {string} excludeCorner - Corner name to exclude
   * @returns {Array<{x: number, y: number}>}
   */
  function getOtherCorners(region, excludeCorner) {
    if (!region) return [];

    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    return corners
      .filter(c => c !== excludeCorner)
      .map(c => region[c]);
  }

  // Snap guide color constants
  const SNAP_GUIDE_COLOR = '#00ff00';
  const EDGE_SNAP_COLOR = '#ff6600';
  const GRID_SNAP_COLOR = '#0066ff';

  /**
   * Draw snap guides on the canvas.
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
   * @param {HTMLCanvasElement} canvasEl - Canvas element
   * @param {Array} snapGuides - Array of snap guide objects
   */
  function drawSnapGuides(ctx, canvasEl, snapGuides) {
    if (!ctx || !canvasEl || snapGuides.length === 0) return;

    const width = canvasEl.width;
    const height = canvasEl.height;

    ctx.save();
    ctx.setLineDash([4, 4]);

    for (const guide of snapGuides) {
      const alpha = Math.min(1, guide.strength + 0.3);

      if (guide.type === 'vertical') {
        ctx.strokeStyle = SNAP_GUIDE_COLOR;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((guide.x / 100) * width, (guide.yStart / 100) * height);
        ctx.lineTo((guide.x / 100) * width, (guide.yEnd / 100) * height);
        ctx.stroke();
      } else if (guide.type === 'horizontal') {
        ctx.strokeStyle = SNAP_GUIDE_COLOR;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((guide.xStart / 100) * width, (guide.y / 100) * height);
        ctx.lineTo((guide.xEnd / 100) * width, (guide.y / 100) * height);
        ctx.stroke();
      } else if (guide.type === 'edge-indicator') {
        ctx.fillStyle = EDGE_SNAP_COLOR;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(
          (guide.x / 100) * width,
          (guide.y / 100) * height,
          (guide.radius / 100) * Math.min(width, height),
          0,
          Math.PI * 2
        );
        ctx.fill();
      } else if (guide.type === 'grid-indicator') {
        ctx.fillStyle = GRID_SNAP_COLOR;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(
          (guide.x / 100) * width,
          (guide.y / 100) * height,
          4,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Export
  window._WallRegionSnapping = {
    initializeSnapping,
    captureVideoFrame,
    updateEdgeMap,
    getOtherCorners,
    drawSnapGuides
  };
})();
