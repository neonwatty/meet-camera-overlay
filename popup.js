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
const TYPE_WALL_ART = 'wallArt';

// Text position constants
const TEXT_POSITION_LOWER_THIRD = 'lower-third';
const _TEXT_POSITION_TOP = 'top';  
const _TEXT_POSITION_CENTER = 'center';  
const _TEXT_POSITION_CUSTOM = 'custom';  

let overlays = [];
let dragState = null;
let addingType = 'standard'; // 'standard', 'effect', 'textBanner', or 'timer'

// Wall Art state
let wallArtOverlays = [];
let wallArtSettings = {
  segmentationEnabled: false,
  segmentationPreset: 'balanced',
  featherRadius: 2,
  jiggleCompensationEnabled: false,
  lightingCompensationEnabled: false
};
let editingWallArtId = null;  // Track which wall art is being edited

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

// Wall Art DOM elements
const addWallArtBtn = document.getElementById('add-wall-art');
const wallArtList = document.getElementById('wall-art-list');
const wallArtEmptyState = document.getElementById('wall-art-empty-state');
const wallArtModal = document.getElementById('wall-art-modal');
const wallArtModalTitle = document.getElementById('wall-art-modal-title');
const wallArtRegionCanvas = document.getElementById('wall-art-region-canvas');
const wallArtPaintEnabled = document.getElementById('wall-art-paint-enabled');
const wallArtPaintColor = document.getElementById('wall-art-paint-color');
const wallArtPaintOpacity = document.getElementById('wall-art-paint-opacity');
const wallArtPaintOpacityValue = document.getElementById('wall-art-paint-opacity-value');
const wallArtImageUrl = document.getElementById('wall-art-image-url');
const wallArtImageFile = document.getElementById('wall-art-image-file');
const wallArtAspectMode = document.getElementById('wall-art-aspect-mode');
const wallArtArtOpacity = document.getElementById('wall-art-art-opacity');
const wallArtArtOpacityValue = document.getElementById('wall-art-art-opacity-value');
const wallArtCancelBtn = document.getElementById('wall-art-cancel');
const wallArtConfirmBtn = document.getElementById('wall-art-confirm');
const segmentationEnabled = document.getElementById('segmentation-enabled');
const segmentationPreset = document.getElementById('segmentation-preset');
const segmentationOptions = document.getElementById('segmentation-options');
const featherRadius = document.getElementById('feather-radius');
const featherValue = document.getElementById('feather-value');
const editRegionOnVideoBtn = document.getElementById('edit-region-on-video');
const jiggleCompensationEnabled = document.getElementById('jiggle-compensation-enabled');
const lightingCompensationEnabled = document.getElementById('lighting-compensation-enabled');
const detectWallsBtn = document.getElementById('detect-walls');

// Wall Art region editor state
let wallArtRegion = null;
let wallArtDraggingCorner = null;

// Track if video region editor is open (state tracking for potential future use)
// eslint-disable-next-line no-unused-vars
let videoRegionEditorOpen = false;

// Performance warning badge elements
const performanceWarningsContainer = document.getElementById('performance-warnings');
const fpsWarningBadge = document.querySelector('.warning-badge.fps-warning');
const segmentationWarningBadge = document.querySelector('.warning-badge.quality-warning');

// Tutorial modal elements
const tutorialModal = document.getElementById('tutorial-modal');
const tutorialCloseBtn = document.getElementById('tutorial-close');
const tutorialSkipBtn = document.getElementById('tutorial-skip');
const tutorialPrevBtn = document.getElementById('tutorial-prev');
const tutorialNextBtn = document.getElementById('tutorial-next');

// Tutorial state
let tutorialCurrentStep = 1;
const TUTORIAL_TOTAL_STEPS = 4;

// Initialize
async function init() {
  await loadOverlays();
  await loadWallArt();
  renderOverlayList();
  renderPreviewOverlays();
  renderWallArtList();
  setupWallArtEventHandlers();
  setupPerformanceMetricsListener();
  setupTutorial();
  await checkShowTutorial();
}

// ==================== PERFORMANCE WARNING BADGES ====================

/**
 * Update warning badges based on performance metrics
 * @param {Object} metrics - Performance metrics from inject.js
 */
function updatePerformanceWarnings(metrics) {
  if (!performanceWarningsContainer) return;

  const warnings = metrics.warnings || [];
  let hasWarnings = false;

  // Update FPS warning badge
  const fpsWarning = warnings.find(w => w.type === 'fps_low' || w.type === 'fps_critical');
  if (fpsWarningBadge) {
    if (fpsWarning) {
      fpsWarningBadge.classList.remove('hidden');
      fpsWarningBadge.classList.toggle('critical', fpsWarning.severity === 'critical');
      fpsWarningBadge.querySelector('.warning-text').textContent = fpsWarning.message;
      hasWarnings = true;
    } else {
      fpsWarningBadge.classList.add('hidden');
    }
  }

  // Update segmentation warning badge
  const segWarning = warnings.find(w => w.type === 'segmentation_slow' || w.type === 'segmentation_critical');
  if (segmentationWarningBadge) {
    if (segWarning) {
      segmentationWarningBadge.classList.remove('hidden');
      segmentationWarningBadge.classList.toggle('critical', segWarning.severity === 'critical');
      segmentationWarningBadge.querySelector('.warning-text').textContent = segWarning.message;
      hasWarnings = true;
    } else {
      segmentationWarningBadge.classList.add('hidden');
    }
  }

  // Show/hide the container
  performanceWarningsContainer.classList.toggle('hidden', !hasWarnings);
}

/**
 * Set up listener for performance metrics from content script
 */
function setupPerformanceMetricsListener() {
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.type === 'PERFORMANCE_METRICS') {
      updatePerformanceWarnings(message.metrics);
    }
    // Return false to indicate synchronous response
    return false;
  });
}

// ==================== TUTORIAL (FIRST-USE ONBOARDING) ====================

/**
 * Check if tutorial should be shown on startup
 */
async function checkShowTutorial() {
  const result = await chrome.storage.local.get(['showTutorial']);
  if (result.showTutorial) {
    showTutorial();
  }
}

