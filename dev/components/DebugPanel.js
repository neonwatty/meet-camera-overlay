/**
 * Debug Panel Component
 * Shows FPS counter, timing metrics, and debug toggles.
 */

let processor = null;
let fpsElement = null;
let renderTimeElement = null;
let segmentTimeElement = null;
let segmentStatusElement = null;

/**
 * Initialize the debug panel.
 * @param {DevVideoProcessor} videoProcessor - The video processor instance
 */
export function initDebugPanel(videoProcessor) {
  processor = videoProcessor;

  const panel = document.querySelector('#debug-panel .debug-content');
  if (!panel) return;

  // Get available presets for dropdown
  const presets = processor.getSegmentationPresets();
  const presetOptions = Object.entries(presets)
    .map(([key, preset]) => `<option value="${key}">${preset.name}</option>`)
    .join('');

  panel.innerHTML = `
    <div class="debug-controls">
      <label>
        <input type="checkbox" id="debug-show-fps" checked>
        Show FPS Counter
      </label>
      <label>
        <input type="checkbox" id="debug-show-mask">
        Show Segmentation Mask
      </label>
      <label>
        <input type="checkbox" id="debug-show-coords">
        Show Coordinates
      </label>
    </div>

    <div class="debug-section">
      <h4>Segmentation</h4>
      <div class="segmentation-controls">
        <button id="segmentation-toggle" class="btn btn-small btn-primary">Enable Segmentation</button>
        <select id="segmentation-preset" class="select-small">
          ${presetOptions}
        </select>
      </div>
      <div class="segmentation-status" id="segmentation-status">
        <span class="status-indicator off"></span>
        <span class="status-text">Disabled</span>
      </div>
    </div>

    <div class="debug-metrics">
      <div class="metric">
        <span class="metric-label">FPS</span>
        <span class="metric-value" id="metric-fps">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Render</span>
        <span class="metric-value" id="metric-render">0ms</span>
      </div>
      <div class="metric">
        <span class="metric-label">Segment</span>
        <span class="metric-value" id="metric-segment">-</span>
      </div>
      <div class="metric">
        <span class="metric-label">Resolution</span>
        <span class="metric-value" id="metric-resolution">-</span>
      </div>
      <div class="metric">
        <span class="metric-label">Overlays</span>
        <span class="metric-value" id="metric-overlays">0</span>
      </div>
    </div>
  `;

  // Add segmentation styles
  const style = document.createElement('style');
  style.textContent = `
    .debug-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #333;
    }
    .debug-section h4 {
      margin: 0 0 8px 0;
      font-size: 12px;
      color: #e94560;
      text-transform: uppercase;
    }
    .segmentation-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .select-small {
      padding: 4px 8px;
      font-size: 11px;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 4px;
      color: #e0e0e0;
    }
    .segmentation-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }
    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-indicator.off { background: #666; }
    .status-indicator.loading { background: #ff9900; animation: pulse 1s infinite; }
    .status-indicator.active { background: #00ff00; }
    .status-indicator.error { background: #ff0000; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);

  // Get metric elements
  fpsElement = document.getElementById('metric-fps');
  renderTimeElement = document.getElementById('metric-render');
  segmentTimeElement = document.getElementById('metric-segment');
  segmentStatusElement = document.getElementById('segmentation-status');

  // Set up debug toggles
  document.getElementById('debug-show-fps').addEventListener('change', (e) => {
    processor.setDebugOptions({ showFps: e.target.checked });
  });

  document.getElementById('debug-show-mask').addEventListener('change', (e) => {
    processor.setDebugOptions({ showMask: e.target.checked });
  });

  document.getElementById('debug-show-coords').addEventListener('change', (e) => {
    processor.setDebugOptions({ showCoords: e.target.checked });
  });

  // Segmentation toggle
  const segToggle = document.getElementById('segmentation-toggle');
  const segPreset = document.getElementById('segmentation-preset');

  segToggle.addEventListener('click', async () => {
    if (processor.isSegmentationActive()) {
      processor.disableSegmentation();
      segToggle.textContent = 'Enable Segmentation';
      segToggle.classList.remove('btn-secondary');
      segToggle.classList.add('btn-primary');
      updateSegmentationStatus({ enabled: false });
    } else {
      segToggle.textContent = 'Loading...';
      segToggle.disabled = true;
      updateSegmentationStatus({ enabled: true, initializing: true });

      const success = await processor.enableSegmentation(segPreset.value);

      segToggle.disabled = false;
      if (success) {
        segToggle.textContent = 'Disable Segmentation';
        segToggle.classList.remove('btn-primary');
        segToggle.classList.add('btn-secondary');
        updateSegmentationStatus({ enabled: true, initialized: true });
      } else {
        segToggle.textContent = 'Enable Segmentation';
        updateSegmentationStatus({ enabled: false, error: true });
      }
    }
  });

  segPreset.addEventListener('change', () => {
    processor.setSegmentationPreset(segPreset.value);
  });

  // Set up debug update callback
  processor.onDebugUpdate = (data) => {
    updateMetrics(data);
  };

  // Update resolution periodically
  setInterval(() => {
    const dims = processor.getDimensions();
    if (dims.width > 0) {
      document.getElementById('metric-resolution').textContent = `${dims.width}x${dims.height}`;
    }

    // Update overlay count
    const overlayCount = processor.overlays?.length || 0;
    document.getElementById('metric-overlays').textContent = overlayCount;
  }, 1000);
}

/**
 * Update debug metrics display.
 * @param {Object} data - Debug data from processor
 */
function updateMetrics(data) {
  if (data.fps !== undefined && fpsElement) {
    fpsElement.textContent = data.fps;
    fpsElement.classList.toggle('warning', data.fps < 24);
  }

  if (data.renderTime !== undefined && renderTimeElement) {
    renderTimeElement.textContent = `${data.renderTime.toFixed(1)}ms`;
    renderTimeElement.classList.toggle('warning', data.renderTime > 16);
  }

  if (data.segmentTime !== undefined && segmentTimeElement) {
    if (data.segmentTime > 0) {
      segmentTimeElement.textContent = `${data.segmentTime.toFixed(1)}ms`;
      segmentTimeElement.classList.toggle('warning', data.segmentTime > 50);
    } else {
      segmentTimeElement.textContent = '-';
    }
  }

  if (data.segmentationStatus) {
    updateSegmentationStatus(data.segmentationStatus);
  }
}

/**
 * Update the segmentation status indicator.
 * @param {Object} status - Segmentation status
 */
function updateSegmentationStatus(status) {
  if (!segmentStatusElement) return;

  const indicator = segmentStatusElement.querySelector('.status-indicator');
  const text = segmentStatusElement.querySelector('.status-text');

  indicator.className = 'status-indicator';

  if (status.error) {
    indicator.classList.add('error');
    text.textContent = 'Error loading model';
  } else if (status.initializing) {
    indicator.classList.add('loading');
    text.textContent = 'Loading model...';
  } else if (status.initialized) {
    indicator.classList.add('active');
    text.textContent = `Active (${status.preset || 'balanced'})`;
  } else if (status.enabled) {
    indicator.classList.add('loading');
    text.textContent = 'Initializing...';
  } else {
    indicator.classList.add('off');
    text.textContent = 'Disabled';
  }
}
