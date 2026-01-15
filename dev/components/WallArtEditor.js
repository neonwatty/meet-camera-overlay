/**
 * Wall Art Editor Component
 *
 * Provides region selection UI with 4-corner draggable handles
 * for defining wall art placement areas.
 */

import {
  createDefaultRegion,
  validateRegion,
  findCornerAtPoint,
  moveCorner,
  moveRegion,
  isPointInRegion,
  drawRegion,
  createWallArtOverlay
} from '../../lib/wall-region.js';

let processor = null;
let editorCanvas = null;
let editorCtx = null;
let regions = [];
let selectedRegionIndex = -1;
let activeCorner = null;
let isDragging = false;
let dragStartPoint = null;
let dragStartRegion = null;

// API callbacks
let api = null;

/**
 * Initialize the Wall Art Editor.
 *
 * @param {DevVideoProcessor} videoProcessor - Video processor instance
 * @param {Object} editorApi - API for managing wall art regions
 */
export function initWallArtEditor(videoProcessor, editorApi) {
  processor = videoProcessor;
  api = editorApi;

  const panel = document.querySelector('#wall-art-editor .editor-content');
  if (!panel) return;

  panel.innerHTML = `
    <div class="editor-toolbar">
      <button id="add-region-btn" class="btn btn-primary btn-small">+ Add Region</button>
      <button id="delete-region-btn" class="btn btn-secondary btn-small" disabled>Delete</button>
      <select id="aspect-ratio-select" class="select-small" disabled>
        <option value="stretch">Stretch</option>
        <option value="fit">Fit (Letterbox)</option>
        <option value="crop">Crop (Fill)</option>
      </select>
    </div>

    <div class="editor-preview">
      <canvas id="region-editor-canvas"></canvas>
      <div class="editor-hint">Click and drag corners to adjust region</div>
    </div>

    <div class="region-list" id="region-list">
      <div class="empty-state">No regions defined</div>
    </div>

    <div class="editor-info" id="editor-info">
      <span class="info-label">Selected:</span>
      <span class="info-value" id="info-selected">None</span>
    </div>
  `;

  // Add editor styles
  addEditorStyles();

  // Get canvas element
  editorCanvas = document.getElementById('region-editor-canvas');
  editorCtx = editorCanvas.getContext('2d');

  // Set up event handlers
  setupEventHandlers();

  // Load existing regions
  loadRegions();

  // Start render loop for editor preview
  requestAnimationFrame(renderEditorPreview);
}

/**
 * Add CSS styles for the editor.
 */