/**
 * Set up tutorial event handlers
 */
function setupTutorial() {
  if (tutorialCloseBtn) {
    tutorialCloseBtn.addEventListener('click', closeTutorial);
  }
  if (tutorialSkipBtn) {
    tutorialSkipBtn.addEventListener('click', closeTutorial);
  }
  if (tutorialPrevBtn) {
    tutorialPrevBtn.addEventListener('click', tutorialPrev);
  }
  if (tutorialNextBtn) {
    tutorialNextBtn.addEventListener('click', tutorialNext);
  }
}

/**
 * Show the tutorial modal
 */
function showTutorial() {
  if (!tutorialModal) return;
  tutorialCurrentStep = 1;
  updateTutorialStep();
  tutorialModal.classList.remove('hidden');
}

/**
 * Close the tutorial and mark as completed
 */
async function closeTutorial() {
  if (!tutorialModal) return;
  tutorialModal.classList.add('hidden');
  // Mark tutorial as completed so it doesn't show again
  await chrome.storage.local.set({ showTutorial: false });
}

/**
 * Go to previous tutorial step
 */
function tutorialPrev() {
  if (tutorialCurrentStep > 1) {
    tutorialCurrentStep--;
    updateTutorialStep();
  }
}

/**
 * Go to next tutorial step or finish
 */
function tutorialNext() {
  if (tutorialCurrentStep < TUTORIAL_TOTAL_STEPS) {
    tutorialCurrentStep++;
    updateTutorialStep();
  } else {
    closeTutorial();
  }
}

/**
 * Update the tutorial UI to reflect current step
 */
function updateTutorialStep() {
  // Update step content visibility
  for (let i = 1; i <= TUTORIAL_TOTAL_STEPS; i++) {
    const stepContent = document.getElementById(`tutorial-step-${i}`);
    if (stepContent) {
      stepContent.classList.toggle('hidden', i !== tutorialCurrentStep);
    }
  }

  // Update progress dots
  document.querySelectorAll('.tutorial-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.toggle('active', stepNum === tutorialCurrentStep);
    step.classList.toggle('completed', stepNum < tutorialCurrentStep);
  });

  // Update navigation buttons
  if (tutorialPrevBtn) {
    tutorialPrevBtn.classList.toggle('hidden', tutorialCurrentStep === 1);
  }
  if (tutorialNextBtn) {
    tutorialNextBtn.textContent = tutorialCurrentStep === TUTORIAL_TOTAL_STEPS ? 'Get Started' : 'Next';
  }
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

// ==================== WALL ART FUNCTIONS ====================

// Load wall art from storage
async function loadWallArt() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['wallArtOverlays', 'wallArtSettings'], (result) => {
      wallArtOverlays = result.wallArtOverlays || [];
      if (result.wallArtSettings) {
        wallArtSettings = result.wallArtSettings;
      }
      // Update UI state
      if (segmentationEnabled) {
        segmentationEnabled.checked = wallArtSettings.segmentationEnabled;
      }
      if (segmentationPreset) {
        segmentationPreset.value = wallArtSettings.segmentationPreset;
      }
      if (featherRadius) {
        featherRadius.value = wallArtSettings.featherRadius;
      }
      if (featherValue) {
        featherValue.textContent = `${wallArtSettings.featherRadius}px`;
      }
      if (segmentationOptions) {
        segmentationOptions.classList.toggle('hidden', !wallArtSettings.segmentationEnabled);
      }
      if (jiggleCompensationEnabled) {
        jiggleCompensationEnabled.checked = wallArtSettings.jiggleCompensationEnabled || false;
      }
      if (lightingCompensationEnabled) {
        lightingCompensationEnabled.checked = wallArtSettings.lightingCompensationEnabled || false;
      }
      resolve();
    });
  });
}

// Save wall art to storage and notify content script
async function saveWallArt() {
  await chrome.storage.local.set({ wallArtOverlays, wallArtSettings });

  // Notify active Meet tabs
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_WALL_ART', wallArtOverlays }).catch(() => {});
    chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_WALL_ART_SETTINGS', settings: wallArtSettings }).catch(() => {});
  }
}

// Create a default wall art region (centered 60x60%)
function createDefaultRegion() {
  return {
    topLeft: { x: 20, y: 20 },
    topRight: { x: 80, y: 20 },
    bottomLeft: { x: 20, y: 80 },
    bottomRight: { x: 80, y: 80 }
  };
}

