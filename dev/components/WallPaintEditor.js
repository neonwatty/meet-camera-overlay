/**
 * Wall Paint Editor Component
 *
 * Provides color selection UI for wall paint:
 * - Eyedropper mode (click video to sample)
 * - Color picker (manual selection)
 * - "Detect wall color" button (AI detection)
 * - Opacity slider
 */

import {
  sampleColor,
  detectDominantColor,
  rgbToHex,
  hexToRgb,
  getContrastingTextColor
} from '../../lib/color-sampler.js';

let processor = null;
let api = null;
let selectedRegionIndex = -1;
let isEyedropperActive = false;

/**
 * Initialize the Wall Paint Editor.
 *
 * @param {DevVideoProcessor} videoProcessor - Video processor instance
 * @param {Object} editorApi - API for managing wall art regions
 */
export function initWallPaintEditor(videoProcessor, editorApi) {
  processor = videoProcessor;
  api = editorApi;

  const panel = document.querySelector('#wall-paint-editor .paint-content');
  if (!panel) return;

  panel.innerHTML = `
    <div class="paint-region-select">
      <label>Region:</label>
      <select id="paint-region-select" class="select-small">
        <option value="-1">Select region...</option>
      </select>
    </div>

    <div class="paint-controls" id="paint-controls" style="display: none;">
      <div class="paint-toggle">
        <label>
          <input type="checkbox" id="paint-enabled">
          Enable Paint
        </label>
      </div>

      <div class="color-section">
        <h4>Color</h4>
        <div class="color-preview-row">
          <div class="color-preview" id="color-preview">
            <span class="color-hex" id="color-hex">#808080</span>
          </div>
          <input type="color" id="color-picker" value="#808080" class="color-input">
        </div>

        <div class="color-tools">
          <button id="eyedropper-btn" class="btn btn-small btn-secondary">
            <span class="tool-icon">💧</span> Eyedropper
          </button>
          <button id="detect-color-btn" class="btn btn-small btn-secondary">
            <span class="tool-icon">🎨</span> Detect Wall
          </button>
        </div>
      </div>

      <div class="opacity-section">
        <h4>Opacity</h4>
        <div class="opacity-row">
          <input type="range" id="paint-opacity" min="0" max="100" value="100" class="slider">
          <span id="opacity-value">100%</span>
        </div>
      </div>
    </div>

    <div class="eyedropper-hint" id="eyedropper-hint" style="display: none;">
      Click on the video to sample a color
    </div>
  `;

  // Add styles
  addPaintEditorStyles();

  // Set up event handlers
  setupEventHandlers();

  // Initial update
  updateRegionSelect();
}

/**
 * Add CSS styles for the paint editor.
 */