function addEditorStyles() {
  const existingStyle = document.getElementById('wall-art-editor-styles');
  if (existingStyle) return;

  const style = document.createElement('style');
  style.id = 'wall-art-editor-styles';
  style.textContent = `
    .editor-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      align-items: center;
    }

    .editor-preview {
      position: relative;
      background: #0a0a0a;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    #region-editor-canvas {
      width: 100%;
      height: auto;
      display: block;
      cursor: crosshair;
    }

    #region-editor-canvas.dragging {
      cursor: grabbing;
    }

    #region-editor-canvas.corner-hover {
      cursor: grab;
    }

    .editor-hint {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: #888;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      pointer-events: none;
    }

    .region-list {
      max-height: 150px;
      overflow-y: auto;
      margin-bottom: 12px;
    }

    .region-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1a1a2e;
      border-radius: 4px;
      margin-bottom: 4px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.2s;
    }

    .region-item:hover {
      border-color: #0f3460;
    }

    .region-item.selected {
      border-color: #e94560;
    }

    .region-item .region-name {
      font-size: 12px;
      color: #e0e0e0;
    }

    .region-item .region-size {
      font-size: 10px;
      color: #666;
    }

    .editor-info {
      display: flex;
      gap: 8px;
      font-size: 11px;
      color: #888;
    }

    .info-value {
      color: #e94560;
    }

    .empty-state {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Set up event handlers for the editor.
 */
function setupEventHandlers() {
  // Add Region button
  document.getElementById('add-region-btn').addEventListener('click', addNewRegion);

  // Delete Region button
  document.getElementById('delete-region-btn').addEventListener('click', deleteSelectedRegion);

  // Aspect ratio selector
  document.getElementById('aspect-ratio-select').addEventListener('change', (e) => {
    if (selectedRegionIndex >= 0 && regions[selectedRegionIndex]) {
      regions[selectedRegionIndex].aspectRatioMode = e.target.value;
      saveRegions();
    }
  });

  // Canvas mouse events
  editorCanvas.addEventListener('mousedown', handleMouseDown);
  editorCanvas.addEventListener('mousemove', handleMouseMove);
  editorCanvas.addEventListener('mouseup', handleMouseUp);
  editorCanvas.addEventListener('mouseleave', handleMouseUp);

  // Touch events for mobile
  editorCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  editorCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  editorCanvas.addEventListener('touchend', handleTouchEnd);
}

/**
 * Load regions from storage/API.
 */
function loadRegions() {
  if (api && api.getWallArtRegions) {
    regions = api.getWallArtRegions() || [];
  }
  renderRegionList();
  updateToolbarState();
}

/**
 * Save regions to storage/API.
 */
function saveRegions() {
  if (api && api.setWallArtRegions) {
    api.setWallArtRegions(regions);
  }
}

/**
 * Add a new region.
 */
function addNewRegion() {
  const region = createDefaultRegion(20, 20, 60, 60);
  const overlay = createWallArtOverlay(region, {
    name: `Region ${regions.length + 1}`
  });

  regions.push(overlay);
  selectedRegionIndex = regions.length - 1;

  saveRegions();
  renderRegionList();
  updateToolbarState();
}

/**
 * Delete the selected region.
 */
function deleteSelectedRegion() {
  if (selectedRegionIndex < 0) return;

  regions.splice(selectedRegionIndex, 1);
  selectedRegionIndex = regions.length > 0 ? Math.min(selectedRegionIndex, regions.length - 1) : -1;

  saveRegions();
  renderRegionList();
  updateToolbarState();
}

/**
 * Render the region list.
 */
function renderRegionList() {
  const list = document.getElementById('region-list');
  if (!list) return;

  if (regions.length === 0) {
    list.innerHTML = '<div class="empty-state">No regions defined</div>';
    return;
  }

  list.innerHTML = regions.map((overlay, index) => {
    const bounds = getRegionBoundsForDisplay(overlay.region);
    const selectedClass = index === selectedRegionIndex ? 'selected' : '';

    return `
      <div class="region-item ${selectedClass}" data-index="${index}">
        <div>
          <div class="region-name">${overlay.name || `Region ${index + 1}`}</div>
          <div class="region-size">${bounds.width.toFixed(0)}% x ${bounds.height.toFixed(0)}%</div>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  list.querySelectorAll('.region-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedRegionIndex = parseInt(item.dataset.index, 10);
      renderRegionList();
      updateToolbarState();
    });
  });
}

/**
 * Get region bounds for display.
 */