// Draw region on canvas
function drawRegionOnCanvas() {
  if (!wallArtRegionCanvas || !wallArtRegion) return;

  const ctx = wallArtRegionCanvas.getContext('2d');
  const width = wallArtRegionCanvas.width;
  const height = wallArtRegionCanvas.height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Convert region to pixels
  const toPixel = (point) => ({
    x: (point.x / 100) * width,
    y: (point.y / 100) * height
  });

  const tl = toPixel(wallArtRegion.topLeft);
  const tr = toPixel(wallArtRegion.topRight);
  const bl = toPixel(wallArtRegion.bottomLeft);
  const br = toPixel(wallArtRegion.bottomRight);

  // Draw filled region
  ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill();

  // Draw outline
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw corner handles
  const corners = [tl, tr, bl, br];
  for (const corner of corners) {
    // White border
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 10, 0, Math.PI * 2);
    ctx.fill();

    // Pink fill
    ctx.fillStyle = '#e94560';
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Get which corner is at a point
function getCornerAtPoint(x, y) {
  if (!wallArtRegion || !wallArtRegionCanvas) return null;

  const width = wallArtRegionCanvas.width;
  const height = wallArtRegionCanvas.height;
  const threshold = 15; // pixels

  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

  for (const corner of corners) {
    const px = (wallArtRegion[corner].x / 100) * width;
    const py = (wallArtRegion[corner].y / 100) * height;
    const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
    if (dist <= threshold) {
      return corner;
    }
  }

  return null;
}

// Create wall art item for list
function createWallArtItem(wallArt, index) {
  const item = document.createElement('div');
  item.className = `overlay-item wall-art-item${wallArt.active ? ' active' : ''}`;
  item.dataset.id = wallArt.id;

  const paintColor = wallArt.paint?.enabled ? wallArt.paint.color : 'transparent';
  const hasArt = wallArt.art && wallArt.art.src;

  item.innerHTML = `
    <div class="wall-art-icon">
      🖼️
      ${wallArt.paint?.enabled ? `<div class="paint-indicator" style="background: ${paintColor}"></div>` : ''}
    </div>
    <div class="info">
      <div class="name">${wallArt.name || 'Wall Art Region'}</div>
      <div class="position">
        ${wallArt.paint?.enabled ? 'Paint' : ''}${wallArt.paint?.enabled && hasArt ? ' + ' : ''}${hasArt ? 'Art' : ''}
        ${!wallArt.paint?.enabled && !hasArt ? 'No content' : ''}
      </div>
    </div>
    <button class="trigger-btn ${wallArt.active ? 'active' : ''}" data-id="${wallArt.id}">
      ${wallArt.active ? 'ON' : 'OFF'}
    </button>
    <button class="edit-text-btn" data-id="${wallArt.id}" title="Edit">✏️</button>
    <button class="delete-btn" data-index="${index}" title="Remove">×</button>
  `;

  return item;
}

// Render wall art list
function renderWallArtList() {
  if (!wallArtList) return;

  wallArtList.innerHTML = '';

  // Handle empty state
  if (wallArtEmptyState) {
    wallArtEmptyState.classList.toggle('hidden', wallArtOverlays.length > 0);
  }

  wallArtOverlays.forEach((wallArt, index) => {
    const item = createWallArtItem(wallArt, index);
    wallArtList.appendChild(item);
  });

  // Set up event handlers
  setupWallArtListHandlers();
}

// Set up wall art list event handlers
function setupWallArtListHandlers() {
  if (!wallArtList) return;

  // Toggle buttons
  wallArtList.querySelectorAll('.trigger-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const wallArt = wallArtOverlays.find(wa => wa.id === id);
      if (wallArt) {
        wallArt.active = !wallArt.active;
        await saveWallArt();
        renderWallArtList();

        // Also send toggle message to content script
        const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_WALL_ART',
            id,
            active: wallArt.active
          }).catch(() => {});
        }
      }
    });
  });

  // Edit buttons
  wallArtList.querySelectorAll('.edit-text-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openWallArtModal(id);
    });
  });

  // Delete buttons
  wallArtList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      if (index >= 0 && index < wallArtOverlays.length) {
        showConfirmDialog(
          'Delete Wall Art',
          'Are you sure you want to delete this wall art region?',
          async () => {
            wallArtOverlays.splice(index, 1);
            await saveWallArt();
            renderWallArtList();
            showStatus('Wall art deleted', 'success');
          }
        );
      }
    });
  });
}

// Detect walls in the current video feed
async function detectWalls() {
  // Check for active Meet tab
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  if (tabs.length === 0) {
    showStatus('Open Google Meet first', 'error');
    return;
  }

  // Show loading status
  showStatus('Detecting walls...', 'info');
  if (detectWallsBtn) {
    detectWallsBtn.disabled = true;
    detectWallsBtn.textContent = '⏳ Detecting...';
  }

  try {
    // Send detection request to content script
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'DETECT_WALLS' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response.success && response.regions && response.regions.length > 0) {
      // Found regions - let user select one
      showWallRegionPicker(response.regions);
    } else {
      showStatus(response.reason || 'No suitable wall regions found', 'error');
    }
  } catch (error) {
    console.error('[Meet Overlay] Wall detection failed:', error);
    showStatus('Wall detection failed - is camera active?', 'error');
  } finally {
    // Reset button state
    if (detectWallsBtn) {
      detectWallsBtn.disabled = false;
      detectWallsBtn.textContent = '🔍 Detect';
    }
  }
}

// Show wall region picker for detected regions
function showWallRegionPicker(regions) {
  // Create a modal to show detected regions
  let pickerModal = document.getElementById('wall-region-picker-modal');
  if (!pickerModal) {
    pickerModal = document.createElement('div');
    pickerModal.id = 'wall-region-picker-modal';
    pickerModal.className = 'modal';
    document.body.appendChild(pickerModal);
  }

  // Generate region cards
  const regionCards = regions.map((r, index) => {
    const colorHex = r.color ? `#${((1 << 24) + (r.color.r << 16) + (r.color.g << 8) + r.color.b).toString(16).slice(1)}` : '#888';
    const areaPercent = Math.round(r.area * 100);
    return `
      <div class="wall-region-card" data-index="${index}">
        <div class="wall-region-preview" style="background: ${colorHex};">
          <span class="wall-region-score">${Math.round(r.score * 100)}%</span>
        </div>
        <div class="wall-region-info">
          <span class="wall-region-label">Region ${index + 1}</span>
          <span class="wall-region-size">${areaPercent}% of frame</span>
        </div>
      </div>
    `;
  }).join('');

  pickerModal.innerHTML = `
    <div class="modal-content modal-wide">
      <h3>Detected Wall Regions</h3>
      <p class="modal-hint">Select a region to create wall art:</p>
      <div class="wall-region-grid">
        ${regionCards}
      </div>
      <div class="modal-actions">
        <button id="wall-picker-cancel" class="btn btn-secondary">Cancel</button>
      </div>
    </div>
  `;

  pickerModal.classList.remove('hidden');

  // Add event handlers
  pickerModal.querySelectorAll('.wall-region-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      const selectedRegion = regions[index];
      pickerModal.classList.add('hidden');

      // Open wall art modal with detected region
      openWallArtModalWithRegion(selectedRegion.region);
    });
  });

  document.getElementById('wall-picker-cancel')?.addEventListener('click', () => {
    pickerModal.classList.add('hidden');
  });

  showStatus(`Found ${regions.length} wall region(s)`, 'success');
}

