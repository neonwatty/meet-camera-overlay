// Popup script for Meet Camera Overlay (no camera preview needed)

// Constants for overlay categories and layers
const CATEGORY_USER = 'user';
const CATEGORY_BUNDLED = 'bundled';
const LAYER_FOREGROUND = 'foreground';
const LAYER_BACKGROUND = 'background';

// Overlay type constants
const TYPE_STANDARD = 'standard';
const TYPE_EFFECT = 'effect';
const TYPE_TEXT_BANNER = 'textBanner';
const TYPE_TIMER = 'timer';

// Text position constants
const TEXT_POSITION_LOWER_THIRD = 'lower-third';
const TEXT_POSITION_TOP = 'top';
const TEXT_POSITION_CENTER = 'center';
const TEXT_POSITION_CUSTOM = 'custom';

let overlays = [];
let dragState = null;
let addingType = 'standard'; // 'standard', 'effect', 'textBanner', or 'timer'

// Undo/redo state
let previousState = null;      // Snapshot before last action
let lastActionType = null;     // 'add', 'delete', 'move', etc.
let canRedo = false;
let redoState = null;

// Selection state for keyboard shortcuts
let selectedOverlayId = null;

// Track if opacity slider is being dragged (to capture state only once)
let opacityDragStarted = false;

// DOM elements
const overlayContainer = document.getElementById('overlay-container');
const userOverlayList = document.getElementById('user-overlay-list');
const bundledOverlayList = document.getElementById('bundled-overlay-list');
const bundledSection = document.getElementById('bundled-section');
const userEmptyState = document.getElementById('user-empty-state');
const addOverlayBtn = document.getElementById('add-overlay');
const addEffectBtn = document.getElementById('add-effect');
const addModal = document.getElementById('add-modal');
const modalTitle = document.getElementById('modal-title');
const modalHint = document.getElementById('modal-hint');
const imageUrlInput = document.getElementById('image-url');
const imageFileInput = document.getElementById('image-file');
const cancelAddBtn = document.getElementById('cancel-add');
const confirmAddBtn = document.getElementById('confirm-add');
const statusEl = document.getElementById('status');

// Confirmation modal elements
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmOkBtn = document.getElementById('confirm-ok');
let confirmCallback = null;

// Effect preview elements
const effectPreview = document.getElementById('effect-preview');
const effectPreviewImg = effectPreview?.querySelector('.effect-preview-img');
const effectPreviewName = effectPreview?.querySelector('.effect-preview-name');

// Text banner modal elements
const addTextBannerBtn = document.getElementById('add-text-banner');
const textBannerModal = document.getElementById('text-banner-modal');
const textBannerModalTitle = document.getElementById('text-banner-modal-title');
const textBannerInput = document.getElementById('text-banner-input');
const textBannerPosition = document.getElementById('text-banner-position');
const textBannerFontSize = document.getElementById('text-banner-font-size');
const textBannerTextColor = document.getElementById('text-banner-text-color');
const textBannerBgColor = document.getElementById('text-banner-bg-color');
const textBannerBgOpacity = document.getElementById('text-banner-bg-opacity');
const textBannerOpacityValue = document.getElementById('text-banner-opacity-value');
const textBannerCancelBtn = document.getElementById('text-banner-cancel');
const textBannerConfirmBtn = document.getElementById('text-banner-confirm');

// Timer modal elements
const addTimerBtn = document.getElementById('add-timer');
const timerModal = document.getElementById('timer-modal');
const timerModalTitle = document.getElementById('timer-modal-title');
const timerModeSelect = document.getElementById('timer-mode');
const timerDurationGroup = document.getElementById('timer-duration-group');
const timerMinutesInput = document.getElementById('timer-minutes');
const timerSecondsInput = document.getElementById('timer-seconds');
const timerTextColor = document.getElementById('timer-text-color');
const timerBgColor = document.getElementById('timer-bg-color');
const timerCancelBtn = document.getElementById('timer-cancel');
const timerConfirmBtn = document.getElementById('timer-confirm');

// Track which overlay is being edited (for edit mode)
let editingOverlayId = null;

// Initialize
async function init() {
  await loadOverlays();
  renderOverlayList();
  renderPreviewOverlays();
}

// Sort overlays by layer and zIndex for display
function sortOverlaysByLayer(overlays) {
  return [...overlays].sort((a, b) => {
    // Background = 0, Foreground = 1
    const aLayerOrder = a.layer === LAYER_BACKGROUND ? 0 : 1;
    const bLayerOrder = b.layer === LAYER_BACKGROUND ? 0 : 1;

    if (aLayerOrder !== bLayerOrder) {
      return aLayerOrder - bLayerOrder;
    }

    return (a.zIndex || 0) - (b.zIndex || 0);
  });
}

// Recalculate zIndex values after reordering (kept for potential future use)
function _recalculateZIndices() {
  const background = overlays.filter(o => o.layer === LAYER_BACKGROUND);
  const foreground = overlays.filter(o => o.layer !== LAYER_BACKGROUND);

  background.forEach((overlay, index) => {
    overlay.zIndex = index;
  });

  foreground.forEach((overlay, index) => {
    overlay.zIndex = index;
  });
}

