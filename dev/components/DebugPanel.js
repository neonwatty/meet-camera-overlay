/**
 * Debug Panel Component
 * Shows FPS counter, timing metrics, and debug toggles.
 */

let processor = null;
let fpsElement = null;
let renderTimeElement = null;

/**
 * Initialize the debug panel.
 * @param {DevVideoProcessor} videoProcessor - The video processor instance
 */
export function initDebugPanel(videoProcessor) {
  processor = videoProcessor;

  const panel = document.querySelector('#debug-panel .debug-content');
  if (!panel) return;

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
        <span class="metric-label">Resolution</span>
        <span class="metric-value" id="metric-resolution">-</span>
      </div>
      <div class="metric">
        <span class="metric-label">Overlays</span>
        <span class="metric-value" id="metric-overlays">0</span>
      </div>
    </div>
  `;

  // Get metric elements
  fpsElement = document.getElementById('metric-fps');
  renderTimeElement = document.getElementById('metric-render');

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
}
