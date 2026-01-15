/**
 * Wall Art Content Editor Component
 *
 * UI for managing wall art content (images, GIFs, videos) on regions.
 */

// Module-level state
let processor = null;
let api = null;
let selectedRegionIndex = -1;

/**
 * Initialize the Wall Art Content Editor.
 *
 * @param {Object} videoProcessor - DevVideoProcessor instance
 * @param {Object} wallArtApi - API for getting/setting wall art regions
 */
export function initWallArtContentEditor(videoProcessor, wallArtApi) {
  processor = videoProcessor;
  api = wallArtApi;

  const container = document.querySelector('#wall-art-content-editor .content-editor-content');
  if (!container) {
    console.warn('[WallArtContentEditor] Container not found');
    return;
  }

  container.innerHTML = `
    <div class="form-group">
      <label for="art-region-select">Region</label>
      <select id="art-region-select">
        <option value="-1">Select region...</option>
      </select>
    </div>

    <div id="art-controls" class="art-controls disabled">
      <div class="form-group">
        <label for="art-source-input">Art Source</label>
        <div class="file-input-group">
          <input type="file" id="art-source-input" accept="image/*,video/*,.gif">
          <button id="art-clear-btn" class="btn btn-small btn-secondary">Clear</button>
        </div>
        <div id="art-source-info" class="source-info"></div>
      </div>

      <div class="form-group">
        <label for="art-aspect-mode">Aspect Ratio Mode</label>
        <select id="art-aspect-mode">
          <option value="stretch">Stretch (fill region)</option>
          <option value="fit">Fit (letterbox)</option>
          <option value="crop">Crop (fill, crop excess)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="art-opacity">Opacity: <span id="art-opacity-value">100</span>%</label>
        <input type="range" id="art-opacity" min="0" max="100" value="100">
      </div>

      <div class="form-group">
        <label>
          <input type="checkbox" id="art-enabled" checked>
          Enable Art
        </label>
      </div>
    </div>

    <div id="art-preview" class="art-preview">
      <div class="preview-placeholder">Select a region and upload art</div>
    </div>
  `;

  // Set up event listeners
  setupEventListeners();

  // Update region select
  updateArtRegionSelect();
}

/**
 * Set up event listeners for the editor controls.
 */
function setupEventListeners() {
  // Region select
  const regionSelect = document.getElementById('art-region-select');
  regionSelect?.addEventListener('change', (e) => {
    selectedRegionIndex = parseInt(e.target.value, 10);
    updateArtControls();
  });

  // File input
  const fileInput = document.getElementById('art-source-input');
  fileInput?.addEventListener('change', handleFileSelect);

  // Clear button
  const clearBtn = document.getElementById('art-clear-btn');
  clearBtn?.addEventListener('click', handleClearArt);

  // Aspect mode
  const aspectMode = document.getElementById('art-aspect-mode');
  aspectMode?.addEventListener('change', (e) => {
    updateArtProperty('aspectRatioMode', e.target.value);
  });

  // Opacity slider
  const opacitySlider = document.getElementById('art-opacity');
  opacitySlider?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    document.getElementById('art-opacity-value').textContent = value;
    updateArtProperty('opacity', value / 100);
  });

  // Enable checkbox
  const enableCheckbox = document.getElementById('art-enabled');
  enableCheckbox?.addEventListener('change', (e) => {
    const regions = api.getWallArtRegions() || [];
    if (selectedRegionIndex >= 0 && selectedRegionIndex < regions.length) {
      const region = regions[selectedRegionIndex];
      if (region.art) {
        region.art.enabled = e.target.checked;
        region.updatedAt = Date.now();
        api.setWallArtRegions(regions);
      }
    }
  });
}

/**
 * Handle file selection.
 */
async function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const regions = api.getWallArtRegions() || [];
  if (selectedRegionIndex < 0 || selectedRegionIndex >= regions.length) return;

  const region = regions[selectedRegionIndex];

  try {
    // Determine content type
    let contentType = 'image';
    if (file.type.startsWith('video/')) {
      contentType = 'video';
    } else if (file.type === 'image/gif' || file.name.endsWith('.gif')) {
      contentType = 'gif';
    }

    // Read file as data URL
    const dataUrl = await readFileAsDataUrl(file);

    // Update region art config
    region.art = {
      src: dataUrl,
      contentType,
      aspectRatioMode: document.getElementById('art-aspect-mode')?.value || 'stretch',
      opacity: parseInt(document.getElementById('art-opacity')?.value || '100', 10) / 100,
      enabled: true
    };
    region.updatedAt = Date.now();

    // Load art source
    await loadArtSource(region.id, dataUrl, contentType);

    // Save regions
    api.setWallArtRegions(regions);

    // Update UI
    updateArtControls();
    updateSourceInfo(file.name, contentType);

    console.log('[WallArtContentEditor] Art loaded:', contentType, file.name);
  } catch (error) {
    console.error('[WallArtContentEditor] Failed to load art:', error);
    updateSourceInfo('Error loading file', 'error');
  }
}

/**
 * Load an art source (image, GIF, or video).
 */