// Migrate an overlay to include new fields if missing
function migrateOverlay(overlay) {
  if (!overlay) return overlay;

  const migrated = { ...overlay };

  // Add category if missing
  if (!migrated.category) {
    migrated.category = CATEGORY_USER;
  }

  // Add layer if missing
  if (!migrated.layer) {
    migrated.layer = migrated.type === TYPE_EFFECT ? LAYER_BACKGROUND : LAYER_FOREGROUND;
  }

  // Add zIndex if missing
  if (migrated.zIndex === undefined) {
    if (migrated.type === TYPE_TIMER) {
      migrated.zIndex = 11;
    } else if (migrated.type === TYPE_TEXT_BANNER) {
      migrated.zIndex = 10;
    } else {
      migrated.zIndex = 0;
    }
  }

  // Add createdAt if missing
  if (!migrated.createdAt) {
    migrated.createdAt = Date.now();
  }

  // Text banner specific migrations
  if (migrated.type === TYPE_TEXT_BANNER) {
    if (!migrated.style) {
      migrated.style = {
        fontFamily: 'Arial, sans-serif',
        fontSize: 24,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        backgroundOpacity: 0.7,
        padding: 12,
        borderRadius: 8
      };
    }
    if (!migrated.textPosition) {
      migrated.textPosition = TEXT_POSITION_LOWER_THIRD;
    }
  }

  // Timer specific migrations
  if (migrated.type === TYPE_TIMER) {
    if (!migrated.style) {
      migrated.style = {
        fontSize: 32,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        backgroundOpacity: 0.7
      };
    }
    if (!migrated.timerState) {
      migrated.timerState = {
        running: false,
        startTime: null,
        pausedAt: null,
        elapsed: 0
      };
    }
    if (!migrated.timerMode) {
      migrated.timerMode = 'countdown';
    }
    if (!migrated.format) {
      migrated.format = 'mm:ss';
    }
  }

  return migrated;
}

// Load overlays from storage
async function loadOverlays() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['overlays'], (result) => {
      const rawOverlays = result.overlays || [];
      // Migrate overlays to ensure they have all required fields
      overlays = rawOverlays.map(migrateOverlay);
      resolve();
    });
  });
}

// Save overlays to storage and notify content script
async function saveOverlays() {
  await chrome.storage.local.set({ overlays });

  // Notify active Meet tabs
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_OVERLAYS', overlays }).catch(() => {});
  }
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Add overlay modal
addOverlayBtn.addEventListener('click', () => {
  addingType = 'standard';
  modalTitle.textContent = 'Add Image Overlay';
  modalHint.textContent = 'Add a static image that will always appear on your camera.';
  imageUrlInput.value = '';
  imageFileInput.value = '';
  addModal.classList.remove('hidden');
});

// Add effect modal
addEffectBtn.addEventListener('click', () => {
  addingType = 'effect';
  modalTitle.textContent = 'Add Effect';
  modalHint.textContent = 'Add an animated effect (GIF) that you can trigger on/off. Effects appear full-screen.';
  imageUrlInput.value = '';
  imageFileInput.value = '';
  addModal.classList.remove('hidden');
});

// Add text banner modal
if (addTextBannerBtn) {
  addTextBannerBtn.addEventListener('click', () => {
    editingOverlayId = null;
    textBannerModalTitle.textContent = 'Add Text Banner';
    textBannerInput.value = '';
    textBannerPosition.value = TEXT_POSITION_LOWER_THIRD;
    textBannerFontSize.value = 24;
    textBannerTextColor.value = '#ffffff';
    textBannerBgColor.value = '#000000';
    textBannerBgOpacity.value = 70;
    textBannerOpacityValue.textContent = '70%';
    textBannerConfirmBtn.textContent = 'Add';
    textBannerModal.classList.remove('hidden');
  });
}

// Text banner modal cancel
if (textBannerCancelBtn) {
  textBannerCancelBtn.addEventListener('click', () => {
    textBannerModal.classList.add('hidden');
    editingOverlayId = null;
  });
}

// Text banner opacity slider
if (textBannerBgOpacity) {
  textBannerBgOpacity.addEventListener('input', (e) => {
    textBannerOpacityValue.textContent = e.target.value + '%';
  });
}

// Text banner confirm
if (textBannerConfirmBtn) {
  textBannerConfirmBtn.addEventListener('click', async () => {
    const text = textBannerInput.value.trim();
    if (!text) {
      showStatus('Please enter some text', 'error');
      return;
    }

    const sameLayerOverlays = overlays.filter(o => o.layer === LAYER_FOREGROUND);
    const nextZIndex = sameLayerOverlays.length > 0
      ? Math.max(...sameLayerOverlays.map(o => o.zIndex || 0)) + 1
      : 10;

    if (editingOverlayId) {
      // Editing existing text banner
      const overlay = overlays.find(o => o.id === editingOverlayId);
      if (overlay) {
        captureStateForUndo('edit');
        overlay.text = text;
        overlay.textPosition = textBannerPosition.value;
        overlay.style = {
          ...overlay.style,
          fontSize: parseInt(textBannerFontSize.value) || 24,
          textColor: textBannerTextColor.value,
          backgroundColor: textBannerBgColor.value,
          backgroundOpacity: parseInt(textBannerBgOpacity.value) / 100
        };
        await saveOverlays();
        renderOverlayList();
        renderPreviewOverlays();
        showStatus('Text banner updated!', 'success');
      }
    } else {
      // Creating new text banner
      const overlay = {
        id: generateId(),
        type: TYPE_TEXT_BANNER,
        text: text,
        name: text.substring(0, 20) + (text.length > 20 ? '...' : ''),
        textPosition: textBannerPosition.value,
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: parseInt(textBannerFontSize.value) || 24,
          textColor: textBannerTextColor.value,
          backgroundColor: textBannerBgColor.value,
          backgroundOpacity: parseInt(textBannerBgOpacity.value) / 100,
          padding: 12,
          borderRadius: 8
        },
        x: 50,
        y: 75,
        width: 80,
        height: 20,
        opacity: 1,
        active: true,
        layer: LAYER_FOREGROUND,
        zIndex: nextZIndex,
        category: CATEGORY_USER,
        createdAt: Date.now()
      };

      captureStateForUndo('add');
      overlays.push(overlay);
      await saveOverlays();
      renderOverlayList();
      renderPreviewOverlays();
      showStatus('Text banner added!', 'success');
    }

    textBannerModal.classList.add('hidden');
    editingOverlayId = null;
  });
}