// Open wall art modal pre-populated with a detected region
function openWallArtModalWithRegion(region) {
  if (!wallArtModal) return;

  editingWallArtId = null;

  if (wallArtModalTitle) {
    wallArtModalTitle.textContent = 'Create Wall Art from Detection';
  }
  if (wallArtConfirmBtn) {
    wallArtConfirmBtn.textContent = 'Add';
  }

  // Set the detected region
  wallArtRegion = region;

  // Reset other fields to defaults
  if (wallArtPaintEnabled) wallArtPaintEnabled.checked = false;
  if (wallArtPaintColor) wallArtPaintColor.value = '#808080';
  if (wallArtPaintOpacity) wallArtPaintOpacity.value = 100;
  if (wallArtPaintOpacityValue) wallArtPaintOpacityValue.textContent = '100%';
  if (wallArtImageUrl) wallArtImageUrl.value = '';
  if (wallArtImageFile) wallArtImageFile.value = '';
  if (wallArtAspectMode) wallArtAspectMode.value = 'stretch';
  if (wallArtArtOpacity) wallArtArtOpacity.value = 100;
  if (wallArtArtOpacityValue) wallArtArtOpacityValue.textContent = '100%';

  // Reset to paint tab
  document.querySelectorAll('.wall-art-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === 'paint');
  });
  const paintTab = document.getElementById('wall-art-paint-tab');
  const artTab = document.getElementById('wall-art-art-tab');
  if (paintTab) paintTab.classList.remove('hidden');
  if (artTab) artTab.classList.add('hidden');

  wallArtModal.classList.remove('hidden');

  // Draw the region on canvas
  drawRegionOnCanvas();

  showStatus('Region loaded - adjust and save', 'success');
}

// Open wall art modal for adding or editing
function openWallArtModal(editId = null) {
  if (!wallArtModal) return;

  editingWallArtId = editId;

  if (editId) {
    // Editing existing
    const wallArt = wallArtOverlays.find(wa => wa.id === editId);
    if (!wallArt) return;

    if (wallArtModalTitle) {
      wallArtModalTitle.textContent = 'Edit Wall Art Region';
    }
    if (wallArtConfirmBtn) {
      wallArtConfirmBtn.textContent = 'Save';
    }

    // Load region
    wallArtRegion = JSON.parse(JSON.stringify(wallArt.region));

    // Load paint settings
    if (wallArtPaintEnabled) {
      wallArtPaintEnabled.checked = wallArt.paint?.enabled || false;
    }
    if (wallArtPaintColor) {
      wallArtPaintColor.value = wallArt.paint?.color || '#808080';
    }
    if (wallArtPaintOpacity) {
      wallArtPaintOpacity.value = (wallArt.paint?.opacity || 1) * 100;
    }
    if (wallArtPaintOpacityValue) {
      wallArtPaintOpacityValue.textContent = `${Math.round((wallArt.paint?.opacity || 1) * 100)}%`;
    }

    // Load art settings
    if (wallArtImageUrl) {
      wallArtImageUrl.value = wallArt.art?.src || '';
    }
    if (wallArtAspectMode) {
      wallArtAspectMode.value = wallArt.art?.aspectRatioMode || 'stretch';
    }
    if (wallArtArtOpacity) {
      wallArtArtOpacity.value = (wallArt.art?.opacity || 1) * 100;
    }
    if (wallArtArtOpacityValue) {
      wallArtArtOpacityValue.textContent = `${Math.round((wallArt.art?.opacity || 1) * 100)}%`;
    }
  } else {
    // Adding new
    if (wallArtModalTitle) {
      wallArtModalTitle.textContent = 'Add Wall Art Region';
    }
    if (wallArtConfirmBtn) {
      wallArtConfirmBtn.textContent = 'Add';
    }

    // Reset to defaults
    wallArtRegion = createDefaultRegion();

    if (wallArtPaintEnabled) wallArtPaintEnabled.checked = false;
    if (wallArtPaintColor) wallArtPaintColor.value = '#808080';
    if (wallArtPaintOpacity) wallArtPaintOpacity.value = 100;
    if (wallArtPaintOpacityValue) wallArtPaintOpacityValue.textContent = '100%';
    if (wallArtImageUrl) wallArtImageUrl.value = '';
    if (wallArtImageFile) wallArtImageFile.value = '';
    if (wallArtAspectMode) wallArtAspectMode.value = 'stretch';
    if (wallArtArtOpacity) wallArtArtOpacity.value = 100;
    if (wallArtArtOpacityValue) wallArtArtOpacityValue.textContent = '100%';
  }

  // Draw initial region
  drawRegionOnCanvas();

  // Show modal
  wallArtModal.classList.remove('hidden');
}

