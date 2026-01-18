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

  // Constants
  const HANDLE_RADIUS = 12;
  const HANDLE_HIT_RADIUS = 20;
  const _MIN_REGION_SIZE = 5; // Minimum 5% width/height (reserved for future validation)
  const STROKE_COLOR = '#e94560';
  const FILL_COLOR = 'rgba(233, 69, 96, 0.2)';
  const HANDLE_FILL = '#e94560';
  const HANDLE_STROKE = '#ffffff';

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
      return;
    }

    // Check for region drag (move entire region)
    if (isPointInRegion(x, y)) {
      isDraggingRegion = true;
      dragStartPoint = { x, y };
      originalRegion = JSON.parse(JSON.stringify(currentRegion));
      canvasElement.style.cursor = 'grabbing';
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
      const newX = Math.max(0, Math.min(100, (x / width) * 100));
      const newY = Math.max(0, Math.min(100, (y / height) * 100));

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