// Add timer modal
if (addTimerBtn) {
  addTimerBtn.addEventListener('click', () => {
    editingOverlayId = null;
    timerModalTitle.textContent = 'Add Timer';
    timerModeSelect.value = 'countdown';
    timerMinutesInput.value = 5;
    timerSecondsInput.value = 0;
    timerDurationGroup.style.display = 'block';
    timerTextColor.value = '#ffffff';
    timerBgColor.value = '#000000';
    // Reset position buttons
    document.querySelectorAll('.position-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.position-btn[data-position="top-right"]')?.classList.add('active');
    timerConfirmBtn.textContent = 'Add';
    timerModal.classList.remove('hidden');
  });
}

// Timer mode change - hide duration for clock mode
if (timerModeSelect) {
  timerModeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'clock') {
      timerDurationGroup.style.display = 'none';
    } else {
      timerDurationGroup.style.display = 'block';
    }
  });
}

// Timer duration preset buttons
document.querySelectorAll('.duration-presets .btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const duration = parseInt(e.target.dataset.duration);
    timerMinutesInput.value = Math.floor(duration / 60);
    timerSecondsInput.value = duration % 60;
  });
});

// Timer position buttons
document.querySelectorAll('.position-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  });
});

// Timer modal cancel
if (timerCancelBtn) {
  timerCancelBtn.addEventListener('click', () => {
    timerModal.classList.add('hidden');
    editingOverlayId = null;
  });
}

// Timer confirm
if (timerConfirmBtn) {
  timerConfirmBtn.addEventListener('click', async () => {
    const minutes = parseInt(timerMinutesInput.value) || 0;
    const seconds = parseInt(timerSecondsInput.value) || 0;
    const duration = minutes * 60 + seconds;
    const mode = timerModeSelect.value;

    if (mode !== 'clock' && duration === 0) {
      showStatus('Please set a duration', 'error');
      return;
    }

    // Get selected position
    const activePositionBtn = document.querySelector('.position-btn.active');
    const position = activePositionBtn?.dataset.position || 'top-right';

    // Map position to x/y coordinates
    const positionMap = {
      'top-left': { x: 5, y: 5 },
      'top-center': { x: 50, y: 5 },
      'top-right': { x: 95, y: 5 },
      'bottom-left': { x: 5, y: 90 },
      'bottom-center': { x: 50, y: 90 },
      'bottom-right': { x: 95, y: 90 }
    };
    const pos = positionMap[position] || positionMap['top-right'];

    const sameLayerOverlays = overlays.filter(o => o.layer === LAYER_FOREGROUND);
    const nextZIndex = sameLayerOverlays.length > 0
      ? Math.max(...sameLayerOverlays.map(o => o.zIndex || 0)) + 1
      : 11;

    const modeNames = { countdown: 'Countdown', countup: 'Count Up', clock: 'Clock' };
    const overlay = {
      id: generateId(),
      type: TYPE_TIMER,
      name: modeNames[mode] + (mode !== 'clock' ? ` (${minutes}:${seconds.toString().padStart(2, '0')})` : ''),
      duration: duration,
      timerMode: mode,
      format: 'mm:ss',
      style: {
        fontSize: 32,
        textColor: timerTextColor.value,
        backgroundColor: timerBgColor.value,
        backgroundOpacity: 0.7
      },
      timerState: {
        running: false,
        startTime: null,
        pausedAt: null,
        elapsed: 0
      },
      x: pos.x,
      y: pos.y,
      width: 15,
      height: 10,
      opacity: 1,
      active: true,
      layer: LAYER_FOREGROUND,
      zIndex: nextZIndex,
      category: CATEGORY_USER,
      createdAt: Date.now()
    };

    captureStateForUndo('add');
    overlays.push(overlay);
    await saveOverlays();
    renderOverlayList();
    renderPreviewOverlays();
    timerModal.classList.add('hidden');
    editingOverlayId = null;
    showStatus('Timer added! Use the controls to start it.', 'success');
  });
}

cancelAddBtn.addEventListener('click', () => {
  addModal.classList.add('hidden');
});

confirmAddBtn.addEventListener('click', async () => {
  let src = imageUrlInput.value.trim();

  // Handle file upload
  if (imageFileInput.files.length > 0) {
    const file = imageFileInput.files[0];
    src = await fileToDataUrl(file);
  }

  if (!src) {
    showStatus('Please provide an image URL or file', 'error');
    return;
  }

  // Validate image loads
  try {
    await loadImage(src);
  } catch {
    showStatus('Could not load image. Check the URL.', 'error');
    return;
  }

  // Calculate the next zIndex for the appropriate layer
  const layer = addingType === 'effect' ? LAYER_BACKGROUND : LAYER_FOREGROUND;
  const sameLayerOverlays = overlays.filter(o => o.layer === layer);
  const nextZIndex = sameLayerOverlays.length > 0
    ? Math.max(...sameLayerOverlays.map(o => o.zIndex || 0)) + 1
    : 0;

  let overlay;
  if (addingType === 'effect') {
    overlay = {
      id: generateId(),
      src: src,
      x: 0,      // Full screen - start at left edge
      y: 0,      // Full screen - start at top
      width: 100,  // Full width
      height: 100, // Full height
      opacity: 1,
      type: 'effect',
      active: false,  // Effects start inactive
      name: getImageName(src, true),
      category: CATEGORY_USER,
      layer: LAYER_BACKGROUND,
      zIndex: nextZIndex,
      createdAt: Date.now()
    };
  } else {
    overlay = {
      id: generateId(),
      src: src,
      x: 5, // percentage from left
      y: 25, // percentage from top
      width: 20,
      height: 35,
      opacity: 1,
      type: 'standard',
      name: getImageName(src, false),
      category: CATEGORY_USER,
      layer: LAYER_FOREGROUND,
      zIndex: nextZIndex,
      createdAt: Date.now()
    };
  }

  captureStateForUndo('add');
  overlays.push(overlay);
  await saveOverlays();
  renderOverlayList();
  renderPreviewOverlays();
  addModal.classList.add('hidden');

  if (addingType === 'effect') {
    showStatus('Effect added! Use the trigger button to activate it.', 'success');
  } else {
    showStatus('Overlay added! Open Google Meet to see it.', 'success');
  }
});