function addPaintEditorStyles() {
  const existingStyle = document.getElementById('wall-paint-editor-styles');
  if (existingStyle) return;

  const style = document.createElement('style');
  style.id = 'wall-paint-editor-styles';
  style.textContent = `
    .paint-region-select {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .paint-region-select label {
      font-size: 12px;
      color: #888;
    }

    .paint-controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .paint-toggle {
      display: flex;
      align-items: center;
    }

    .paint-toggle label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 13px;
    }

    .color-section h4,
    .opacity-section h4 {
      margin: 0 0 8px 0;
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
    }

    .color-preview-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .color-preview {
      flex: 1;
      height: 40px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #333;
      transition: background-color 0.2s;
    }

    .color-hex {
      font-family: monospace;
      font-size: 14px;
      text-shadow: 0 0 4px rgba(0,0,0,0.5);
    }

    .color-input {
      width: 50px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .color-tools {
      display: flex;
      gap: 8px;
    }

    .color-tools .btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .tool-icon {
      font-size: 14px;
    }

    .opacity-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .opacity-row .slider {
      flex: 1;
    }

    #opacity-value {
      width: 40px;
      text-align: right;
      font-size: 12px;
      color: #e0e0e0;
    }

    .eyedropper-hint {
      background: #e94560;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      text-align: center;
      font-size: 12px;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .btn.eyedropper-active {
      background: #e94560 !important;
      color: white !important;
    }

    #output-canvas.eyedropper-mode {
      cursor: crosshair !important;
    }

    .eyedropper-sample-flash {
      position: fixed;
      pointer-events: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: eyedropper-flash 0.4s ease-out forwards;
      z-index: 10000;
    }

    .eyedropper-sample-flash::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 3px solid currentColor;
      animation: eyedropper-ring 0.4s ease-out forwards;
    }

    .eyedropper-sample-flash::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      transform: translate(-50%, -50%);
    }

    @keyframes eyedropper-flash {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
    }

    @keyframes eyedropper-ring {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Set up event handlers.
 */
function setupEventHandlers() {
  // Region select
  document.getElementById('paint-region-select').addEventListener('change', (e) => {
    selectedRegionIndex = parseInt(e.target.value, 10);
    updatePaintControls();
  });

  // Paint enabled toggle
  document.getElementById('paint-enabled').addEventListener('change', (e) => {
    updatePaintProperty('enabled', e.target.checked);
  });

  // Color picker
  document.getElementById('color-picker').addEventListener('input', (e) => {
    updatePaintProperty('color', e.target.value);
    updateColorPreview(e.target.value);
  });

  // Eyedropper button
  document.getElementById('eyedropper-btn').addEventListener('click', toggleEyedropper);

  // Detect color button
  document.getElementById('detect-color-btn').addEventListener('click', detectWallColor);

  // Opacity slider
  document.getElementById('paint-opacity').addEventListener('input', (e) => {
    const opacity = parseInt(e.target.value, 10) / 100;
    updatePaintProperty('opacity', opacity);
    document.getElementById('opacity-value').textContent = `${e.target.value}%`;
  });

  // Canvas click for eyedropper
  const outputCanvas = document.getElementById('output-canvas');
  if (outputCanvas) {
    outputCanvas.addEventListener('click', handleCanvasClick);
  }
}

/**
 * Update the region select dropdown.
 * Preserves the current selection if the region still exists.
 */
export function updateRegionSelect() {
  const select = document.getElementById('paint-region-select');
  if (!select || !api) return;

  const regions = api.getWallArtRegions() || [];

  // Store previous selection before rebuilding
  const previousSelection = selectedRegionIndex;

  select.innerHTML = '<option value="-1">Select region...</option>' +
    regions.map((region, index) =>
      `<option value="${index}">${region.name || `Region ${index + 1}`}</option>`
    ).join('');

  // Restore selection if the region still exists, otherwise reset
  if (previousSelection >= 0 && previousSelection < regions.length) {
    selectedRegionIndex = previousSelection;
    select.value = previousSelection.toString();
  } else {
    selectedRegionIndex = -1;
  }

  updatePaintControls();
}

/**
 * Update paint controls visibility and values.
 */
function updatePaintControls() {
  const controls = document.getElementById('paint-controls');
  if (!controls || !api) return;

  const regions = api.getWallArtRegions() || [];
  const region = selectedRegionIndex >= 0 ? regions[selectedRegionIndex] : null;

  if (!region) {
    controls.style.display = 'none';
    return;
  }

  controls.style.display = 'flex';

  // Initialize paint if not present
  if (!region.paint) {
    region.paint = {
      enabled: false,
      color: '#808080',
      opacity: 1,
      colorSource: 'picker'
    };
  }

  // Update controls
  document.getElementById('paint-enabled').checked = region.paint.enabled;
  document.getElementById('color-picker').value = region.paint.color;
  document.getElementById('paint-opacity').value = Math.round(region.paint.opacity * 100);
  document.getElementById('opacity-value').textContent = `${Math.round(region.paint.opacity * 100)}%`;

  updateColorPreview(region.paint.color);
}

/**
 * Update color preview display.
 */
function updateColorPreview(color) {
  const preview = document.getElementById('color-preview');
  const hexLabel = document.getElementById('color-hex');

  if (preview && hexLabel) {
    preview.style.backgroundColor = color;
    hexLabel.textContent = color.toUpperCase();

    // Set text color for contrast
    const rgb = hexToRgb(color);
    hexLabel.style.color = getContrastingTextColor(rgb);
  }
}

/**
 * Update a paint property on the selected region.
 */
function updatePaintProperty(property, value) {
  if (selectedRegionIndex < 0 || !api) return;

  const regions = api.getWallArtRegions() || [];
  const region = regions[selectedRegionIndex];

  if (!region) return;

  if (!region.paint) {
    region.paint = {
      enabled: false,
      color: '#808080',
      opacity: 1,
      colorSource: 'picker'
    };
  }

  region.paint[property] = value;
  region.paint.colorSource = property === 'color' ? 'picker' : region.paint.colorSource;
  region.updatedAt = Date.now();

  api.setWallArtRegions(regions);
}

/**
 * Toggle eyedropper mode.
 */
function toggleEyedropper() {
  isEyedropperActive = !isEyedropperActive;

  const btn = document.getElementById('eyedropper-btn');
  const hint = document.getElementById('eyedropper-hint');
  const canvas = document.getElementById('output-canvas');

  if (isEyedropperActive) {
    btn.classList.add('eyedropper-active');
    hint.style.display = 'block';
    if (canvas) canvas.classList.add('eyedropper-mode');
  } else {
    btn.classList.remove('eyedropper-active');
    hint.style.display = 'none';
    if (canvas) canvas.classList.remove('eyedropper-mode');
  }
}

/**
 * Handle canvas click for eyedropper.
 */
function handleCanvasClick(e) {
  if (!isEyedropperActive || !processor || !processor.canvas) return;

  const canvas = processor.canvas;
  const rect = e.target.getBoundingClientRect();

  // Calculate position relative to the canvas
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // Sample color
  const ctx = canvas.getContext('2d');
  const rgb = sampleColor(ctx, x, y, 10);
  const hex = rgbToHex(rgb);

  // Show visual feedback at click location
  showSampleFlash(e.clientX, e.clientY, hex);

  // Update color
  updatePaintProperty('color', hex);
  updatePaintProperty('colorSource', 'eyedropper');
  document.getElementById('color-picker').value = hex;
  updateColorPreview(hex);

  // Deactivate eyedropper
  toggleEyedropper();
}

/**
 * Show a visual flash animation at the sample point.
 * @param {number} x - Screen X coordinate
 * @param {number} y - Screen Y coordinate
 * @param {string} color - The sampled color (hex)
 */
function showSampleFlash(x, y, color) {
  const flash = document.createElement('div');
  flash.className = 'eyedropper-sample-flash';
  flash.style.left = `${x}px`;
  flash.style.top = `${y}px`;
  flash.style.color = color;

  document.body.appendChild(flash);

  // Remove after animation completes
  setTimeout(() => {
    flash.remove();
  }, 400);
}

/**
 * Detect dominant wall color in the selected region.
 */
function detectWallColor() {
  if (selectedRegionIndex < 0 || !processor || !processor.canvas || !api) return;

  const regions = api.getWallArtRegions() || [];
  const region = regions[selectedRegionIndex];

  if (!region) return;

  const ctx = processor.canvas.getContext('2d');

  // Detect dominant color in the region
  const rgb = detectDominantColor(ctx, region.region, {
    sampleDensity: 0.05,
    clusters: 5
  });

  const hex = rgbToHex(rgb);

  // Update color
  updatePaintProperty('color', hex);
  updatePaintProperty('colorSource', 'ai-detected');
  document.getElementById('color-picker').value = hex;
  updateColorPreview(hex);

  console.log('[WallPaintEditor] Detected wall color:', hex);
}

/**
 * Set the selected region from external source.
 */
export function setSelectedRegion(index) {
  selectedRegionIndex = index;

  const select = document.getElementById('paint-region-select');
  if (select) {
    select.value = index.toString();
  }

  updatePaintControls();
}