// Setup wall art event handlers
function setupWallArtEventHandlers() {
  // Add Wall Art button
  if (addWallArtBtn) {
    addWallArtBtn.addEventListener('click', () => {
      openWallArtModal();
    });
  }

  // Edit Region on Video button
  if (editRegionOnVideoBtn) {
    editRegionOnVideoBtn.addEventListener('click', () => {
      openRegionEditorOnVideo();
    });
  }

  // Detect Walls button
  if (detectWallsBtn) {
    detectWallsBtn.addEventListener('click', () => {
      detectWalls();
    });
  }

  // Wall Art Modal tabs
  document.querySelectorAll('.wall-art-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      // Update tab active states
      document.querySelectorAll('.wall-art-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show/hide tab content
      const paintTab = document.getElementById('wall-art-paint-tab');
      const artTab = document.getElementById('wall-art-art-tab');
      if (paintTab) paintTab.classList.toggle('hidden', tabName !== 'paint');
      if (artTab) artTab.classList.toggle('hidden', tabName !== 'art');
    });
  });

  // Wall Art Modal cancel
  if (wallArtCancelBtn) {
    wallArtCancelBtn.addEventListener('click', () => {
      wallArtModal.classList.add('hidden');
      editingWallArtId = null;
    });
  }

  // Wall Art Modal confirm
  if (wallArtConfirmBtn) {
    wallArtConfirmBtn.addEventListener('click', async () => {
      // Get art source (URL or file)
      let artSrc = wallArtImageUrl?.value || '';
      let contentType = 'image';

      // Check if file was uploaded
      if (wallArtImageFile?.files?.length > 0) {
        const file = wallArtImageFile.files[0];

        // Detect content type from MIME type
        if (file.type === 'image/gif') {
          contentType = 'gif';
        } else if (file.type.startsWith('video/')) {
          contentType = 'video';
        }

        // Use Blob URL for large files (>2MB) or videos to avoid data URL limits
        if (file.size > 2 * 1024 * 1024 || contentType === 'video') {
          artSrc = URL.createObjectURL(file);
        } else {
          artSrc = await readFileAsDataUrl(file);
        }
      }

      const wallArtData = {
        region: wallArtRegion,
        paint: wallArtPaintEnabled?.checked ? {
          enabled: true,
          color: wallArtPaintColor?.value || '#808080',
          opacity: (wallArtPaintOpacity?.value || 100) / 100
        } : null,
        art: artSrc ? {
          src: artSrc,
          contentType,
          aspectRatioMode: wallArtAspectMode?.value || 'stretch',
          opacity: (wallArtArtOpacity?.value || 100) / 100
        } : null,
        active: true
      };

      if (editingWallArtId) {
        // Update existing
        const index = wallArtOverlays.findIndex(wa => wa.id === editingWallArtId);
        if (index >= 0) {
          wallArtOverlays[index] = {
            ...wallArtOverlays[index],
            ...wallArtData,
            updatedAt: Date.now()
          };
        }
      } else {
        // Add new
        const newWallArt = {
          id: `wall-art-${generateId()}`,
          type: TYPE_WALL_ART,
          name: `Wall Art Region`,
          ...wallArtData,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        wallArtOverlays.push(newWallArt);
      }

      await saveWallArt();
      renderWallArtList();
      wallArtModal.classList.add('hidden');
      editingWallArtId = null;
      showStatus(editingWallArtId ? 'Wall art updated' : 'Wall art added', 'success');
    });
  }

  // Paint opacity slider
  if (wallArtPaintOpacity) {
    wallArtPaintOpacity.addEventListener('input', () => {
      if (wallArtPaintOpacityValue) {
        wallArtPaintOpacityValue.textContent = `${wallArtPaintOpacity.value}%`;
      }
    });
  }

  // Art opacity slider
  if (wallArtArtOpacity) {
    wallArtArtOpacity.addEventListener('input', () => {
      if (wallArtArtOpacityValue) {
        wallArtArtOpacityValue.textContent = `${wallArtArtOpacity.value}%`;
      }
    });
  }

  // Region canvas mouse events
  if (wallArtRegionCanvas) {
    wallArtRegionCanvas.addEventListener('mousedown', (e) => {
      const rect = wallArtRegionCanvas.getBoundingClientRect();
      const scaleX = wallArtRegionCanvas.width / rect.width;
      const scaleY = wallArtRegionCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const corner = getCornerAtPoint(x, y);
      if (corner) {
        wallArtDraggingCorner = corner;
      }
    });

    wallArtRegionCanvas.addEventListener('mousemove', (e) => {
      if (!wallArtDraggingCorner || !wallArtRegion) return;

      const rect = wallArtRegionCanvas.getBoundingClientRect();
      const scaleX = wallArtRegionCanvas.width / rect.width;
      const scaleY = wallArtRegionCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Convert to percentage
      const px = Math.max(0, Math.min(100, (x / wallArtRegionCanvas.width) * 100));
      const py = Math.max(0, Math.min(100, (y / wallArtRegionCanvas.height) * 100));

      wallArtRegion[wallArtDraggingCorner] = { x: px, y: py };
      drawRegionOnCanvas();
    });

    wallArtRegionCanvas.addEventListener('mouseup', () => {
      wallArtDraggingCorner = null;
    });

    wallArtRegionCanvas.addEventListener('mouseleave', () => {
      wallArtDraggingCorner = null;
    });
  }

  // Segmentation toggle
  if (segmentationEnabled) {
    segmentationEnabled.addEventListener('change', async () => {
      wallArtSettings.segmentationEnabled = segmentationEnabled.checked;
      if (segmentationOptions) {
        segmentationOptions.classList.toggle('hidden', !segmentationEnabled.checked);
      }
      await saveWallArt();
    });
  }

  // Segmentation preset
  if (segmentationPreset) {
    segmentationPreset.addEventListener('change', async () => {
      wallArtSettings.segmentationPreset = segmentationPreset.value;
      await saveWallArt();
    });
  }

  // Feather radius
  if (featherRadius) {
    featherRadius.addEventListener('input', async () => {
      wallArtSettings.featherRadius = parseInt(featherRadius.value);
      if (featherValue) {
        featherValue.textContent = `${featherRadius.value}px`;
      }
      await saveWallArt();
    });
  }

  // Jiggle compensation (stabilization) toggle
  if (jiggleCompensationEnabled) {
    jiggleCompensationEnabled.addEventListener('change', async () => {
      wallArtSettings.jiggleCompensationEnabled = jiggleCompensationEnabled.checked;
      await saveWallArt();
    });
  }

  // Lighting compensation (auto-lighting) toggle
  if (lightingCompensationEnabled) {
    lightingCompensationEnabled.addEventListener('change', async () => {
      wallArtSettings.lightingCompensationEnabled = lightingCompensationEnabled.checked;
      await saveWallArt();
    });
  }
}

// Helper to read file as data URL
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Open region editor on Meet video
async function openRegionEditorOnVideo() {
  // Check if we have a Google Meet tab open
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  if (tabs.length === 0) {
    showStatus('Open Google Meet first', 'error');
    return;
  }

  if (!wallArtRegion) {
    showStatus('No region to edit', 'error');
    return;
  }

  videoRegionEditorOpen = true;

  // Send message to content script to show the editor
  try {
    await chrome.tabs.sendMessage(tabs[0].id, {
      type: 'SHOW_REGION_EDITOR',
      region: wallArtRegion,
      wallArtId: editingWallArtId
    });

    showStatus('Editing on video - switch to Meet tab', 'success');
  } catch (err) {
    console.error('Failed to open region editor:', err);
    showStatus('Failed to open editor on video', 'error');
    videoRegionEditorOpen = false;
  }
}