// Convert file to data URL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Load image and return promise
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Get a display name from image src
function getImageName(src, isEffect = false) {
  const defaultName = isEffect ? 'Effect' : 'Image';
  if (src.startsWith('data:')) {
    return isEffect ? 'Uploaded Effect' : 'Uploaded Image';
  }
  try {
    const url = new URL(src);
    const path = url.pathname;
    const filename = path.split('/').pop();
    return filename || defaultName;
  } catch {
    return defaultName;
  }
}

// ==================== EFFECT PREVIEW ====================

let previewTimeout = null;

/**
 * Show effect preview at optimal position near thumbnail
 */
function showEffectPreview(thumbEl, overlay) {
  if (!effectPreview || !effectPreviewImg || !effectPreviewName) return;

  // Set preview content
  effectPreviewImg.src = overlay.src;
  effectPreviewName.textContent = overlay.name;

  // Make visible for positioning calculation
  effectPreview.classList.remove('hidden');

  // Calculate position
  const thumbRect = thumbEl.getBoundingClientRect();
  const previewWidth = 216; // 200px img + 8px padding each side

  // Default: position to the right of thumbnail
  let left = thumbRect.right + 8;
  let top = thumbRect.top - 20;

  // Check right edge - if would overflow, position to the left
  if (left + previewWidth > 400) {
    left = thumbRect.left - previewWidth - 8;
  }

  // If still overflows left, center it
  if (left < 0) {
    left = 4;
  }

  // Check top edge
  if (top < 0) {
    top = 4;
  }

  effectPreview.style.left = left + 'px';
  effectPreview.style.top = top + 'px';

  // Trigger animation
  requestAnimationFrame(() => {
    effectPreview.classList.add('visible');
  });
}

/**
 * Hide effect preview with animation
 */
function hideEffectPreview() {
  if (!effectPreview) return;

  effectPreview.classList.remove('visible');

  // Hide after animation completes
  previewTimeout = setTimeout(() => {
    effectPreview.classList.add('hidden');
    if (effectPreviewImg) {
      effectPreviewImg.src = ''; // Clear to stop GIF animation
    }
  }, 150);
}