function getRegionBoundsForDisplay(region) {
  const xs = [region.topLeft.x, region.topRight.x, region.bottomLeft.x, region.bottomRight.x];
  const ys = [region.topLeft.y, region.topRight.y, region.bottomLeft.y, region.bottomRight.y];

  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

/**
 * Update toolbar button states.
 */
function updateToolbarState() {
  const deleteBtn = document.getElementById('delete-region-btn');
  const aspectSelect = document.getElementById('aspect-ratio-select');
  const infoSelected = document.getElementById('info-selected');

  if (selectedRegionIndex >= 0 && regions[selectedRegionIndex]) {
    deleteBtn.disabled = false;
    aspectSelect.disabled = false;
    aspectSelect.value = regions[selectedRegionIndex].aspectRatioMode || 'stretch';
    infoSelected.textContent = regions[selectedRegionIndex].name || `Region ${selectedRegionIndex + 1}`;
  } else {
    deleteBtn.disabled = true;
    aspectSelect.disabled = true;
    infoSelected.textContent = 'None';
  }
}

/**
 * Get mouse position relative to canvas in percentage coordinates.
 */
function getCanvasPosition(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  return { x, y };
}

/**
 * Handle mouse down on canvas.
 */
function handleMouseDown(e) {
  e.preventDefault();
  const pos = getCanvasPosition(e);

  // Check if clicking on a corner handle
  for (let i = 0; i < regions.length; i++) {
    const corner = findCornerAtPoint(pos, regions[i].region, 5);
    if (corner) {
      selectedRegionIndex = i;
      activeCorner = corner;
      isDragging = true;
      dragStartPoint = pos;
      dragStartRegion = JSON.parse(JSON.stringify(regions[i].region));
      editorCanvas.classList.add('dragging');
      renderRegionList();
      updateToolbarState();
      return;
    }
  }

  // Check if clicking inside a region (to move it)
  for (let i = 0; i < regions.length; i++) {
    if (isPointInRegion(pos, regions[i].region)) {
      selectedRegionIndex = i;
      activeCorner = null;
      isDragging = true;
      dragStartPoint = pos;
      dragStartRegion = JSON.parse(JSON.stringify(regions[i].region));
      editorCanvas.classList.add('dragging');
      renderRegionList();
      updateToolbarState();
      return;
    }
  }

  // Clicked outside all regions - deselect
  selectedRegionIndex = -1;
  renderRegionList();
  updateToolbarState();
}

/**
 * Handle mouse move on canvas.
 */
function handleMouseMove(e) {
  const pos = getCanvasPosition(e);

  if (isDragging && selectedRegionIndex >= 0 && dragStartRegion) {
    if (activeCorner) {
      // Moving a corner
      regions[selectedRegionIndex].region = moveCorner(
        dragStartRegion,
        activeCorner,
        pos
      );
    } else {
      // Moving the entire region
      const deltaX = pos.x - dragStartPoint.x;
      const deltaY = pos.y - dragStartPoint.y;
      regions[selectedRegionIndex].region = moveRegion(dragStartRegion, deltaX, deltaY);
    }
    regions[selectedRegionIndex].updatedAt = Date.now();
    return;
  }

  // Update cursor based on hover state
  let cursorSet = false;

  for (let i = 0; i < regions.length; i++) {
    const corner = findCornerAtPoint(pos, regions[i].region, 5);
    if (corner) {
      editorCanvas.classList.add('corner-hover');
      editorCanvas.classList.remove('dragging');
      cursorSet = true;
      break;
    }
  }

  if (!cursorSet) {
    editorCanvas.classList.remove('corner-hover');
  }
}

/**
 * Handle mouse up on canvas.
 */
function handleMouseUp() {
  if (isDragging) {
    isDragging = false;
    activeCorner = null;
    dragStartPoint = null;
    dragStartRegion = null;
    editorCanvas.classList.remove('dragging');

    // Validate and save
    if (selectedRegionIndex >= 0 && regions[selectedRegionIndex]) {
      const validation = validateRegion(regions[selectedRegionIndex].region);
      if (!validation.valid) {
        console.warn('[WallArtEditor] Invalid region:', validation.errors);
      }
    }

    saveRegions();
    renderRegionList();
  }
}

/**
 * Handle touch start.
 */
function handleTouchStart(e) {
  if (e.touches.length === 1) {
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} });
  }
}

/**
 * Handle touch move.
 */
function handleTouchMove(e) {
  if (e.touches.length === 1) {
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }
}

/**
 * Handle touch end.
 */
function handleTouchEnd() {
  handleMouseUp();
}

/**
 * Render the editor preview.
 */
function renderEditorPreview() {
  if (!editorCanvas || !editorCtx || !processor) {
    requestAnimationFrame(renderEditorPreview);
    return;
  }

  // Match canvas size to processor canvas
  const processorCanvas = processor.canvas;
  if (processorCanvas && (editorCanvas.width !== processorCanvas.width || editorCanvas.height !== processorCanvas.height)) {
    editorCanvas.width = processorCanvas.width;
    editorCanvas.height = processorCanvas.height;
  }

  // Clear canvas
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

  // Draw video frame from processor
  if (processorCanvas) {
    editorCtx.drawImage(processorCanvas, 0, 0);
  }

  // Draw all regions
  regions.forEach((overlay, index) => {
    const isSelected = index === selectedRegionIndex;
    drawRegion(editorCtx, overlay.region, editorCanvas.width, editorCanvas.height, {
      strokeColor: isSelected ? '#e94560' : '#666666',
      fillColor: isSelected ? 'rgba(233, 69, 96, 0.15)' : 'rgba(100, 100, 100, 0.1)',
      lineWidth: isSelected ? 3 : 2,
      showHandles: isSelected,
      handleRadius: 10
    });
  });

  requestAnimationFrame(renderEditorPreview);
}

/**
 * Get all defined regions.
 *
 * @returns {Array} Array of wall art overlays
 */
export function getRegions() {
  return regions;
}

/**
 * Set regions from external source.
 *
 * @param {Array} newRegions - Array of wall art overlays
 */
export function setRegions(newRegions) {
  regions = newRegions || [];
  selectedRegionIndex = -1;
  renderRegionList();
  updateToolbarState();
}