// Listen for messages from content script (region editor results)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REGION_EDITOR_SAVE') {
    console.log('[Popup] Region editor save:', message);
    videoRegionEditorOpen = false;

    // Update the region in our state
    if (message.region) {
      wallArtRegion = message.region;

      // If we're editing a wall art, update it
      if (editingWallArtId && message.wallArtId === editingWallArtId) {
        // Redraw the canvas to show updated region
        drawRegionOnCanvas();
      }

      showStatus('Region updated from video', 'success');
    }

    sendResponse({ success: true });
  }

  if (message.type === 'REGION_EDITOR_CANCEL') {
    console.log('[Popup] Region editor cancelled');
    videoRegionEditorOpen = false;
    showStatus('Region editing cancelled', 'success');
    sendResponse({ success: true });
  }

  if (message.type === 'REGION_EDITOR_UPDATE') {
    // Live update the region preview in popup
    if (message.region && editingWallArtId && message.wallArtId === editingWallArtId) {
      wallArtRegion = message.region;
      drawRegionOnCanvas();
    }
    sendResponse({ success: true });
  }

  return true; // Keep channel open for async response
});

// ==================== END WALL ART FUNCTIONS ====================

// ==================== SETUP WIZARD FUNCTIONS ====================

// Wizard state
let wizardState = {
  currentStep: 1,
  countdownInterval: null,
  capturedFrame: null,
  benchmarkResults: null,
  wizardRegion: null,
  wizardDraggingCorner: null
};

// Wizard DOM elements
const wizardModal = document.getElementById('wizard-modal');
const wizardCloseBtn = document.getElementById('wizard-close');
const wizardCancelBtn = document.getElementById('wizard-cancel');
const wizardNextBtn = document.getElementById('wizard-next');
const wizardCountdown = document.getElementById('wizard-countdown');
const wizardRegionCanvas = document.getElementById('wizard-region-canvas');
const wizardPresetSelect = document.getElementById('wizard-preset-select');
const wizardBenchmarkResults = document.getElementById('wizard-benchmark-results');
const wizardRegionStatus = document.getElementById('wizard-region-status');
const runWizardBtn = document.getElementById('run-wizard');
const wizardStatusEl = document.getElementById('wizard-status');

// Initialize wizard on page load
async function initWizard() {
  // Check if wizard has been completed before
  const result = await chrome.storage.local.get(['wizardSetupData']);
  if (result.wizardSetupData) {
    updateWizardStatusDisplay(true);
  }

  // Set up wizard event handlers
  setupWizardEventHandlers();
}

// Update the wizard status display in the trigger section
function updateWizardStatusDisplay(complete) {
  if (!wizardStatusEl) return;

  const icon = wizardStatusEl.querySelector('.wizard-status-icon');
  const text = wizardStatusEl.querySelector('.wizard-status-text');

  if (complete) {
    wizardStatusEl.classList.add('complete');
    if (icon) icon.textContent = '✓';
    if (text) text.textContent = 'Setup complete';
  } else {
    wizardStatusEl.classList.remove('complete');
    if (icon) icon.textContent = '⚙️';
    if (text) text.textContent = 'Setup not complete';
  }
}

// Set up wizard event handlers
function setupWizardEventHandlers() {
  if (runWizardBtn) {
    runWizardBtn.addEventListener('click', openWizard);
  }

  if (wizardCloseBtn) {
    wizardCloseBtn.addEventListener('click', closeWizard);
  }

  if (wizardCancelBtn) {
    wizardCancelBtn.addEventListener('click', closeWizard);
  }

  if (wizardNextBtn) {
    wizardNextBtn.addEventListener('click', handleWizardNext);
  }

  // Set up region canvas event handlers
  if (wizardRegionCanvas) {
    wizardRegionCanvas.addEventListener('mousedown', handleWizardCanvasMouseDown);
    wizardRegionCanvas.addEventListener('mousemove', handleWizardCanvasMouseMove);
    wizardRegionCanvas.addEventListener('mouseup', handleWizardCanvasMouseUp);
    wizardRegionCanvas.addEventListener('mouseleave', handleWizardCanvasMouseUp);
  }

  // Close wizard on outside click
  if (wizardModal) {
    wizardModal.addEventListener('click', (e) => {
      if (e.target === wizardModal) {
        closeWizard();
      }
    });
  }
}

// Open the wizard modal
async function openWizard() {
  // Check if we have an active Meet tab
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  if (tabs.length === 0) {
    showStatus('Please open a Google Meet tab first', 'error');
    return;
  }

  // Reset wizard state
  wizardState = {
    currentStep: 1,
    countdownInterval: null,
    capturedFrame: null,
    benchmarkResults: null,
    wizardRegion: createDefaultRegion(),
    wizardDraggingCorner: null
  };

  // Show modal
  if (wizardModal) {
    wizardModal.classList.remove('hidden');
  }

  // Update UI for step 1
  updateWizardStep(1);

  // Start countdown
  startCountdown();
}

// Close the wizard modal
function closeWizard() {
  // Stop countdown if running
  if (wizardState.countdownInterval) {
    clearInterval(wizardState.countdownInterval);
    wizardState.countdownInterval = null;
  }

  // Hide modal
  if (wizardModal) {
    wizardModal.classList.add('hidden');
  }
}