// Create an overlay item element
function createOverlayItem(overlay) {
  const index = overlays.findIndex(o => o.id === overlay.id);
  const opacity = overlay.opacity !== undefined ? overlay.opacity : 1;
  const isEffect = overlay.type === TYPE_EFFECT;
  const isTextBanner = overlay.type === TYPE_TEXT_BANNER;
  const isTimer = overlay.type === TYPE_TIMER;
  const isActive = overlay.active === true;
  const layer = overlay.layer || LAYER_FOREGROUND;
  const category = overlay.category || CATEGORY_USER;

  const item = document.createElement('div');
  let className = 'overlay-item';
  if (isEffect) className += ' effect-item';
  if (isTextBanner) className += ' text-banner-item';
  if (isTimer) className += ' timer-item';
  if (isActive) className += ' active';
  item.className = className;
  item.dataset.id = overlay.id;
  item.dataset.layer = layer;
  item.dataset.category = category;
  item.dataset.type = overlay.type || TYPE_STANDARD;
  item.draggable = true;

  // Build trigger button HTML for effects
  let triggerBtn = '';
  if (isEffect) {
    triggerBtn = `<button class="trigger-btn ${isActive ? 'active' : ''}" data-index="${index}" data-id="${overlay.id}" title="${isActive ? 'Deactivate' : 'Activate'}">
      ${isActive ? '⚡ ON' : '⚡ OFF'}
    </button>`;
  }

  // Build toggle button for text banners
  if (isTextBanner) {
    triggerBtn = `<button class="trigger-btn text-trigger ${isActive ? 'active' : ''}" data-index="${index}" data-id="${overlay.id}" title="${isActive ? 'Hide' : 'Show'}">
      ${isActive ? '👁 ON' : '👁 OFF'}
    </button>`;
  }

  // Build position info
  let positionInfo = '';
  if (isEffect) {
    positionInfo = '<div class="position">Full screen effect</div>';
  } else if (isTextBanner) {
    const posNames = { 'lower-third': 'Lower Third', 'top': 'Top', 'center': 'Center', 'custom': 'Custom' };
    positionInfo = `<div class="position">${posNames[overlay.textPosition] || 'Lower Third'}</div>
                    <div class="text-preview">"${overlay.text?.substring(0, 30) || ''}${(overlay.text?.length || 0) > 30 ? '...' : ''}"</div>`;
  } else if (isTimer) {
    const modeNames = { countdown: 'Countdown', countup: 'Count Up', clock: 'Clock' };
    positionInfo = `<div class="position">${modeNames[overlay.timerMode] || 'Timer'}</div>`;
  } else {
    positionInfo = `<div class="position">Position: ${Math.round(overlay.x)}%, ${Math.round(overlay.y)}%</div>`;
  }

  // Layer toggle buttons
  const layerToggle = `
    <div class="layer-toggle" data-id="${overlay.id}">
      <button class="layer-btn ${layer === LAYER_BACKGROUND ? 'active' : ''}" data-layer="${LAYER_BACKGROUND}" title="Behind you">Back</button>
      <button class="layer-btn ${layer === LAYER_FOREGROUND ? 'active' : ''}" data-layer="${LAYER_FOREGROUND}" title="In front of you">Front</button>
    </div>
  `;

  // Build thumbnail area
  let thumbHtml = '';
  if (isTextBanner) {
    thumbHtml = `<div class="text-banner-icon">Aa</div>`;
  } else if (isTimer) {
    thumbHtml = `<div class="timer-icon">00:00</div>`;
  } else {
    thumbHtml = `<img class="thumb" src="${overlay.src}" alt="">`;
  }

  // Build name with icon
  let nameIcon = '';
  if (isEffect) nameIcon = '⚡ ';
  if (isTextBanner) nameIcon = '📝 ';
  if (isTimer) nameIcon = '⏱ ';

  // Extra controls for text banners (edit button)
  let extraControls = '';
  if (isTextBanner) {
    extraControls = `<button class="edit-text-btn" data-id="${overlay.id}" title="Edit Text">Edit</button>`;
  }

  // Timer controls
  let timerControls = '';
  if (isTimer) {
    timerControls = `
      <div class="timer-controls">
        <button class="timer-ctrl-btn play" data-id="${overlay.id}" data-action="start" title="Start">▶</button>
        <button class="timer-ctrl-btn pause" data-id="${overlay.id}" data-action="pause" title="Pause">⏸</button>
        <button class="timer-ctrl-btn" data-id="${overlay.id}" data-action="reset" title="Reset">↺</button>
      </div>
    `;
    // Timer toggle button
    triggerBtn = `<button class="trigger-btn timer-trigger ${isActive ? 'active' : ''}" data-index="${index}" data-id="${overlay.id}" title="${isActive ? 'Hide' : 'Show'}">
      ${isActive ? '👁 ON' : '👁 OFF'}
    </button>`;
  }

  item.innerHTML = `
    <div class="drag-handle" title="Drag to reorder">
      <span></span>
      <span></span>
      <span></span>
    </div>
    ${thumbHtml}
    <div class="info">
      <div class="name">${nameIcon}${overlay.name}</div>
      ${positionInfo}
      ${timerControls}
      <div class="controls-row">
        <div class="opacity-control">
          <label>Opacity:</label>
          <input type="range" class="opacity-slider" data-index="${index}" min="0" max="100" value="${Math.round(opacity * 100)}">
          <span class="opacity-value">${Math.round(opacity * 100)}%</span>
        </div>
        ${layerToggle}
      </div>
    </div>
    ${extraControls}
    ${triggerBtn}
    <button class="duplicate-btn" data-id="${overlay.id}" title="Duplicate">⧉</button>
    <button class="delete-btn" data-index="${index}" title="Remove">×</button>
  `;

  // Add hover preview for effects
  if (isEffect) {
    const thumbEl = item.querySelector('.thumb');
    if (thumbEl) {
      thumbEl.addEventListener('mouseenter', () => {
        // Clear any pending hide
        if (previewTimeout) {
          clearTimeout(previewTimeout);
          previewTimeout = null;
        }
        showEffectPreview(thumbEl, overlay);
      });

      thumbEl.addEventListener('mouseleave', () => {
        hideEffectPreview();
      });
    }
  }

  return item;
}

// Render overlay list
function renderOverlayList() {
  userOverlayList.innerHTML = '';
  bundledOverlayList.innerHTML = '';

  // Separate overlays by category
  const userOverlays = overlays.filter(o => o.category !== CATEGORY_BUNDLED);
  const bundledOverlays = overlays.filter(o => o.category === CATEGORY_BUNDLED);

  // Handle empty states
  if (userOverlays.length === 0) {
    userEmptyState.classList.remove('hidden');
  } else {
    userEmptyState.classList.add('hidden');
  }

  // Show/hide bundled section
  if (bundledOverlays.length === 0) {
    bundledSection.classList.add('hidden');
  } else {
    bundledSection.classList.remove('hidden');
  }

  // Sort and render user overlays
  const sortedUserOverlays = sortOverlaysByLayer(userOverlays);
  sortedUserOverlays.forEach((overlay) => {
    const item = createOverlayItem(overlay);
    userOverlayList.appendChild(item);
  });

  // Sort and render bundled overlays
  const sortedBundledOverlays = sortOverlaysByLayer(bundledOverlays);
  sortedBundledOverlays.forEach((overlay) => {
    const item = createOverlayItem(overlay);
    bundledOverlayList.appendChild(item);
  });

  // Set up drag-and-drop handlers for both lists
  setupDragAndDrop();

  // Set up event handlers for both lists
  setupOverlayItemHandlers(userOverlayList);
  setupOverlayItemHandlers(bundledOverlayList);
}

