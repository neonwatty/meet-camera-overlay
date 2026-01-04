// Popup script for Meet Camera Overlay (no camera preview needed)

// Constants for overlay categories and layers
const CATEGORY_USER = 'user';
const CATEGORY_BUNDLED = 'bundled';
const LAYER_FOREGROUND = 'foreground';
const LAYER_BACKGROUND = 'background';

let overlays = [];
let dragState = null;
let addingType = 'standard'; // 'standard' or 'effect'

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
    migrated.layer = migrated.type === 'effect' ? LAYER_BACKGROUND : LAYER_FOREGROUND;
  }

  // Add zIndex if missing
  if (migrated.zIndex === undefined) {
    migrated.zIndex = 0;
  }

  // Add createdAt if missing
  if (!migrated.createdAt) {
    migrated.createdAt = Date.now();
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

// Create an overlay item element
function createOverlayItem(overlay) {
  const index = overlays.findIndex(o => o.id === overlay.id);
  const opacity = overlay.opacity !== undefined ? overlay.opacity : 1;
  const isEffect = overlay.type === 'effect';
  const isActive = overlay.active === true;
  const layer = overlay.layer || LAYER_FOREGROUND;
  const category = overlay.category || CATEGORY_USER;

  const item = document.createElement('div');
  item.className = 'overlay-item' + (isEffect ? ' effect-item' : '') + (isActive ? ' active' : '');
  item.dataset.id = overlay.id;
  item.dataset.layer = layer;
  item.dataset.category = category;
  item.draggable = true;

  // Build trigger button HTML for effects
  const triggerBtn = isEffect ?
    `<button class="trigger-btn ${isActive ? 'active' : ''}" data-index="${index}" data-id="${overlay.id}" title="${isActive ? 'Deactivate' : 'Activate'}">
      ${isActive ? '⚡ ON' : '⚡ OFF'}
    </button>` : '';

  // Build position info - only show for standard overlays (effects are full-screen)
  const positionInfo = isEffect ?
    '<div class="position">Full screen effect</div>' :
    `<div class="position">Position: ${Math.round(overlay.x)}%, ${Math.round(overlay.y)}%</div>`;

  // Layer toggle buttons
  const layerToggle = `
    <div class="layer-toggle" data-id="${overlay.id}">
      <button class="layer-btn ${layer === LAYER_BACKGROUND ? 'active' : ''}" data-layer="${LAYER_BACKGROUND}" title="Behind you">Back</button>
      <button class="layer-btn ${layer === LAYER_FOREGROUND ? 'active' : ''}" data-layer="${LAYER_FOREGROUND}" title="In front of you">Front</button>
    </div>
  `;

  item.innerHTML = `
    <div class="drag-handle" title="Drag to reorder">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <img class="thumb" src="${overlay.src}" alt="">
    <div class="info">
      <div class="name">${isEffect ? '⚡ ' : ''}${overlay.name}</div>
      ${positionInfo}
      <div class="controls-row">
        <div class="opacity-control">
          <label>Opacity:</label>
          <input type="range" class="opacity-slider" data-index="${index}" min="0" max="100" value="${Math.round(opacity * 100)}">
          <span class="opacity-value">${Math.round(opacity * 100)}%</span>
        </div>
        ${layerToggle}
      </div>
    </div>
    ${triggerBtn}
    <button class="duplicate-btn" data-id="${overlay.id}" title="Duplicate">⧉</button>
    <button class="delete-btn" data-index="${index}" title="Remove">×</button>
  `;

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
  // Opacity slider handlers
  listElement.querySelectorAll('.opacity-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      const value = parseInt(e.target.value);
      overlays[index].opacity = value / 100;
      e.target.nextElementSibling.textContent = value + '%';
      renderPreviewOverlays();
    });

    slider.addEventListener('change', async () => {
      await saveOverlays();
    });
  });

  // Delete handlers
  listElement.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      overlays.splice(index, 1);
      await saveOverlays();
      renderOverlayList();
      renderPreviewOverlays();
      showStatus('Overlay removed', 'success');
    });
  });

  // Trigger button handlers for effects
  listElement.querySelectorAll('.trigger-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      const id = e.target.dataset.id;
      const overlay = overlays[index];

      if (overlay && overlay.type === 'effect') {
        const newActive = !overlay.active;
        overlay.active = newActive;

        // Update local state
        await saveOverlays();
        renderOverlayList();
        renderPreviewOverlays();

        // Send toggle message to content script
        const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_EFFECT',
            id: id,
            active: newActive
          }).catch(() => {});
        }

        showStatus(newActive ? 'Effect activated!' : 'Effect deactivated', 'success');
      }
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

    // Delete handle
    const deleteHandle = document.createElement('div');
    deleteHandle.className = 'delete-handle';
    deleteHandle.textContent = '×';
    deleteHandle.addEventListener('click', async (e) => {
      e.stopPropagation();
      overlays.splice(index, 1);
      await saveOverlays();
      renderOverlayList();
      renderPreviewOverlays();
      showStatus('Overlay removed', 'success');
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

  // Set drag data
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);

  // Delay to allow the dragging class to apply
  setTimeout(() => {
    this.style.opacity = '0.5';
  }, 0);
}

function handleDragEnd(_e) {
  this.classList.remove('dragging');
  this.style.opacity = '';
  draggedItem = null;
  draggedOverlayId = null;

  // Remove drag-over from all items in both lists
  [userOverlayList, bundledOverlayList].forEach(listElement => {
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
