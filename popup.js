// Popup script for Meet Camera Overlay (no camera preview needed)

let overlays = [];
let dragState = null;

// DOM elements
const overlayContainer = document.getElementById('overlay-container');
const overlayList = document.getElementById('overlay-list');
const emptyState = document.getElementById('empty-state');
const addOverlayBtn = document.getElementById('add-overlay');
const addModal = document.getElementById('add-modal');
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

  const overlay = {
    id: generateId(),
    src: src,
    x: 5, // percentage from left
    y: 25, // percentage from top
    width: 20,
    height: 35,
    name: getImageName(src)
  };

  overlays.push(overlay);
  await saveOverlays();
  renderOverlayList();
  renderPreviewOverlays();
  addModal.classList.add('hidden');
  showStatus('Overlay added! Open Google Meet to see it.', 'success');
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
function getImageName(src) {
  if (src.startsWith('data:')) {
    return 'Uploaded Image';
  }
  try {
    const url = new URL(src);
    const path = url.pathname;
    const filename = path.split('/').pop();
    return filename || 'Image';
  } catch {
    return 'Image';
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
    const item = document.createElement('div');
    item.className = 'overlay-item';
    item.innerHTML = `
      <img class="thumb" src="${overlay.src}" alt="">
      <div class="info">
        <div class="name">${overlay.name}</div>
        <div class="position">Position: ${Math.round(overlay.x)}%, ${Math.round(overlay.y)}%</div>
      </div>
      <button class="delete-btn" data-index="${index}" title="Remove">×</button>
    `;
    overlayList.appendChild(item);
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
}

// Render overlays on preview
function renderPreviewOverlays() {
  overlayContainer.innerHTML = '';

  overlays.forEach((overlay, index) => {
    const div = document.createElement('div');
    div.className = 'overlay-preview';
    div.dataset.index = index;
    div.style.left = overlay.x + '%';
    div.style.top = overlay.y + '%';
    div.style.width = overlay.width + '%';
    div.style.height = overlay.height + '%';

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