// Set up event handlers for overlay items in a list
function setupOverlayItemHandlers(listElement) {
  // Click to select overlay items
  listElement.querySelectorAll('.overlay-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't select when clicking on controls
      if (e.target.closest('button') ||
          e.target.closest('input') ||
          e.target.closest('.drag-handle') ||
          e.target.closest('.layer-toggle')) {
        return;
      }
      selectOverlay(item.dataset.id);
    });
  });

  // Opacity slider handlers
  listElement.querySelectorAll('.opacity-slider').forEach(slider => {
    // Capture state at start of drag
    slider.addEventListener('mousedown', () => {
      if (!opacityDragStarted) {
        captureStateForUndo('opacity');
        opacityDragStarted = true;
      }
    });

    slider.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      const value = parseInt(e.target.value);
      overlays[index].opacity = value / 100;
      e.target.nextElementSibling.textContent = value + '%';
      renderPreviewOverlays();
    });

    slider.addEventListener('change', async () => {
      await saveOverlays();
      opacityDragStarted = false;
    });
  });

  // Delete handlers with confirmation
  listElement.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      const overlay = overlays[index];
      if (!overlay) return;

      showConfirmDialog(
        'Delete Overlay?',
        `Are you sure you want to delete "<strong>${overlay.name}</strong>"?<br><small>This action can be undone with Ctrl+Z.</small>`,
        async () => {
          captureStateForUndo('delete');
          overlays.splice(index, 1);
          await saveOverlays();
          renderOverlayList();
          renderPreviewOverlays();
          showStatus('Overlay removed', 'success');
        }
      );
    });
  });

  // Trigger button handlers for effects, text banners, and timers
  listElement.querySelectorAll('.trigger-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      const id = e.target.dataset.id;
      const overlay = overlays[index];
      if (!overlay) return;

      const newActive = !overlay.active;
      overlay.active = newActive;

      // Update local state
      await saveOverlays();
      renderOverlayList();
      renderPreviewOverlays();

      // Send toggle message to content script based on type
      const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
      let messageType = 'TOGGLE_EFFECT';
      if (overlay.type === TYPE_TEXT_BANNER) {
        messageType = 'TOGGLE_TEXT_BANNER';
      } else if (overlay.type === TYPE_TIMER) {
        messageType = 'TOGGLE_TIMER';
      }

      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: messageType,
          id: id,
          active: newActive
        }).catch(() => {});
      }

      // Show appropriate status message
      if (overlay.type === TYPE_EFFECT) {
        showStatus(newActive ? 'Effect activated!' : 'Effect deactivated', 'success');
      } else if (overlay.type === TYPE_TEXT_BANNER) {
        showStatus(newActive ? 'Text banner shown!' : 'Text banner hidden', 'success');
      } else if (overlay.type === TYPE_TIMER) {
        showStatus(newActive ? 'Timer shown!' : 'Timer hidden', 'success');
      }
    });
  });

  // Edit text button handlers for text banners
  listElement.querySelectorAll('.edit-text-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const overlay = overlays.find(o => o.id === id);
      if (!overlay || overlay.type !== TYPE_TEXT_BANNER) return;

      // Open modal in edit mode
      editingOverlayId = id;
      textBannerModalTitle.textContent = 'Edit Text Banner';
      textBannerInput.value = overlay.text || '';
      textBannerPosition.value = overlay.textPosition || TEXT_POSITION_LOWER_THIRD;
      textBannerFontSize.value = overlay.style?.fontSize || 24;
      textBannerTextColor.value = overlay.style?.textColor || '#ffffff';
      textBannerBgColor.value = overlay.style?.backgroundColor || '#000000';
      textBannerBgOpacity.value = Math.round((overlay.style?.backgroundOpacity || 0.7) * 100);
      textBannerOpacityValue.textContent = textBannerBgOpacity.value + '%';
      textBannerConfirmBtn.textContent = 'Save';
      textBannerModal.classList.remove('hidden');
    });
  });

  // Timer control button handlers
  listElement.querySelectorAll('.timer-ctrl-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const action = e.target.dataset.action;
      const overlay = overlays.find(o => o.id === id);
      if (!overlay || overlay.type !== TYPE_TIMER) return;

      // Send timer control message to content script
      const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TIMER_CONTROL',
          id: id,
          action: action
        }).catch(() => {});
      }

      // Show status
      const actionNames = { start: 'started', pause: 'paused', reset: 'reset' };
      showStatus(`Timer ${actionNames[action]}!`, 'success');
    });
  });

  // Duplicate handlers
  listElement.querySelectorAll('.duplicate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const overlayId = e.target.dataset.id;
      const overlay = overlays.find(o => o.id === overlayId);
      if (!overlay) return;

      // Create a duplicate with new ID and name
      const duplicate = {
        ...overlay,
        id: generateId(),
        name: `${overlay.name} (Copy)`,
        createdAt: Date.now(),
        zIndex: (overlay.zIndex || 0) + 1
      };

      captureStateForUndo('duplicate');
      overlays.push(duplicate);
      await saveOverlays();
      renderOverlayList();
      renderPreviewOverlays();
      showStatus('Overlay duplicated', 'success');
    });
  });

  // Layer toggle handlers
  listElement.querySelectorAll('.layer-toggle .layer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const toggleContainer = e.target.closest('.layer-toggle');
      const overlayId = toggleContainer.dataset.id;
      const newLayer = e.target.dataset.layer;

      const overlay = overlays.find(o => o.id === overlayId);
      if (!overlay || overlay.layer === newLayer) return;

      captureStateForUndo('layer');

      // Update the layer
      overlay.layer = newLayer;

      // Recalculate zIndex for the new layer
      const sameLayerOverlays = overlays.filter(o => o.layer === newLayer && o.id !== overlayId);
      overlay.zIndex = sameLayerOverlays.length > 0
        ? Math.max(...sameLayerOverlays.map(o => o.zIndex || 0)) + 1
        : 0;

      await saveOverlays();
      renderOverlayList();
      renderPreviewOverlays();
      showStatus(`Moved to ${newLayer === LAYER_BACKGROUND ? 'background' : 'foreground'}`, 'success');
    });
  });
}

