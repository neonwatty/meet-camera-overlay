/**
 * Virtual Background Status Component
 *
 * Shows the status of virtual background detection and provides
 * controls to simulate virtual background state in the dev environment.
 */

// Module-level state
let _processor = null; // Reserved for future use
let wallArtApi = null;
let simulatedVBEnabled = false;
let simulatedVBType = 'none';
let onStatusChangeCallback = null;

/**
 * Initialize the Virtual Background Status component.
 *
 * @param {Object} videoProcessor - DevVideoProcessor instance
 * @param {Object} api - Wall art API
 * @param {Object} options
 * @param {function(Object): void} [options.onStatusChange] - Callback when VB status changes
 */
export function initVirtualBackgroundStatus(videoProcessor, api, options = {}) {
  _processor = videoProcessor;
  wallArtApi = api;
  onStatusChangeCallback = options.onStatusChange || null;

  const container = document.querySelector('#virtual-background-status .vb-status-content');
  if (!container) {
    console.warn('[VirtualBackgroundStatus] Container not found');
    return;
  }

  container.innerHTML = `
    <div class="vb-current-status">
      <div class="status-indicator">
        <span class="status-dot" id="vb-status-dot"></span>
        <span class="status-text" id="vb-status-text">Not detected</span>
      </div>
    </div>

    <div class="vb-simulation">
      <h4>Simulate Virtual Background</h4>
      <p class="hint">Test how wall art responds to Meet's virtual background</p>

      <div class="form-group">
        <label>
          <input type="checkbox" id="vb-simulate-toggle">
          Simulate Virtual Background Enabled
        </label>
      </div>

      <div class="form-group" id="vb-type-group">
        <label for="vb-type-select">Type</label>
        <select id="vb-type-select" disabled>
          <option value="blur">Blur</option>
          <option value="image">Background Image</option>
        </select>
      </div>
    </div>

    <div class="vb-warning" id="vb-warning" style="display: none;">
      <div class="warning-icon">⚠️</div>
      <div class="warning-content">
        <strong>Virtual Background Detected</strong>
        <p>Wall Art has been disabled because Google Meet's virtual background is active.
           Wall Art works best with your real background visible.</p>
        <p class="warning-hint">Disable Meet's virtual background to use Wall Art.</p>
      </div>
    </div>
  `;

  setupEventListeners();
  updateStatusDisplay();
}

/**
 * Set up event listeners.
 */
function setupEventListeners() {
  // Simulate toggle
  const simulateToggle = document.getElementById('vb-simulate-toggle');
  simulateToggle?.addEventListener('change', (e) => {
    simulatedVBEnabled = e.target.checked;
    const typeSelect = document.getElementById('vb-type-select');
    if (typeSelect) {
      typeSelect.disabled = !simulatedVBEnabled;
    }
    updateStatusDisplay();
    notifyStatusChange();
  });

  // Type select
  const typeSelect = document.getElementById('vb-type-select');
  typeSelect?.addEventListener('change', (e) => {
    simulatedVBType = e.target.value;
    updateStatusDisplay();
    notifyStatusChange();
  });
}

/**
 * Update the status display.
 */
function updateStatusDisplay() {
  const statusDot = document.getElementById('vb-status-dot');
  const statusText = document.getElementById('vb-status-text');
  const warning = document.getElementById('vb-warning');

  if (simulatedVBEnabled) {
    statusDot?.classList.add('active');
    statusDot?.classList.remove('inactive');
    if (statusText) {
      statusText.textContent = `Active (${simulatedVBType})`;
      statusText.classList.add('warning');
    }
    if (warning) warning.style.display = 'block';
  } else {
    statusDot?.classList.remove('active');
    statusDot?.classList.add('inactive');
    if (statusText) {
      statusText.textContent = 'Not detected';
      statusText.classList.remove('warning');
    }
    if (warning) warning.style.display = 'none';
  }
}

/**
 * Notify listeners of status change.
 */
function notifyStatusChange() {
  const status = getVirtualBackgroundStatus();

  // Disable/enable wall art regions based on status
  if (wallArtApi) {
    const regions = wallArtApi.getWallArtRegions() || [];
    let changed = false;

    for (const region of regions) {
      const shouldBeActive = !status.enabled;
      if (region.active !== shouldBeActive && region._wasActiveBeforeVB === undefined) {
        // Store original state before disabling
        if (status.enabled) {
          region._wasActiveBeforeVB = region.active;
          region.active = false;
          changed = true;
        }
      } else if (!status.enabled && region._wasActiveBeforeVB !== undefined) {
        // Restore original state when VB is disabled
        region.active = region._wasActiveBeforeVB;
        delete region._wasActiveBeforeVB;
        changed = true;
      }
    }

    if (changed) {
      wallArtApi.setWallArtRegions(regions);
    }
  }

  if (onStatusChangeCallback) {
    onStatusChangeCallback(status);
  }
}

/**
 * Get current virtual background status.
 * @returns {Object} Status object
 */
export function getVirtualBackgroundStatus() {
  return {
    enabled: simulatedVBEnabled,
    type: simulatedVBEnabled ? simulatedVBType : 'none',
    simulated: true,
    reason: simulatedVBEnabled ? 'Simulated in dev environment' : null
  };
}

/**
 * Check if wall art should be disabled due to virtual background.
 * @returns {boolean}
 */
export function shouldDisableWallArt() {
  return simulatedVBEnabled;
}

/**
 * Programmatically set simulated VB status (for testing).
 * @param {boolean} enabled
 * @param {string} type
 */
export function setSimulatedStatus(enabled, type = 'blur') {
  simulatedVBEnabled = enabled;
  simulatedVBType = type;

  const simulateToggle = document.getElementById('vb-simulate-toggle');
  const typeSelect = document.getElementById('vb-type-select');

  if (simulateToggle) simulateToggle.checked = enabled;
  if (typeSelect) {
    typeSelect.disabled = !enabled;
    typeSelect.value = type;
  }

  updateStatusDisplay();
  notifyStatusChange();
}
