/**
 * Mock Popup Component
 * Minimal overlay management UI for dev environment.
 */

import { createOverlay, createTextBanner, createTimer } from '../../lib/overlay-utils.js';

let api = null;

/**
 * Initialize the mock popup panel.
 * @param {Object} popupApi - API for managing overlays
 */
export function initMockPopup(popupApi) {
  api = popupApi;

  const panel = document.querySelector('#mock-popup .popup-content');
  if (!panel) return;

  panel.innerHTML = `
    <div class="popup-actions">
      <button id="add-image-btn" class="btn btn-primary btn-small">+ Image</button>
      <button id="add-text-btn" class="btn btn-secondary btn-small">+ Text</button>
      <button id="add-timer-btn" class="btn btn-secondary btn-small">+ Timer</button>
    </div>

    <div id="overlay-list" class="overlay-list">
      <div class="empty-state">No overlays yet</div>
    </div>

    <!-- Add Image Modal -->
    <div id="add-image-modal" class="modal hidden">
      <div class="modal-content">
        <h4>Add Image Overlay</h4>
        <input type="text" id="image-url-input" placeholder="Image URL..." class="input">
        <div class="modal-hint">Or paste a data URL</div>
        <div class="modal-actions">
          <button id="add-image-cancel" class="btn btn-secondary btn-small">Cancel</button>
          <button id="add-image-confirm" class="btn btn-primary btn-small">Add</button>
        </div>
      </div>
    </div>
  `;

  // Add modal styles inline (simple approach for dev env)
  const style = document.createElement('style');
  style.textContent = `
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .modal.hidden { display: none; }
    .modal-content {
      background: #16213e;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;
    }
    .modal-content h4 {
      margin-bottom: 12px;
      color: #e94560;
    }
    .modal-content .input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #0f3460;
      border-radius: 4px;
      background: #1a1a2e;
      color: #e0e0e0;
      margin-bottom: 8px;
    }
    .modal-hint {
      font-size: 11px;
      color: #666;
      margin-bottom: 12px;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;
  document.head.appendChild(style);

  // Set up event handlers
  setupEventHandlers();

  // Render initial overlay list
  renderOverlayList();
}

/**
 * Set up event handlers for popup controls.
 */
function setupEventHandlers() {
  // Add Image button
  document.getElementById('add-image-btn').addEventListener('click', () => {
    document.getElementById('add-image-modal').classList.remove('hidden');
    document.getElementById('image-url-input').value = '';
    document.getElementById('image-url-input').focus();
  });

  // Add Image modal handlers
  document.getElementById('add-image-cancel').addEventListener('click', () => {
    document.getElementById('add-image-modal').classList.add('hidden');
  });

  document.getElementById('add-image-confirm').addEventListener('click', async () => {
    const url = document.getElementById('image-url-input').value.trim();
    if (!url) return;

    await addImageOverlay(url);
    document.getElementById('add-image-modal').classList.add('hidden');
  });

  // Add Text button
  document.getElementById('add-text-btn').addEventListener('click', async () => {
    await addTextOverlay();
  });

  // Add Timer button
  document.getElementById('add-timer-btn').addEventListener('click', async () => {
    await addTimerOverlay();
  });
}

/**
 * Add an image overlay.
 */
async function addImageOverlay(url) {
  const overlays = api.getOverlays();

  const overlay = createOverlay(url, 'Image');

  overlays.push(overlay);
  await api.setOverlays(overlays);

  // Load the image
  try {
    await api.loadImage(overlay.id, url);
  } catch (e) {
    console.warn('[MockPopup] Failed to load image:', e);
  }

  renderOverlayList();
}

/**
 * Add a text banner overlay.
 */
async function addTextOverlay() {
  const overlays = api.getOverlays();

  const overlay = createTextBanner('Sample Text', 'Text Banner');

  overlays.push(overlay);
  await api.setOverlays(overlays);

  renderOverlayList();
}

/**
 * Add a timer overlay.
 */
async function addTimerOverlay() {
  const overlays = api.getOverlays();

  const overlay = createTimer(300, 'Timer');

  overlays.push(overlay);
  await api.setOverlays(overlays);

  renderOverlayList();
}

/**
 * Render the overlay list.
 */
function renderOverlayList() {
  const list = document.getElementById('overlay-list');
  if (!list) return;

  const overlays = api.getOverlays();

  if (overlays.length === 0) {
    list.innerHTML = '<div class="empty-state">No overlays yet</div>';
    return;
  }

  list.innerHTML = overlays.map(overlay => createOverlayItemHTML(overlay)).join('');

  // Attach event handlers
  overlays.forEach(overlay => {
    attachOverlayItemHandlers(overlay);
  });
}

/**
 * Create HTML for an overlay item.
 */
function createOverlayItemHTML(overlay) {
  const typeIcon = getTypeIcon(overlay.type);
  const thumbnail = getThumbnail(overlay);
  const activeClass = overlay.active ? 'active' : '';

  return `
    <div class="overlay-item ${activeClass}" data-id="${overlay.id}">
      <div class="thumbnail">${thumbnail}</div>
      <div class="info">
        <div class="name">${typeIcon} ${overlay.name || 'Overlay'}</div>
        <div class="details">${overlay.type} - ${Math.round(overlay.opacity * 100)}%</div>
      </div>
      <div class="controls">
        ${overlay.type === 'textBanner' || overlay.type === 'timer' || overlay.type === 'effect'
          ? `<button class="btn btn-small toggle-btn" data-id="${overlay.id}">${overlay.active ? 'ON' : 'OFF'}</button>`
          : ''
        }
        <button class="btn btn-small btn-secondary delete-btn" data-id="${overlay.id}">X</button>
      </div>
    </div>
    <div class="opacity-control" data-id="${overlay.id}">
      <label>Opacity:</label>
      <input type="range" min="0" max="100" value="${Math.round(overlay.opacity * 100)}" class="opacity-slider" data-id="${overlay.id}">
      <span class="opacity-value">${Math.round(overlay.opacity * 100)}%</span>
    </div>
  `;
}

/**
 * Get icon for overlay type.
 */
function getTypeIcon(type) {
  switch (type) {
    case 'effect': return '⚡';
    case 'textBanner': return '📝';
    case 'timer': return '⏱';
    default: return '🖼';
  }
}

/**
 * Get thumbnail HTML for overlay.
 */
function getThumbnail(overlay) {
  if (overlay.type === 'textBanner') {
    return '<span style="font-size: 20px;">📝</span>';
  }
  if (overlay.type === 'timer') {
    return '<span style="font-size: 20px;">⏱</span>';
  }
  if (overlay.src && (overlay.src.startsWith('data:') || overlay.src.startsWith('http'))) {
    return `<img src="${overlay.src}" alt="">`;
  }
  return '<span style="font-size: 20px;">🖼</span>';
}

/**
 * Attach event handlers to an overlay item.
 */
function attachOverlayItemHandlers(overlay) {
  // Delete button
  const deleteBtn = document.querySelector(`.delete-btn[data-id="${overlay.id}"]`);
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const overlays = api.getOverlays().filter(o => o.id !== overlay.id);
      await api.setOverlays(overlays);
      api.removeImage(overlay.id);
      renderOverlayList();
    });
  }

  // Toggle button (for effects, text, timers)
  const toggleBtn = document.querySelector(`.toggle-btn[data-id="${overlay.id}"]`);
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      const overlays = api.getOverlays();
      const idx = overlays.findIndex(o => o.id === overlay.id);
      if (idx !== -1) {
        overlays[idx].active = !overlays[idx].active;

        // For timers, handle start time
        if (overlays[idx].type === 'timer' && overlays[idx].timerState) {
          if (overlays[idx].active && !overlays[idx].timerState.running) {
            overlays[idx].timerState.running = true;
            overlays[idx].timerState.startTime = Date.now();
          }
        }

        await api.setOverlays(overlays);
        renderOverlayList();
      }
    });
  }

  // Opacity slider
  const opacitySlider = document.querySelector(`.opacity-slider[data-id="${overlay.id}"]`);
  if (opacitySlider) {
    opacitySlider.addEventListener('input', async (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      const overlays = api.getOverlays();
      const idx = overlays.findIndex(o => o.id === overlay.id);
      if (idx !== -1) {
        overlays[idx].opacity = value;
        await api.setOverlays(overlays);

        // Update display
        const valueDisplay = e.target.parentElement.querySelector('.opacity-value');
        if (valueDisplay) {
          valueDisplay.textContent = `${e.target.value}%`;
        }
      }
    });
  }
}