// Render overlays on preview
function renderPreviewOverlays() {
  overlayContainer.innerHTML = '';

  overlays.forEach((overlay, index) => {
    // Skip effects in preview (they're full-screen)
    if (overlay.type === 'effect') return;

    const opacity = overlay.opacity !== undefined ? overlay.opacity : 1;
    const div = document.createElement('div');
    div.className = 'overlay-preview';
    div.dataset.index = index;
    div.style.left = overlay.x + '%';
    div.style.top = overlay.y + '%';
    div.style.width = overlay.width + '%';
    div.style.height = overlay.height + '%';
    div.style.opacity = opacity;

    const img = document.createElement('img');
    img.src = overlay.src;
    div.appendChild(img);

    // Resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle se';
    div.appendChild(handle);

    // Delete handle with confirmation
    const deleteHandle = document.createElement('div');
    deleteHandle.className = 'delete-handle';
    deleteHandle.textContent = '×';
    deleteHandle.addEventListener('click', async (e) => {
      e.stopPropagation();
      const overlay = overlays[index];
      if (!overlay) return;

      showConfirmDialog(
        'Delete Overlay?',
        `Are you sure you want to delete "<strong>${overlay.name}</strong>"?<br><small>This action can be undone with Ctrl+Z.</small>`,
        async () => {
          captureStateForUndo('delete');
          overlays.splice(index, 1);
          await saveOverlays();
          renderOverlayList();
          renderPreviewOverlays();
          showStatus('Overlay removed', 'success');
        }
      );
    });
    div.appendChild(deleteHandle);

    // Drag to move
    div.addEventListener('mousedown', (e) => {
      if (e.target === handle || e.target === deleteHandle) return;
      startDrag(e, index, 'move');
    });

    // Drag to resize
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startDrag(e, index, 'resize');
    });

    overlayContainer.appendChild(div);
  });
}

// Drag handling
function startDrag(e, index, mode) {
  e.preventDefault();

  // Capture state before move/resize
  captureStateForUndo(mode === 'move' ? 'move' : 'resize');

  const overlay = overlays[index];
  const container = overlayContainer.getBoundingClientRect();
  const el = overlayContainer.children[index];

  el.classList.add('dragging');

  dragState = {
    index,
    mode,
    startX: e.clientX,
    startY: e.clientY,
    origX: overlay.x,
    origY: overlay.y,
    origW: overlay.width,
    origH: overlay.height,
    container
  };

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag);
}

function onDrag(e) {
  if (!dragState) return;

  const { index, mode, startX, startY, origX, origY, origW, origH, container } = dragState;
  const overlay = overlays[index];
  const el = overlayContainer.children[index];

  // Convert pixel delta to percentage
  const dx = ((e.clientX - startX) / container.width) * 100;
  const dy = ((e.clientY - startY) / container.height) * 100;

  if (mode === 'move') {
    overlay.x = Math.max(0, Math.min(100 - overlay.width, origX + dx));
    overlay.y = Math.max(0, Math.min(100 - overlay.height, origY + dy));
  } else if (mode === 'resize') {
    overlay.width = Math.max(5, Math.min(100 - overlay.x, origW + dx));
    overlay.height = Math.max(5, Math.min(100 - overlay.y, origH + dy));
  }

  el.style.left = overlay.x + '%';
  el.style.top = overlay.y + '%';
  el.style.width = overlay.width + '%';
  el.style.height = overlay.height + '%';
}

async function endDrag() {
  if (!dragState) return;

  const el = overlayContainer.children[dragState.index];
  el.classList.remove('dragging');

  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', endDrag);

  await saveOverlays();
  renderOverlayList(); // Update position text
  dragState = null;
}

// Show status message
function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status';
  }, 3000);
}

// ==================== UNDO/REDO ====================

// Capture state before an action for undo
function captureStateForUndo(actionType) {
  // Deep copy current state
  previousState = JSON.parse(JSON.stringify(overlays));
  lastActionType = actionType;
  canRedo = false;
  redoState = null;
}

// Undo the last action
async function undo() {
  if (!previousState) {
    showStatus('Nothing to undo', 'error');
    return;
  }

  // Save current state for redo
  redoState = JSON.parse(JSON.stringify(overlays));
  canRedo = true;

  // Restore previous state
  overlays = previousState;
  previousState = null;

  await saveOverlays();
  renderOverlayList();
  renderPreviewOverlays();
  showStatus(`Undid ${lastActionType}`, 'success');
  lastActionType = null;
}

// Redo the undone action
async function redo() {
  if (!canRedo || !redoState) {
    showStatus('Nothing to redo', 'error');
    return;
  }

  // Save current state in case user wants to undo again
  previousState = JSON.parse(JSON.stringify(overlays));

  // Restore redo state
  overlays = redoState;
  redoState = null;
  canRedo = false;

  await saveOverlays();
  renderOverlayList();
  renderPreviewOverlays();
  showStatus('Redid action', 'success');
}

// ==================== CONFIRMATION DIALOG ====================

// Show confirmation dialog
function showConfirmDialog(title, message, onConfirm) {
  confirmTitle.textContent = title;
  confirmMessage.innerHTML = message;
  confirmCallback = onConfirm;
  confirmModal.classList.remove('hidden');
}

// Hide confirmation dialog
function hideConfirmDialog() {
  confirmModal.classList.add('hidden');
  confirmCallback = null;
}

// Confirmation modal event handlers
confirmCancelBtn.addEventListener('click', hideConfirmDialog);

