// Popup script for Meet Camera Overlay (no camera preview needed)

let overlays = [];
let dragState = null;
let addingType = 'standard'; // 'standard' or 'effect'

// DOM elements
const overlayContainer = document.getElementById('overlay-container');
const overlayList = document.getElementById('overlay-list');
const emptyState = document.getElementById('empty-state');
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

// Load overlays from storage
async function loadOverlays() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['overlays'], (result) => {
      overlays = result.overlays || [];
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
  } catch (err) {
    showStatus('Could not load image. Check the URL.', 'error');
    return;
  }

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
      name: getImageName(src, true)
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
      name: getImageName(src, false)
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

// Render overlay list
function renderOverlayList() {
  overlayList.innerHTML = '';

  if (overlays.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  overlays.forEach((overlay, index) => {
    const opacity = overlay.opacity !== undefined ? overlay.opacity : 1;
    const isEffect = overlay.type === 'effect';
    const isActive = overlay.active === true;

    const item = document.createElement('div');
    item.className = 'overlay-item' + (isEffect ? ' effect-item' : '') + (isActive ? ' active' : '');

    // Build trigger button HTML for effects
    const triggerBtn = isEffect ?
      `<button class="trigger-btn ${isActive ? 'active' : ''}" data-index="${index}" data-id="${overlay.id}" title="${isActive ? 'Deactivate' : 'Activate'}">
        ${isActive ? '⚡ ON' : '⚡ OFF'}
      </button>` : '';

    // Build position info - only show for standard overlays (effects are full-screen)
    const positionInfo = isEffect ?
      '<div class="position">Full screen effect</div>' :
      `<div class="position">Position: ${Math.round(overlay.x)}%, ${Math.round(overlay.y)}%</div>`;

    item.innerHTML = `
      <img class="thumb" src="${overlay.src}" alt="">
      <div class="info">
        <div class="name">${isEffect ? '⚡ ' : ''}${overlay.name}</div>
        ${positionInfo}
        <div class="opacity-control">
          <label>Opacity:</label>
          <input type="range" class="opacity-slider" data-index="${index}" min="0" max="100" value="${Math.round(opacity * 100)}">
          <span class="opacity-value">${Math.round(opacity * 100)}%</span>
        </div>
      </div>
      ${triggerBtn}
      <button class="delete-btn" data-index="${index}" title="Remove">×</button>
    `;
    overlayList.appendChild(item);
  });

  // Opacity slider handlers
  overlayList.querySelectorAll('.opacity-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      const value = parseInt(e.target.value);
      overlays[index].opacity = value / 100;
      e.target.nextElementSibling.textContent = value + '%';
      renderPreviewOverlays();
    });

    slider.addEventListener('change', async (e) => {
      await saveOverlays();
    });
  });

  // Delete handlers
  overlayList.querySelectorAll('.delete-btn').forEach(btn => {
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
  overlayList.querySelectorAll('.trigger-btn').forEach(btn => {
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

// Init
init();
