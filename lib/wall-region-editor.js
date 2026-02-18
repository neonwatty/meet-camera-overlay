/**
 * Wall Region Editor Overlay
 *
 * An interactive overlay for editing wall art regions directly on the Google Meet video feed.
 * Allows users to drag corners and see exactly where regions map to their actual background.
 *
 * Depends on:
 * - window._WallRegionHelpers (wall-region-helpers.js)
 * - window._WallRegionSnapping (wall-region-snapping.js)
 */

(function() {
  'use strict';

  // Editor state
  let isActive = false;
  let currentRegion = null;
  let callbacks = null;
  let overlayElement = null;
  let canvasElement = null;
  let ctx = null;
  let draggingCorner = null;
  let isDraggingRegion = false;
  let dragStartPoint = null;
  let originalRegion = null;

  // Snapping state
  let snapEnabled = true;
  let edgeDetector = null;
  let snapEngine = null;
  let edgeMap = null;
  let currentSnapGuides = [];
  let lastEdgeDetectionTime = 0;
  const EDGE_DETECTION_COOLDOWN = 500;

  // Constants
  const HANDLE_RADIUS = 12;
  const HANDLE_HIT_RADIUS = 20;
  const _MIN_REGION_SIZE = 5; // eslint-disable-line no-unused-vars
  const STROKE_COLOR = '#e94560';
  const FILL_COLOR = 'rgba(233, 69, 96, 0.2)';
  const HANDLE_FILL = '#e94560';
  const HANDLE_STROKE = '#ffffff';

  const helpers = () => /** @type {any} */ (window._WallRegionHelpers);
  const snapping = () => /** @type {any} */ (window._WallRegionSnapping);

  /**
   * Throttled edge map update.
   */
  function throttledEdgeMapUpdate() {
    const now = Date.now();
    if (now - lastEdgeDetectionTime < EDGE_DETECTION_COOLDOWN) return;
    edgeMap = snapping().updateEdgeMap(edgeDetector, snapEnabled, overlayElement);
    lastEdgeDetectionTime = now;
  }

  /**
   * Resize canvas to match container size.
   */
  function resizeCanvas() {
    if (!canvasElement || !overlayElement) return;
    const rect = overlayElement.getBoundingClientRect();
    canvasElement.width = rect.width;
    canvasElement.height = rect.height;
    ctx = canvasElement.getContext('2d');
  }

  /**
   * Draw the region on the canvas.
   */
  function draw() {
    if (!ctx || !canvasElement || !currentRegion) return;

    const width = canvasElement.width;
    const height = canvasElement.height;

    ctx.clearRect(0, 0, width, height);

    const toPixel = (point) => ({
      x: (point.x / 100) * width,
      y: (point.y / 100) * height
    });

    const tl = toPixel(currentRegion.topLeft);
    const tr = toPixel(currentRegion.topRight);
    const bl = toPixel(currentRegion.bottomLeft);
    const br = toPixel(currentRegion.bottomRight);

    // Draw filled region
    ctx.fillStyle = FILL_COLOR;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fill();

    // Draw outline
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw corner handles
    const corners = [
      { point: tl }, { point: tr }, { point: bl }, { point: br }
    ];

    for (const corner of corners) {
      ctx.fillStyle = HANDLE_STROKE;
      ctx.beginPath();
      ctx.arc(corner.point.x, corner.point.y, HANDLE_RADIUS + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = HANDLE_FILL;
      ctx.beginPath();
      ctx.arc(corner.point.x, corner.point.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw move icon in center
    const cx = (tl.x + tr.x + bl.x + br.x) / 4;
    const cy = (tl.y + tr.y + bl.y + br.y) / 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw move arrows (horizontal + vertical with arrowheads)
    const a = 6;
    ctx.beginPath();
    [[-8, 0, 8, 0], [0, -8, 0, 8]].forEach(([x1, y1, x2, y2]) => {
      ctx.moveTo(cx + x1, cy + y1);
      ctx.lineTo(cx + x2, cy + y2);
    });
    [[-8, 0, a, -a / 2, a, a / 2], [8, 0, -a, -a / 2, -a, a / 2],
     [0, -8, -a / 2, a, a / 2, a], [0, 8, -a / 2, -a, a / 2, -a]].forEach(([tx, ty, d1x, d1y, d2x, d2y]) => {
      ctx.moveTo(cx + tx + d1x, cy + ty + d1y);
      ctx.lineTo(cx + tx, cy + ty);
      ctx.lineTo(cx + tx + d2x, cy + ty + d2y);
    });
    ctx.stroke();

    // Draw snap guides
    snapping().drawSnapGuides(ctx, canvasElement, currentSnapGuides);
  }

  function handleMouseDown(e) {
    if (!isActive) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const corner = helpers().getCornerAtPoint(x, y, currentRegion, canvasElement, HANDLE_HIT_RADIUS);
    if (corner) {
      draggingCorner = corner;
      canvasElement.style.cursor = 'grabbing';
      if (snapEnabled && edgeDetector) {
        throttledEdgeMapUpdate();
      }
      return;
    }

    if (helpers().isPointInRegion(x, y, currentRegion, canvasElement)) {
      isDraggingRegion = true;
      dragStartPoint = { x, y };
      originalRegion = JSON.parse(JSON.stringify(currentRegion));
      canvasElement.style.cursor = 'grabbing';
      currentSnapGuides = [];
    }
  }

  function handleMouseMove(e) {
    if (!isActive || !canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggingCorner) {
      const width = canvasElement.width;
      const height = canvasElement.height;

      let newX = Math.max(0, Math.min(100, (x / width) * 100));
      let newY = Math.max(0, Math.min(100, (y / height) * 100));

      if (snapEnabled && snapEngine) {
        const rawPoint = { x: newX, y: newY };
        const otherCorners = snapping().getOtherCorners(currentRegion, draggingCorner);

        const candidates = snapEngine.getSnapCandidates(rawPoint, edgeDetector, edgeMap, otherCorners);
        const snapResult = snapEngine.applyBestSnap(rawPoint, candidates);

        if (snapResult.snapped) {
          newX = snapResult.point.x;
          newY = snapResult.point.y;
        }

        currentSnapGuides = snapEngine.getSnapGuides(rawPoint, candidates, currentRegion);
      } else {
        currentSnapGuides = [];
      }

      currentRegion[draggingCorner] = { x: newX, y: newY };

      if (callbacks && callbacks.onUpdate) {
        callbacks.onUpdate(currentRegion);
      }

      draw();
      return;
    }

    if (isDraggingRegion && dragStartPoint && originalRegion) {
      const width = canvasElement.width;
      const height = canvasElement.height;

      const dx = ((x - dragStartPoint.x) / width) * 100;
      const dy = ((y - dragStartPoint.y) / height) * 100;

      const o = originalRegion;
      const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
      const xs = corners.map(c => o[c].x);
      const ys = corners.map(c => o[c].y);
      const cdx = Math.max(-Math.min(...xs), Math.min(dx, 100 - Math.max(...xs)));
      const cdy = Math.max(-Math.min(...ys), Math.min(dy, 100 - Math.max(...ys)));
      for (const c of corners) {
        currentRegion[c] = { x: o[c].x + cdx, y: o[c].y + cdy };
      }

      if (callbacks && callbacks.onUpdate) {
        callbacks.onUpdate(currentRegion);
      }

      draw();
      return;
    }

    // Update cursor
    const corner = helpers().getCornerAtPoint(x, y, currentRegion, canvasElement, HANDLE_HIT_RADIUS);
    if (corner) {
      canvasElement.style.cursor = 'grab';
    } else if (helpers().isPointInRegion(x, y, currentRegion, canvasElement)) {
      canvasElement.style.cursor = 'move';
    } else {
      canvasElement.style.cursor = 'crosshair';
    }
  }

  function handleMouseUp() {
    draggingCorner = null;
    isDraggingRegion = false;
    dragStartPoint = null;
    originalRegion = null;
    currentSnapGuides = [];
    draw();

    if (canvasElement) {
      canvasElement.style.cursor = 'crosshair';
    }
  }

  function handleKeyDown(e) {
    if (!isActive) return;
    if (e.key === 'Escape') handleCancel();
    else if (e.key === 'Enter') handleSave();
  }

  function handleSave() {
    if (callbacks && callbacks.onSave) {
      callbacks.onSave(currentRegion);
    }
    hide();
  }

  function handleCancel() {
    if (callbacks && callbacks.onCancel) {
      callbacks.onCancel();
    }
    hide();
  }

  /**
   * Show the region editor overlay.
   */
  function show(region, cbs) {
    if (isActive) hide();

    const container = helpers().findSelfViewContainer();
    if (!container) {
      console.error('[WallRegionEditor] Could not find self-view container');
      if (cbs && cbs.onCancel) cbs.onCancel();
      return;
    }

    currentRegion = JSON.parse(JSON.stringify(region));
    callbacks = cbs;
    isActive = true;

    // Initialize snapping
    const snapResult = snapping().initializeSnapping();
    edgeDetector = snapResult.edgeDetector;
    snapEngine = snapResult.snapEngine;

    // Create overlay elements
    const elements = helpers().createOverlayElements(container, {
      onSave: handleSave,
      onCancel: handleCancel,
      onSnapChange: (checked) => {
        snapEnabled = checked;
        if (snapEnabled) {
          throttledEdgeMapUpdate();
        } else {
          edgeMap = null;
          currentSnapGuides = [];
          draw();
        }
      },
      onResize: () => {
        resizeCanvas();
        draw();
      }
    }, snapEnabled);

    overlayElement = elements.overlayElement;
    canvasElement = elements.canvasElement;

    // Set up canvas event listeners
    canvasElement.addEventListener('mousedown', handleMouseDown);
    canvasElement.addEventListener('mousemove', handleMouseMove);
    canvasElement.addEventListener('mouseup', handleMouseUp);
    canvasElement.addEventListener('mouseleave', handleMouseUp);

    document.addEventListener('keydown', handleKeyDown);

    resizeCanvas();
    draw();

    console.log('[WallRegionEditor] Showing editor');
  }

  /**
   * Hide the region editor overlay.
   */
  function hide() {
    if (!isActive) return;

    isActive = false;
    currentRegion = null;
    callbacks = null;
    draggingCorner = null;
    isDraggingRegion = false;
    dragStartPoint = null;
    originalRegion = null;
    edgeMap = null;
    currentSnapGuides = [];
    lastEdgeDetectionTime = 0;

    if (overlayElement && overlayElement.parentNode) {
      overlayElement.parentNode.removeChild(overlayElement);
    }

    overlayElement = null;
    canvasElement = null;
    ctx = null;

    document.removeEventListener('keydown', handleKeyDown);

    console.log('[WallRegionEditor] Hidden');
  }

  function updateRegion(region) {
    if (!isActive) return;
    currentRegion = JSON.parse(JSON.stringify(region));
    draw();
  }

  function isEditorActive() {
    return isActive;
  }

  function getCurrentRegion() {
    return currentRegion ? JSON.parse(JSON.stringify(currentRegion)) : null;
  }

  // Export
  window.WallRegionEditor = {
    show,
    hide,
    updateRegion,
    isActive: isEditorActive,
    getCurrentRegion
  };

  console.log('[WallRegionEditor] Loaded');
})();
