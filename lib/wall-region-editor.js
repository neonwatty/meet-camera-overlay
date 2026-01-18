/**
 * Wall Region Editor Overlay
 *
 * An interactive overlay for editing wall art regions directly on the Google Meet video feed.
 * Allows users to drag corners and see exactly where regions map to their actual background.
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
  const EDGE_DETECTION_COOLDOWN = 500; // ms between edge detections

  // Constants
  const HANDLE_RADIUS = 12;
  const HANDLE_HIT_RADIUS = 20;
  const _MIN_REGION_SIZE = 5; // Minimum 5% width/height (reserved for future validation)
  const STROKE_COLOR = '#e94560';
  const FILL_COLOR = 'rgba(233, 69, 96, 0.2)';
  const HANDLE_FILL = '#e94560';
  const HANDLE_STROKE = '#ffffff';
  const SNAP_GUIDE_COLOR = '#00ff00';
  const EDGE_SNAP_COLOR = '#ff6600';
  const GRID_SNAP_COLOR = '#0066ff';

  /**
   * Find the self-view video container in Meet's DOM.
   * Meet uses data-self-name attribute on self-view containers.
   */
  function findSelfViewContainer() {
    // Try to find the self-view container in Meet
    // Meet marks self-view with data-self-name attribute
    const selfView = document.querySelector('[data-self-name="true"]');
    if (selfView) {
      return selfView;
    }

    // Fallback: look for video elements and find the one most likely to be self-view
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      const container = video.closest('[data-participant-id]');
      if (container && container.querySelector('[data-self-name]')) {
        return container;
      }
    }

    // Last fallback: find main video container
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
      return videoContainer;
    }

    return null;
  }

  /**
   * Initialize snapping system.
   */
  function initializeSnapping() {
    // Check if EdgeDetector and SnapEngine are available
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
  }

  /**
   * Capture video frame for edge detection.
   */
  function captureVideoFrame() {
    if (!canvasElement) return null;

    // Find video element in the same container
    const container = overlayElement?.parentElement;
    if (!container) return null;

    const video = container.querySelector('video');
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Create temporary canvas for video capture
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Use lower resolution for edge detection (faster processing)
    const scale = 0.5;
    tempCanvas.width = Math.floor(video.videoWidth * scale);
    tempCanvas.height = Math.floor(video.videoHeight * scale);

    // Draw video frame
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  }

  /**
   * Update edge map from current video frame.
   */
  function updateEdgeMap() {
    if (!edgeDetector || !snapEnabled) {
      edgeMap = null;
      return;
    }

    const now = Date.now();
    if (now - lastEdgeDetectionTime < EDGE_DETECTION_COOLDOWN) {
      return; // Throttle edge detection
    }

    const imageData = captureVideoFrame();
    if (!imageData) {
      edgeMap = null;
      return;
    }

    edgeMap = edgeDetector.detectEdges(imageData);
    lastEdgeDetectionTime = now;

    console.log('[WallRegionEditor] Edge map updated');
  }

  /**
   * Get other corners for alignment snapping.
   */
  function getOtherCorners(excludeCorner) {
    if (!currentRegion) return [];

    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    return corners
      .filter(c => c !== excludeCorner)
      .map(c => currentRegion[c]);
  }

  /**
   * Draw snap guides on the canvas.
   */
  function drawSnapGuides() {
    if (!ctx || !canvasElement || currentSnapGuides.length === 0) return;

    const width = canvasElement.width;
    const height = canvasElement.height;

    ctx.save();
    ctx.setLineDash([4, 4]);

    for (const guide of currentSnapGuides) {
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

  /**
   * Create the editor overlay DOM elements.
   */
  function createOverlayElements(container) {
    // Create overlay wrapper
    overlayElement = document.createElement('div');
    overlayElement.className = 'region-editor-overlay';
    overlayElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 10000;
      pointer-events: auto;
      transform: scaleX(-1);
    `;

    // Create canvas for drawing
    canvasElement = document.createElement('canvas');
    canvasElement.className = 'region-editor-canvas';
    canvasElement.style.cssText = `
      width: 100%;
      height: 100%;
      cursor: crosshair;
    `;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'region-editor-buttons';
    buttonContainer.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%) scaleX(-1);
      display: flex;
      gap: 8px;
      z-index: 10001;
    `;

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'region-editor-save';
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = `
      padding: 8px 24px;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    saveBtn.addEventListener('click', handleSave);

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'region-editor-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 24px;
      background: #3c4043;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    cancelBtn.addEventListener('click', handleCancel);

    // Snap toggle
    const snapToggle = document.createElement('label');
    snapToggle.className = 'region-editor-snap-toggle';
    snapToggle.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(60, 64, 67, 0.9);
      color: white;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    const snapCheckbox = document.createElement('input');
    snapCheckbox.type = 'checkbox';
    snapCheckbox.checked = snapEnabled;
    snapCheckbox.style.cssText = `
      width: 16px;
      height: 16px;
      cursor: pointer;
    `;
    snapCheckbox.addEventListener('change', () => {
      snapEnabled = snapCheckbox.checked;
      if (snapEnabled) {
        updateEdgeMap();
      } else {
        edgeMap = null;
        currentSnapGuides = [];
        draw();
      }
    });

    const snapLabel = document.createElement('span');
    snapLabel.textContent = 'Snap';

    snapToggle.appendChild(snapCheckbox);
    snapToggle.appendChild(snapLabel);

    buttonContainer.appendChild(snapToggle);
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);

    overlayElement.appendChild(canvasElement);
    overlayElement.appendChild(buttonContainer);

    // Set up canvas event listeners
    canvasElement.addEventListener('mousedown', handleMouseDown);
    canvasElement.addEventListener('mousemove', handleMouseMove);
    canvasElement.addEventListener('mouseup', handleMouseUp);
    canvasElement.addEventListener('mouseleave', handleMouseUp);

    // Keyboard listener for escape
    document.addEventListener('keydown', handleKeyDown);

    // Ensure container has position for absolute positioning
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(overlayElement);

    // Set canvas size to match container
    resizeCanvas();

    // Observe resize using window.ResizeObserver (browser API)
    let resizeObserver = null;
    const ResizeObserverClass = window.ResizeObserver;
    if (ResizeObserverClass) {
      resizeObserver = new ResizeObserverClass(() => {
        resizeCanvas();
        draw();
      });
      resizeObserver.observe(container);
    }

    return { overlayElement, canvasElement, resizeObserver };
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

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Convert percentages to pixels
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
      { point: tl, name: 'topLeft' },
      { point: tr, name: 'topRight' },
      { point: bl, name: 'bottomLeft' },
      { point: br, name: 'bottomRight' }
    ];

    for (const corner of corners) {
      // White border
      ctx.fillStyle = HANDLE_STROKE;
      ctx.beginPath();
      ctx.arc(corner.point.x, corner.point.y, HANDLE_RADIUS + 2, 0, Math.PI * 2);
      ctx.fill();

      // Colored fill
      ctx.fillStyle = HANDLE_FILL;
      ctx.beginPath();
      ctx.arc(corner.point.x, corner.point.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw move icon in center
    const center = {
      x: (tl.x + tr.x + bl.x + br.x) / 4,
      y: (tl.y + tr.y + bl.y + br.y) / 4
    };

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw move arrows
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2;
    const arrowSize = 6;

    // Horizontal arrows
    ctx.beginPath();
    ctx.moveTo(center.x - 8, center.y);
    ctx.lineTo(center.x + 8, center.y);
    ctx.moveTo(center.x - 8 + arrowSize, center.y - arrowSize / 2);
    ctx.lineTo(center.x - 8, center.y);
    ctx.lineTo(center.x - 8 + arrowSize, center.y + arrowSize / 2);
    ctx.moveTo(center.x + 8 - arrowSize, center.y - arrowSize / 2);
    ctx.lineTo(center.x + 8, center.y);
    ctx.lineTo(center.x + 8 - arrowSize, center.y + arrowSize / 2);
    ctx.stroke();

    // Vertical arrows
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - 8);
    ctx.lineTo(center.x, center.y + 8);
    ctx.moveTo(center.x - arrowSize / 2, center.y - 8 + arrowSize);
    ctx.lineTo(center.x, center.y - 8);
    ctx.lineTo(center.x + arrowSize / 2, center.y - 8 + arrowSize);
    ctx.moveTo(center.x - arrowSize / 2, center.y + 8 - arrowSize);
    ctx.lineTo(center.x, center.y + 8);
    ctx.lineTo(center.x + arrowSize / 2, center.y + 8 - arrowSize);
    ctx.stroke();

    // Draw snap guides if active
    drawSnapGuides();
  }

  /**
   * Get corner at mouse position.
   */
  function getCornerAtPoint(x, y) {
    if (!currentRegion || !canvasElement) return null;

    const width = canvasElement.width;
    const height = canvasElement.height;

    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

    for (const corner of corners) {
      const px = (currentRegion[corner].x / 100) * width;
      const py = (currentRegion[corner].y / 100) * height;
      const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));

      if (dist <= HANDLE_HIT_RADIUS) {
        return corner;
      }
    }

    return null;
  }

  /**
   * Check if point is inside the region.
   */
  function isPointInRegion(x, y) {
    if (!currentRegion || !canvasElement) return false;

    const width = canvasElement.width;
    const height = canvasElement.height;

    // Convert to percentage
    const px = (x / width) * 100;
    const py = (y / height) * 100;

    // Use ray casting algorithm
    const polygon = [
      currentRegion.topLeft,
      currentRegion.topRight,
      currentRegion.bottomRight,
      currentRegion.bottomLeft
    ];

    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Handle mouse down.
   */
  function handleMouseDown(e) {
    if (!isActive) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for corner handle
    const corner = getCornerAtPoint(x, y);
    if (corner) {
      draggingCorner = corner;
      canvasElement.style.cursor = 'grabbing';

      // Update edge map for snapping when starting to drag
      if (snapEnabled && edgeDetector) {
        updateEdgeMap();
      }
      return;
    }

    // Check for region drag (move entire region)
    if (isPointInRegion(x, y)) {
      isDraggingRegion = true;
      dragStartPoint = { x, y };
      originalRegion = JSON.parse(JSON.stringify(currentRegion));
      canvasElement.style.cursor = 'grabbing';

      // Clear snap guides during region drag
      currentSnapGuides = [];
    }
  }

  /**
   * Handle mouse move.
   */
  function handleMouseMove(e) {
    if (!isActive || !canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle corner dragging
    if (draggingCorner) {
      const width = canvasElement.width;
      const height = canvasElement.height;

      // Convert to percentage and clamp
      let newX = Math.max(0, Math.min(100, (x / width) * 100));
      let newY = Math.max(0, Math.min(100, (y / height) * 100));

      // Apply snapping if enabled
      if (snapEnabled && snapEngine) {
        const rawPoint = { x: newX, y: newY };
        const otherCorners = getOtherCorners(draggingCorner);

        // Get snap candidates
        const candidates = snapEngine.getSnapCandidates(
          rawPoint,
          edgeDetector,
          edgeMap,
          otherCorners
        );

        // Apply best snap
        const snapResult = snapEngine.applyBestSnap(rawPoint, candidates);

        if (snapResult.snapped) {
          newX = snapResult.point.x;
          newY = snapResult.point.y;
        }

        // Get and store snap guides for visualization
        currentSnapGuides = snapEngine.getSnapGuides(rawPoint, candidates, currentRegion);
      } else {
        currentSnapGuides = [];
      }

      currentRegion[draggingCorner] = { x: newX, y: newY };

      // Notify of update
      if (callbacks && callbacks.onUpdate) {
        callbacks.onUpdate(currentRegion);
      }

      draw();
      return;
    }

    // Handle region dragging
    if (isDraggingRegion && dragStartPoint && originalRegion) {
      const width = canvasElement.width;
      const height = canvasElement.height;

      const dx = ((x - dragStartPoint.x) / width) * 100;
      const dy = ((y - dragStartPoint.y) / height) * 100;

      // Get bounds of original region
      const xs = [originalRegion.topLeft.x, originalRegion.topRight.x, originalRegion.bottomLeft.x, originalRegion.bottomRight.x];
      const ys = [originalRegion.topLeft.y, originalRegion.topRight.y, originalRegion.bottomLeft.y, originalRegion.bottomRight.y];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Clamp delta to keep region in bounds
      let clampedDx = dx;
      let clampedDy = dy;

      if (minX + dx < 0) clampedDx = -minX;
      if (maxX + dx > 100) clampedDx = 100 - maxX;
      if (minY + dy < 0) clampedDy = -minY;
      if (maxY + dy > 100) clampedDy = 100 - maxY;

      // Apply delta to all corners
      currentRegion.topLeft = { x: originalRegion.topLeft.x + clampedDx, y: originalRegion.topLeft.y + clampedDy };
      currentRegion.topRight = { x: originalRegion.topRight.x + clampedDx, y: originalRegion.topRight.y + clampedDy };
      currentRegion.bottomLeft = { x: originalRegion.bottomLeft.x + clampedDx, y: originalRegion.bottomLeft.y + clampedDy };
      currentRegion.bottomRight = { x: originalRegion.bottomRight.x + clampedDx, y: originalRegion.bottomRight.y + clampedDy };

      // Notify of update
      if (callbacks && callbacks.onUpdate) {
        callbacks.onUpdate(currentRegion);
      }

      draw();
      return;
    }

    // Update cursor based on what's under the mouse
    const corner = getCornerAtPoint(x, y);
    if (corner) {
      canvasElement.style.cursor = 'grab';
    } else if (isPointInRegion(x, y)) {
      canvasElement.style.cursor = 'move';
    } else {
      canvasElement.style.cursor = 'crosshair';
    }
  }

  /**
   * Handle mouse up.
   */
  function handleMouseUp() {
    draggingCorner = null;
    isDraggingRegion = false;
    dragStartPoint = null;
    originalRegion = null;

    // Clear snap guides
    currentSnapGuides = [];
    draw();

    if (canvasElement) {
      canvasElement.style.cursor = 'crosshair';
    }
  }

  /**
   * Handle keyboard events.
   */
  function handleKeyDown(e) {
    if (!isActive) return;

    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter') {
      handleSave();
    }
  }

  /**
   * Handle save button click.
   */
  function handleSave() {
    if (callbacks && callbacks.onSave) {
      callbacks.onSave(currentRegion);
    }
    hide();
  }

  /**
   * Handle cancel button click.
   */
  function handleCancel() {
    if (callbacks && callbacks.onCancel) {
      callbacks.onCancel();
    }
    hide();
  }

  /**
   * Show the region editor overlay.
   * @param {Object} region - The region to edit (percentage coordinates)
   * @param {Object} cbs - Callbacks { onUpdate, onSave, onCancel }
   */
  function show(region, cbs) {
    if (isActive) {
      hide();
    }

    // Find container for overlay
    const container = findSelfViewContainer();
    if (!container) {
      console.error('[WallRegionEditor] Could not find self-view container');
      if (cbs && cbs.onCancel) {
        cbs.onCancel();
      }
      return;
    }

    // Store state
    currentRegion = JSON.parse(JSON.stringify(region));
    callbacks = cbs;
    isActive = true;

    // Initialize snapping system
    initializeSnapping();

    // Create overlay elements
    createOverlayElements(container);

    // Initial draw
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

    // Reset snapping state
    edgeMap = null;
    currentSnapGuides = [];
    lastEdgeDetectionTime = 0;

    // Remove overlay
    if (overlayElement && overlayElement.parentNode) {
      overlayElement.parentNode.removeChild(overlayElement);
    }

    overlayElement = null;
    canvasElement = null;
    ctx = null;

    // Remove keyboard listener
    document.removeEventListener('keydown', handleKeyDown);

    console.log('[WallRegionEditor] Hidden');
  }

  /**
   * Update the region from an external source.
   */
  function updateRegion(region) {
    if (!isActive) return;

    currentRegion = JSON.parse(JSON.stringify(region));
    draw();
  }

  /**
   * Check if editor is currently active.
   */
  function isEditorActive() {
    return isActive;
  }

  /**
   * Get the current region being edited.
   */
  function getCurrentRegion() {
    return currentRegion ? JSON.parse(JSON.stringify(currentRegion)) : null;
  }

  // Export for use in inject.js
  window.WallRegionEditor = {
    show,
    hide,
    updateRegion,
    isActive: isEditorActive,
    getCurrentRegion
  };

  console.log('[WallRegionEditor] Loaded');
})();