async function loadArtSource(id, src, contentType) {
  if (contentType === 'gif') {
    // Import and use GIF decoder
    const { decodeGifFromDataUrl } = await import('../../lib/gif-decoder.js');
    const animatedImage = await decodeGifFromDataUrl(src);
    processor.setWallArtSource(id, animatedImage);
  } else if (contentType === 'video') {
    // Import and use video loader
    const { createVideoLoop } = await import('../../lib/wall-art-renderer.js');
    const video = await createVideoLoop(src);
    processor.setWallArtSource(id, video);
  } else {
    // Regular image
    const img = await loadImage(src);
    processor.setWallArtSource(id, img);
  }
}

/**
 * Load an image from a URL.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Read a file as data URL.
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Handle clearing art from a region.
 */
function handleClearArt() {
  const regions = api.getWallArtRegions() || [];
  if (selectedRegionIndex < 0 || selectedRegionIndex >= regions.length) return;

  const region = regions[selectedRegionIndex];

  // Remove art source from processor
  processor.removeWallArtSource(region.id);

  // Clear art config
  region.art = null;
  region.updatedAt = Date.now();

  // Save regions
  api.setWallArtRegions(regions);

  // Update UI
  updateArtControls();
  updateSourceInfo('', '');

  // Clear file input
  const fileInput = document.getElementById('art-source-input');
  if (fileInput) fileInput.value = '';

  console.log('[WallArtContentEditor] Art cleared');
}

/**
 * Update an art property.
 */
function updateArtProperty(property, value) {
  const regions = api.getWallArtRegions() || [];
  if (selectedRegionIndex < 0 || selectedRegionIndex >= regions.length) return;

  const region = regions[selectedRegionIndex];
  if (!region.art) return;

  region.art[property] = value;
  region.updatedAt = Date.now();
  api.setWallArtRegions(regions);
}

/**
 * Update the region select dropdown.
 */
export function updateArtRegionSelect() {
  const select = document.getElementById('art-region-select');
  if (!select || !api) return;

  const regions = api.getWallArtRegions() || [];

  // Store previous selection
  const previousSelection = selectedRegionIndex;

  select.innerHTML = '<option value="-1">Select region...</option>' +
    regions.map((region, index) =>
      `<option value="${index}">${region.name || `Region ${index + 1}`}</option>`
    ).join('');

  // Restore selection if region still exists
  if (previousSelection >= 0 && previousSelection < regions.length) {
    selectedRegionIndex = previousSelection;
    select.value = previousSelection.toString();
  } else {
    selectedRegionIndex = -1;
  }

  updateArtControls();
}

/**
 * Update the art controls based on selected region.
 */
function updateArtControls() {
  const controls = document.getElementById('art-controls');
  const preview = document.getElementById('art-preview');
  const regions = api?.getWallArtRegions() || [];

  if (selectedRegionIndex < 0 || selectedRegionIndex >= regions.length) {
    controls?.classList.add('disabled');
    if (preview) preview.innerHTML = '<div class="preview-placeholder">Select a region and upload art</div>';
    return;
  }

  controls?.classList.remove('disabled');

  const region = regions[selectedRegionIndex];
  const art = region.art;

  // Update controls to reflect current state
  const aspectMode = document.getElementById('art-aspect-mode');
  const opacitySlider = document.getElementById('art-opacity');
  const opacityValue = document.getElementById('art-opacity-value');
  const enableCheckbox = document.getElementById('art-enabled');

  if (art) {
    if (aspectMode) aspectMode.value = art.aspectRatioMode || 'stretch';
    if (opacitySlider) opacitySlider.value = Math.round((art.opacity || 1) * 100);
    if (opacityValue) opacityValue.textContent = Math.round((art.opacity || 1) * 100);
    if (enableCheckbox) enableCheckbox.checked = art.enabled !== false;

    updateSourceInfo(art.contentType ? `${art.contentType} loaded` : 'Content loaded', art.contentType || 'image');
    updatePreview(art.src, art.contentType);
  } else {
    if (aspectMode) aspectMode.value = 'stretch';
    if (opacitySlider) opacitySlider.value = 100;
    if (opacityValue) opacityValue.textContent = '100';
    if (enableCheckbox) enableCheckbox.checked = true;

    updateSourceInfo('', '');
    if (preview) preview.innerHTML = '<div class="preview-placeholder">Upload an image, GIF, or video</div>';
  }
}

/**
 * Update source info display.
 */
function updateSourceInfo(text, type) {
  const info = document.getElementById('art-source-info');
  if (!info) return;

  if (!text) {
    info.textContent = '';
    info.className = 'source-info';
    return;
  }

  info.textContent = text;
  info.className = `source-info source-${type}`;
}

/**
 * Update preview display.
 */
function updatePreview(src, contentType) {
  const preview = document.getElementById('art-preview');
  if (!preview || !src) return;

  if (contentType === 'video') {
    preview.innerHTML = `<video src="${src}" autoplay loop muted playsinline class="preview-media"></video>`;
  } else {
    preview.innerHTML = `<img src="${src}" class="preview-media" alt="Art preview">`;
  }
}

// Alias for consistency with other editors
export { updateArtRegionSelect as updateRegionSelect };
