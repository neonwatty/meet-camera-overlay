/**
 * Wall Region Editor Helpers
 *
 * Geometry utilities and DOM helpers for the wall region editor overlay.
 * Provides functions for finding containers, hit-testing corners/regions,
 * and creating editor overlay DOM elements.
 *
 * Exposed as window._WallRegionHelpers
 */

(function() {
  'use strict';

  /**
   * Find the self-view video container in Meet's DOM.
   * Meet uses data-self-name attribute on self-view containers.
   */
  function findSelfViewContainer() {
    const selfView = document.querySelector('[data-self-name="true"]');
    if (selfView) {
      return selfView;
    }

    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      const container = video.closest('[data-participant-id]');
      if (container && container.querySelector('[data-self-name]')) {
        return container;
      }
    }

    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
      return videoContainer;
    }

    return null;
  }

  /**
   * Get corner at mouse position.
   * @param {number} x - Mouse X in canvas pixels
   * @param {number} y - Mouse Y in canvas pixels
   * @param {Object} region - Current region with corner coordinates (percentages)
   * @param {HTMLCanvasElement} canvasEl - Canvas element for dimensions
   * @param {number} hitRadius - Hit radius in pixels
   * @returns {string|null} Corner name or null
   */
  function getCornerAtPoint(x, y, region, canvasEl, hitRadius) {
    if (!region || !canvasEl) return null;

    const width = canvasEl.width;
    const height = canvasEl.height;

    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

    for (const corner of corners) {
      const px = (region[corner].x / 100) * width;
      const py = (region[corner].y / 100) * height;
      const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));

      if (dist <= hitRadius) {
        return corner;
      }
    }

    return null;
  }

  /**
   * Check if point is inside the region using ray casting.
   * @param {number} x - Mouse X in canvas pixels
   * @param {number} y - Mouse Y in canvas pixels
   * @param {Object} region - Current region
   * @param {HTMLCanvasElement} canvasEl - Canvas element
   * @returns {boolean}
   */
  function isPointInRegion(x, y, region, canvasEl) {
    if (!region || !canvasEl) return false;

    const width = canvasEl.width;
    const height = canvasEl.height;

    const px = (x / width) * 100;
    const py = (y / height) * 100;

    const polygon = [
      region.topLeft,
      region.topRight,
      region.bottomRight,
      region.bottomLeft
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
   * Create the editor overlay DOM elements.
   * @param {HTMLElement} container - Parent container
   * @param {Object} handlers - Event handler callbacks { onSave, onCancel, onSnapChange, onResize }
   * @param {boolean} snapEnabled - Initial snap toggle state
   * @returns {{overlayElement: HTMLElement, canvasElement: HTMLCanvasElement, resizeObserver: Object|null}}
   */
  function createOverlayElements(container, handlers, snapEnabled) {
    const overlayElement = document.createElement('div');
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

    const canvasElement = document.createElement('canvas');
    canvasElement.className = 'region-editor-canvas';
    canvasElement.style.cssText = `
      width: 100%;
      height: 100%;
      cursor: crosshair;
    `;

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
    saveBtn.addEventListener('click', handlers.onSave);

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
    cancelBtn.addEventListener('click', handlers.onCancel);

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
      handlers.onSnapChange(snapCheckbox.checked);
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

    // Ensure container has position for absolute positioning
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(overlayElement);

    // Observe resize
    let resizeObserver = null;
    const ResizeObserverClass = window.ResizeObserver;
    if (ResizeObserverClass) {
      resizeObserver = new ResizeObserverClass(() => {
        handlers.onResize();
      });
      resizeObserver.observe(container);
    }

    return { overlayElement, canvasElement, resizeObserver };
  }

  // Export
  window._WallRegionHelpers = {
    findSelfViewContainer,
    getCornerAtPoint,
    isPointInRegion,
    createOverlayElements
  };
})();