confirmOkBtn.addEventListener('click', async () => {
  if (confirmCallback) {
    await confirmCallback();
  }
  hideConfirmDialog();
});

// Close confirm modal on outside click
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    hideConfirmDialog();
  }
});

// ==================== SELECTION ====================

// Select an overlay item
function selectOverlay(overlayId) {
  // Deselect previous
  document.querySelectorAll('.overlay-item.selected').forEach(el => {
    el.classList.remove('selected');
  });

  selectedOverlayId = overlayId;

  // Select new
  if (overlayId) {
    const item = document.querySelector(`.overlay-item[data-id="${overlayId}"]`);
    if (item) {
      item.classList.add('selected');
    }
  }
}

// Deselect all
function deselectAll() {
  selectedOverlayId = null;
  document.querySelectorAll('.overlay-item.selected').forEach(el => {
    el.classList.remove('selected');
  });
}

// Delete selected overlay with confirmation
async function deleteSelectedOverlay() {
  if (!selectedOverlayId) return;

  const overlay = overlays.find(o => o.id === selectedOverlayId);
  if (!overlay) return;

  showConfirmDialog(
    'Delete Overlay?',
    `Are you sure you want to delete "<strong>${overlay.name}</strong>"?<br><small>This action can be undone with Ctrl+Z.</small>`,
    async () => {
      captureStateForUndo('delete');
      const index = overlays.findIndex(o => o.id === selectedOverlayId);
      if (index !== -1) {
        overlays.splice(index, 1);
        await saveOverlays();
        renderOverlayList();
        renderPreviewOverlays();
        showStatus('Overlay removed', 'success');
      }
      selectedOverlayId = null;
    }
  );
}

// Close modal on outside click
addModal.addEventListener('click', (e) => {
  if (e.target === addModal) {
    addModal.classList.add('hidden');
  }
});

// Drag and drop state
let draggedItem = null;
let draggedOverlayId = null;

// Set up drag-and-drop for overlay lists
function setupDragAndDrop() {
  // Set up for both user and bundled lists
  [userOverlayList, bundledOverlayList].forEach(listElement => {
    const items = listElement.querySelectorAll('.overlay-item');

    items.forEach(item => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('dragenter', handleDragEnter);
      item.addEventListener('dragleave', handleDragLeave);
      item.addEventListener('drop', handleDrop);
    });
  });
}

function handleDragStart(e) {
  draggedItem = this;
  draggedOverlayId = this.dataset.id;
  this.classList.add('dragging');

  // Add dragging-active to parent list for enhanced feedback
  const parentList = this.closest('.overlay-list');
  if (parentList) {
    parentList.classList.add('dragging-active');
  }

  // Set drag data
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);

  // Delay to allow the dragging class to apply
  setTimeout(() => {
    this.style.opacity = '0.4';
  }, 0);
}

function handleDragEnd(_e) {
  this.classList.remove('dragging');
  this.style.opacity = '';
  draggedItem = null;
  draggedOverlayId = null;

  // Remove drag-over and dragging-active from all lists
  [userOverlayList, bundledOverlayList].forEach(listElement => {
    listElement.classList.remove('dragging-active');
    listElement.querySelectorAll('.overlay-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  if (this !== draggedItem) {
    // Only allow dropping within same layer
    if (this.dataset.layer === draggedItem?.dataset.layer) {
      this.classList.add('drag-over');
    }
  }
}

function handleDragLeave(_e) {
  this.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');

  if (!draggedOverlayId || this === draggedItem) return;

  const targetId = this.dataset.id;
  const targetLayer = this.dataset.layer;

  // Find the overlays
  const draggedOverlay = overlays.find(o => o.id === draggedOverlayId);
  const targetOverlay = overlays.find(o => o.id === targetId);

  if (!draggedOverlay || !targetOverlay) return;

  // Only allow reordering within the same layer
  if (draggedOverlay.layer !== targetOverlay.layer) {
    showStatus('Can only reorder within the same layer', 'error');
    return;
  }

  captureStateForUndo('reorder');

  // Get all overlays in this layer, sorted by zIndex
  const layerOverlays = overlays
    .filter(o => o.layer === targetLayer)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // Find positions
  const draggedIndex = layerOverlays.findIndex(o => o.id === draggedOverlayId);
  const targetIndex = layerOverlays.findIndex(o => o.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Move the dragged item to the target position
  layerOverlays.splice(draggedIndex, 1);
  layerOverlays.splice(targetIndex, 0, draggedOverlay);

  // Update zIndex for all items in this layer
  layerOverlays.forEach((overlay, index) => {
    overlay.zIndex = index;
  });

  // Save and re-render
  await saveOverlays();
  renderOverlayList();
  renderPreviewOverlays();
  showStatus('Order updated', 'success');
}

// Init
init();

// ==================== KEYBOARD SHORTCUTS ====================

document.addEventListener('keydown', (e) => {
  // Skip if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Ctrl/Cmd + Z - Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }

  // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z - Redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }

  // Delete or Backspace - Remove selected overlay
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlayId) {
    e.preventDefault();
    deleteSelectedOverlay();
    return;
  }

  // Escape - Close modals and deselect
  if (e.key === 'Escape') {
    if (!confirmModal.classList.contains('hidden')) {
      hideConfirmDialog();
    } else if (!addModal.classList.contains('hidden')) {
      addModal.classList.add('hidden');
    } else {
      deselectAll();
    }
    return;
  }
});

// Click outside overlay items to deselect
document.addEventListener('click', (e) => {
  // Don't deselect when clicking on overlay items or controls
  if (e.target.closest('.overlay-item') ||
      e.target.closest('.modal') ||
      e.target.closest('.btn')) {
    return;
  }
  deselectAll();
});