// Update wizard step display
function updateWizardStep(step) {
  wizardState.currentStep = step;

  // Update progress indicators
  document.querySelectorAll('.wizard-step').forEach(stepEl => {
    const stepNum = parseInt(stepEl.dataset.step);
    stepEl.classList.remove('active', 'completed');
    if (stepNum < step) {
      stepEl.classList.add('completed');
    } else if (stepNum === step) {
      stepEl.classList.add('active');
    }
  });

  // Update step lines
  document.querySelectorAll('.wizard-step-line').forEach((line, index) => {
    if (index + 1 < step) {
      line.classList.add('completed');
    } else {
      line.classList.remove('completed');
    }
  });

  // Show/hide step content
  for (let i = 1; i <= 4; i++) {
    const content = document.getElementById(`wizard-step-${i}`);
    if (content) {
      content.classList.toggle('hidden', i !== step);
    }
  }

  // Update next button text
  if (wizardNextBtn) {
    if (step === 1) {
      wizardNextBtn.textContent = 'Skip';
      wizardNextBtn.disabled = false;
    } else if (step === 2) {
      wizardNextBtn.textContent = 'Processing...';
      wizardNextBtn.disabled = true;
    } else if (step === 3) {
      wizardNextBtn.textContent = 'Continue';
      wizardNextBtn.disabled = false;
    } else if (step === 4) {
      wizardNextBtn.textContent = 'Apply Settings';
      wizardNextBtn.disabled = false;
    }
  }
}

// Start the countdown for step 1
function startCountdown() {
  let count = 5;

  if (wizardCountdown) {
    wizardCountdown.textContent = count;
  }

  wizardState.countdownInterval = setInterval(() => {
    count--;

    if (wizardCountdown) {
      wizardCountdown.textContent = count;
    }

    if (count <= 0) {
      clearInterval(wizardState.countdownInterval);
      wizardState.countdownInterval = null;

      // Move to step 2 and start processing
      updateWizardStep(2);
      runProcessingTasks();
    }
  }, 1000);
}

// Run the processing tasks (step 2)
async function runProcessingTasks() {
  const captureTask = document.querySelector('.wizard-task[data-task="capture"]');
  const benchmarkTask = document.querySelector('.wizard-task[data-task="benchmark"]');
  const analyzeTask = document.querySelector('.wizard-task[data-task="analyze"]');

  // Task 1: Capture frame
  if (captureTask) {
    captureTask.classList.add('active');
    captureTask.querySelector('.wizard-task-icon').textContent = '⏳';
  }

  try {
    const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
    if (tabs.length > 0) {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'WIZARD_CAPTURE_FRAME' });

      if (response && response.success) {
        wizardState.capturedFrame = response;
        if (captureTask) {
          captureTask.classList.remove('active');
          captureTask.classList.add('completed');
          captureTask.querySelector('.wizard-task-icon').textContent = '✓';
        }
      } else {
        throw new Error(response?.error || 'Frame capture failed');
      }
    }
  } catch (error) {
    console.error('Frame capture error:', error);
    if (captureTask) {
      captureTask.classList.remove('active');
      captureTask.classList.add('error');
      captureTask.querySelector('.wizard-task-icon').textContent = '✗';
    }
  }

  // Task 2: Run benchmark
  if (benchmarkTask) {
    benchmarkTask.classList.add('active');
    benchmarkTask.querySelector('.wizard-task-icon').textContent = '⏳';
  }

  try {
    const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
    if (tabs.length > 0) {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'WIZARD_RUN_BENCHMARK' });

      if (response && response.success) {
        wizardState.benchmarkResults = response;
        if (benchmarkTask) {
          benchmarkTask.classList.remove('active');
          benchmarkTask.classList.add('completed');
          benchmarkTask.querySelector('.wizard-task-icon').textContent = '✓';
        }
      } else {
        // Use default if benchmark fails
        wizardState.benchmarkResults = {
          success: false,
          recommendedPreset: response?.recommendedPreset || 'balanced',
          error: response?.error
        };
        if (benchmarkTask) {
          benchmarkTask.classList.remove('active');
          benchmarkTask.classList.add('completed');
          benchmarkTask.querySelector('.wizard-task-icon').textContent = '⚠';
        }
      }
    }
  } catch (error) {
    console.error('Benchmark error:', error);
    wizardState.benchmarkResults = { success: false, recommendedPreset: 'balanced' };
    if (benchmarkTask) {
      benchmarkTask.classList.remove('active');
      benchmarkTask.classList.add('error');
      benchmarkTask.querySelector('.wizard-task-icon').textContent = '✗';
    }
  }

  // Task 3: Analyze results
  if (analyzeTask) {
    analyzeTask.classList.add('active');
    analyzeTask.querySelector('.wizard-task-icon').textContent = '⏳';
  }

  // Brief delay for UX
  await new Promise(resolve => setTimeout(resolve, 500));

  if (analyzeTask) {
    analyzeTask.classList.remove('active');
    analyzeTask.classList.add('completed');
    analyzeTask.querySelector('.wizard-task-icon').textContent = '✓';
  }

  // Enable next button and move forward
  if (wizardNextBtn) {
    wizardNextBtn.textContent = 'Continue';
    wizardNextBtn.disabled = false;
  }

  // Auto-advance to step 3
  setTimeout(() => {
    updateWizardStep(3);
    initWizardRegionCanvas();
  }, 500);
}

// Initialize the wizard region canvas with the captured frame
function initWizardRegionCanvas() {
  if (!wizardRegionCanvas || !wizardState.capturedFrame?.frameDataUrl) {
    // If no frame captured, just draw default background
    drawWizardRegion();
    return;
  }

  // Load the captured frame as background
  const img = new Image();
  img.onload = () => {
    wizardState.backgroundImage = img;
    drawWizardRegion();
  };
  img.src = wizardState.capturedFrame.frameDataUrl;
}

// Draw the wizard region on canvas
function drawWizardRegion() {
  if (!wizardRegionCanvas || !wizardState.wizardRegion) return;

  const ctx = wizardRegionCanvas.getContext('2d');
  const width = wizardRegionCanvas.width;
  const height = wizardRegionCanvas.height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw background image if available, otherwise draw gradient
  if (wizardState.backgroundImage) {
    ctx.drawImage(wizardState.backgroundImage, 0, 0, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Convert region to pixels
  const toPixel = (point) => ({
    x: (point.x / 100) * width,
    y: (point.y / 100) * height
  });

  const tl = toPixel(wizardState.wizardRegion.topLeft);
  const tr = toPixel(wizardState.wizardRegion.topRight);
  const bl = toPixel(wizardState.wizardRegion.bottomLeft);
  const br = toPixel(wizardState.wizardRegion.bottomRight);

  // Draw filled region with semi-transparent overlay
  ctx.fillStyle = 'rgba(14, 165, 233, 0.2)';
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill();

  // Draw outline
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw corner handles
  const corners = [tl, tr, bl, br];
  for (const corner of corners) {
    // White border
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 10, 0, Math.PI * 2);
    ctx.fill();

    // Blue fill
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Get which corner of the wizard region is at a point
function getWizardCornerAtPoint(x, y) {
  if (!wizardState.wizardRegion || !wizardRegionCanvas) return null;

  const width = wizardRegionCanvas.width;
  const height = wizardRegionCanvas.height;
  const threshold = 15;

  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

  for (const corner of corners) {
    const px = (wizardState.wizardRegion[corner].x / 100) * width;
    const py = (wizardState.wizardRegion[corner].y / 100) * height;
    const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
    if (dist <= threshold) {
      return corner;
    }
  }

  return null;
}

// Handle wizard canvas mouse down
function handleWizardCanvasMouseDown(e) {
  const rect = wizardRegionCanvas.getBoundingClientRect();
  const scaleX = wizardRegionCanvas.width / rect.width;
  const scaleY = wizardRegionCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const corner = getWizardCornerAtPoint(x, y);
  if (corner) {
    wizardState.wizardDraggingCorner = corner;
  }
}

// Handle wizard canvas mouse move
function handleWizardCanvasMouseMove(e) {
  if (!wizardState.wizardDraggingCorner || !wizardState.wizardRegion) return;

  const rect = wizardRegionCanvas.getBoundingClientRect();
  const scaleX = wizardRegionCanvas.width / rect.width;
  const scaleY = wizardRegionCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // Convert to percentage
  const px = Math.max(0, Math.min(100, (x / wizardRegionCanvas.width) * 100));
  const py = Math.max(0, Math.min(100, (y / wizardRegionCanvas.height) * 100));

  wizardState.wizardRegion[wizardState.wizardDraggingCorner] = { x: px, y: py };
  drawWizardRegion();
}

// Handle wizard canvas mouse up
function handleWizardCanvasMouseUp() {
  wizardState.wizardDraggingCorner = null;
}

// Handle wizard next button
async function handleWizardNext() {
  if (wizardState.currentStep === 1) {
    // Skip countdown, move to step 2
    if (wizardState.countdownInterval) {
      clearInterval(wizardState.countdownInterval);
      wizardState.countdownInterval = null;
    }
    updateWizardStep(2);
    runProcessingTasks();
  } else if (wizardState.currentStep === 2) {
    // Shouldn't happen normally (button is disabled during processing)
    // but advance anyway if clicked
    updateWizardStep(3);
    initWizardRegionCanvas();
  } else if (wizardState.currentStep === 3) {
    // Move to confirm step
    updateWizardStep(4);
    populateConfirmStep();
  } else if (wizardState.currentStep === 4) {
    // Apply settings and close
    await applyWizardSettings();
  }
}

// Populate the confirm step with benchmark results
function populateConfirmStep() {
  // Set the preset selector to the recommended value
  if (wizardPresetSelect && wizardState.benchmarkResults?.recommendedPreset) {
    wizardPresetSelect.value = wizardState.benchmarkResults.recommendedPreset;
  }

  // Show benchmark results
  if (wizardBenchmarkResults) {
    if (wizardState.benchmarkResults?.success) {
      const results = wizardState.benchmarkResults;
      wizardBenchmarkResults.innerHTML = `
        <div class="benchmark-stat">
          <span>Average time:</span>
          <span>${results.avgTime}ms</span>
        </div>
        <div class="benchmark-stat">
          <span>Min / Max:</span>
          <span>${results.minTime}ms / ${results.maxTime}ms</span>
        </div>
        <div class="benchmark-stat">
          <span>Estimated FPS:</span>
          <span>${results.fps} fps</span>
        </div>
      `;
    } else {
      wizardBenchmarkResults.innerHTML = `
        <p class="wizard-hint">Benchmark skipped or failed. Using default preset.</p>
      `;
    }
  }

  // Update region status
  if (wizardRegionStatus) {
    wizardRegionStatus.textContent = '✓ Ready';
  }
}

// Apply wizard settings and save
async function applyWizardSettings() {
  // Get selected preset
  const selectedPreset = wizardPresetSelect?.value || wizardState.benchmarkResults?.recommendedPreset || 'balanced';

  // Save wizard setup data
  const setupData = {
    completedAt: Date.now(),
    region: wizardState.wizardRegion,
    referenceFrame: wizardState.capturedFrame?.frameDataUrl || null,
    benchmarkResults: wizardState.benchmarkResults,
    selectedPreset
  };

  await chrome.storage.local.set({ wizardSetupData: setupData });

  // Update wall art settings with recommended preset
  wallArtSettings.segmentationPreset = selectedPreset;
  wallArtSettings.segmentationEnabled = true;
  await saveWallArt();

  // Update preset dropdown in main UI
  if (segmentationPreset) {
    segmentationPreset.value = selectedPreset;
  }
  if (segmentationEnabled) {
    segmentationEnabled.checked = true;
    if (segmentationOptions) {
      segmentationOptions.classList.remove('hidden');
    }
  }

  // Create or update wall art region if none exists
  if (wallArtOverlays.length === 0) {
    const newWallArt = {
      id: `wall-art-${generateId()}`,
      type: TYPE_WALL_ART,
      name: 'Wall Art Region',
      region: wizardState.wizardRegion,
      paint: null,
      art: null,
      active: false, // Start inactive until user adds content
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    wallArtOverlays.push(newWallArt);
    await saveWallArt();
    renderWallArtList();
  }

  // Update wizard status display
  updateWizardStatusDisplay(true);

  // Close wizard
  closeWizard();

  // Show success message
  showStatus('Setup wizard complete! Wall art is ready to use.', 'success');
}

// Initialize wizard when page loads
initWizard();

// ==================== END SETUP WIZARD FUNCTIONS ====================

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
    } else if (wizardModal && !wizardModal.classList.contains('hidden')) {
      closeWizard();
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
