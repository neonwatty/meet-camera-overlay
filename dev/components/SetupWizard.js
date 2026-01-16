/**
 * Setup Wizard Component
 *
 * Guides users through the setup process:
 * 1. Step Away - Capture empty background
 * 2. Processing - Compute reference frame and benchmark
 * 3. Draw Regions - User draws wall art regions
 * 4. Confirm - Review and save setup
 */

import { ReferenceFrameCapture, computeWallColors } from '../../lib/reference-frame.js';
import { SetupBenchmark, PERFORMANCE_PRESETS } from '../../lib/setup-benchmark.js';
import { saveSetupData, hasSetupData, clearSetupData, getSetupMetadata } from '../../lib/setup-storage.js';

let processor = null;
let api = null;
let options = {};

// Setup state
let setupState = {
  status: 'idle', // idle, step-away, processing, draw-regions, confirm, complete
  countdown: 5,
  capturedFrames: 0,
  personDetected: false,
  error: null
};

// Processing task status
let processingTasks = {
  medianFrame: false,
  wallColors: false,
  benchmark: false
};

// Captured data
let referenceFrameData = null;
let wallColors = {};
let benchmarkResults = null;
let selectedPreset = 'balanced';

// Instances
let frameCapture = null;
let benchmark = null;
let countdownInterval = null;

/**
 * Initialize the Setup Wizard.
 * @param {Object} videoProcessor - Video processor instance
 * @param {Object} editorApi - API for managing wall art regions
 * @param {Object} [opts] - Options
 * @param {function(Object): void} [opts.onSetupComplete] - Called when setup completes
 * @param {function(string): void} [opts.onError] - Called on error
 */
export function initSetupWizard(videoProcessor, editorApi, opts = {}) {
  processor = videoProcessor;
  api = editorApi;
  options = opts;

  // Create the trigger panel in sidebar
  createTriggerPanel();

  // Create the modal
  createWizardModal();

  // Check for existing setup data
  updateSetupStatus();
}

/**
 * Create the trigger panel in sidebar.
 */
function createTriggerPanel() {
  const container = document.getElementById('setup-wizard-trigger');
  if (!container) {
    console.warn('[SetupWizard] Trigger container not found');
    return;
  }

  const content = container.querySelector('.setup-content');
  if (!content) return;

  content.innerHTML = `
    <button id="start-setup-btn" class="btn btn-primary">Start Setup Wizard</button>
    <button id="recalibrate-btn" class="btn btn-secondary btn-small" style="display: none;">Recalibrate</button>
    <div id="setup-status" class="setup-status">Not configured</div>
  `;

  document.getElementById('start-setup-btn').addEventListener('click', startSetupWizard);
  document.getElementById('recalibrate-btn').addEventListener('click', recalibrate);
}

/**
 * Create the wizard modal or attach listeners if it already exists.
 */
function createWizardModal() {
  let modal = document.getElementById('setup-wizard-modal');

  // If modal exists in HTML, just attach event listeners
  if (modal) {
    const cancelBtn = document.getElementById('wizard-cancel-btn');
    const nextBtn = document.getElementById('wizard-next-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelSetup);
    if (nextBtn) nextBtn.addEventListener('click', nextStep);
    return;
  }

  // Create modal dynamically if it doesn't exist
  modal = document.createElement('div');
  modal.id = 'setup-wizard-modal';
  modal.className = 'wizard-modal hidden';
  modal.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-progress">
        <div class="step" data-step="1">Step Away</div>
        <div class="step" data-step="2">Processing</div>
        <div class="step" data-step="3">Draw Regions</div>
        <div class="step" data-step="4">Confirm</div>
      </div>
      <div class="wizard-content" id="wizard-content"></div>
      <div class="wizard-nav">
        <button id="wizard-cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="wizard-next-btn" class="btn btn-primary">Next</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  document.getElementById('wizard-cancel-btn').addEventListener('click', cancelSetup);
  document.getElementById('wizard-next-btn').addEventListener('click', nextStep);
}

/**
 * Update the setup status display.
 */
async function updateSetupStatus() {
  const statusEl = document.getElementById('setup-status');
  const startBtn = document.getElementById('start-setup-btn');
  const recalBtn = document.getElementById('recalibrate-btn');

  if (!statusEl) return;

  const metadata = await getSetupMetadata();

  if (metadata) {
    const date = new Date(metadata.capturedAt);
    const preset = metadata.selectedPreset || 'balanced';
    statusEl.innerHTML = `
      <span class="status-configured">Configured</span>
      <span class="status-details">
        ${date.toLocaleDateString()} - ${PERFORMANCE_PRESETS[preset]?.name || preset}
      </span>
    `;
    statusEl.classList.add('configured');
    if (startBtn) startBtn.textContent = 'Reconfigure';
    if (recalBtn) recalBtn.style.display = 'inline-block';
  } else {
    statusEl.textContent = 'Not configured';
    statusEl.classList.remove('configured');
    if (startBtn) startBtn.textContent = 'Start Setup Wizard';
    if (recalBtn) recalBtn.style.display = 'none';
  }
}

/**
 * Start the setup wizard.
 */
export function startSetupWizard() {
  // Reset state
  setupState = {
    status: 'step-away',
    countdown: 5,
    capturedFrames: 0,
    personDetected: false,
    error: null
  };
  processingTasks = { medianFrame: false, wallColors: false, benchmark: false };
  referenceFrameData = null;
  wallColors = {};
  benchmarkResults = null;
  selectedPreset = 'balanced';

  // Show modal
  const modal = document.getElementById('setup-wizard-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }

  // Render first step
  updateWizardUI();

  // Start countdown
  startCountdown();
}

/**
 * Cancel and close the wizard.
 */
function cancelSetup() {
  // Stop any ongoing processes
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (frameCapture) {
    frameCapture.stopCapture();
  }
  if (benchmark) {
    benchmark.stop();
  }

  // Reset state
  setupState.status = 'idle';

  // Hide modal
  const modal = document.getElementById('setup-wizard-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Move to the next step.
 */
async function nextStep() {
  switch (setupState.status) {
    case 'step-away':
      // Can't skip countdown
      break;

    case 'processing':
      // Can't skip processing
      break;

    case 'draw-regions':
      setupState.status = 'confirm';
      updateWizardUI();
      break;

    case 'confirm':
      await finalizeSetup();
      break;
  }
}

/**
 * Start the countdown for step-away phase.
 */
function startCountdown() {
  setupState.countdown = 5;
  updateWizardUI();

  countdownInterval = setInterval(() => {
    setupState.countdown--;
    updateWizardUI();

    if (setupState.countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      startFrameCapture();
    }
  }, 1000);
}

/**
 * Start capturing frames.
 */
async function startFrameCapture() {
  frameCapture = new ReferenceFrameCapture({
    frameCount: 30, // 1 second at 30fps (reduced for dev testing)
    onProgress: (progress, count) => {
      setupState.capturedFrames = count;
      updateCaptureProgress(progress);
    },
    onComplete: (data) => {
      referenceFrameData = data;
      startProcessing();
    },
    onPersonDetected: () => {
      setupState.personDetected = true;
      updateWizardUI();
    }
  });

  try {
    // Get segmenter if available (for person detection)
    const segmenter = processor.segmenter;

    await frameCapture.startCapture(processor.video, segmenter);
  } catch (error) {
    console.error('[SetupWizard] Frame capture error:', error);
    setupState.error = error.message;
    updateWizardUI();
  }
}

/**
 * Update capture progress display.
 */
function updateCaptureProgress(progress) {
  const progressFill = document.getElementById('capture-progress-fill');
  const captureStatus = document.getElementById('capture-status');

  if (progressFill) {
    progressFill.style.width = `${progress * 100}%`;
  }
  if (captureStatus) {
    captureStatus.textContent = `Capturing... ${Math.round(progress * 100)}%`;
  }
}

/**
 * Start the processing phase.
 */
async function startProcessing() {
  setupState.status = 'processing';
  updateWizardUI();

  try {
    // Task 1: Reference frame is already computed
    processingTasks.medianFrame = true;
    updateWizardUI();

    // Task 2: Compute wall colors
    const regions = api.getWallArtRegions() || [];
    if (regions.length > 0 && referenceFrameData) {
      wallColors = computeWallColors(referenceFrameData.medianFrame, regions);
    }
    processingTasks.wallColors = true;
    updateWizardUI();

    // Task 3: Run benchmark
    if (processor.segmenter && processor.segmenter.isReady) {
      benchmark = new SetupBenchmark();
      benchmarkResults = await benchmark.runBenchmark(
        processor,
        processor.segmenter,
        10,
        (current, total) => {
          console.log(`[SetupWizard] Benchmark progress: ${current}/${total}`);
        }
      );
      selectedPreset = benchmarkResults.recommendedPreset;
    } else {
      // No segmenter - use default preset
      benchmarkResults = {
        avgSegmentationTime: 0,
        avgRenderTime: 0,
        estimatedFps: 30,
        recommendedPreset: 'balanced',
        isUnderpowered: false,
        warning: null
      };
      selectedPreset = 'balanced';
    }
    processingTasks.benchmark = true;
    updateWizardUI();

    // Move to draw regions step
    setupState.status = 'draw-regions';
    updateWizardUI();

  } catch (error) {
    console.error('[SetupWizard] Processing error:', error);
    setupState.error = error.message;
    updateWizardUI();
  }
}

/**
 * Finalize setup and save data.
 */
async function finalizeSetup() {
  // Get selected preset from radio buttons
  const presetRadio = document.querySelector('input[name="preset"]:checked');
  if (presetRadio) {
    selectedPreset = presetRadio.value;
  }

  try {
    // Save setup data
    await saveSetupData({
      medianFrame: referenceFrameData.medianFrame,
      width: referenceFrameData.width,
      height: referenceFrameData.height,
      capturedAt: referenceFrameData.capturedAt,
      wallColors,
      benchmark: benchmarkResults,
      selectedPreset
    });

    // Apply preset to processor
    if (processor.setSegmentationPreset) {
      processor.setSegmentationPreset(selectedPreset);
    }

    // Mark complete
    setupState.status = 'complete';

    // Close modal
    cancelSetup();

    // Update status display
    updateSetupStatus();

    // Notify callback
    if (options.onSetupComplete) {
      options.onSetupComplete({
        referenceFrameData,
        wallColors,
        benchmark: benchmarkResults,
        selectedPreset
      });
    }

    console.log('[SetupWizard] Setup complete');

  } catch (error) {
    console.error('[SetupWizard] Save error:', error);
    setupState.error = error.message;
    updateWizardUI();
  }
}

/**
 * Recalibrate (clear data and restart wizard).
 */
export async function recalibrate() {
  await clearSetupData();
  await updateSetupStatus();
  startSetupWizard();
}

/**
 * Update the wizard UI based on current state.
 */
function updateWizardUI() {
  const content = document.getElementById('wizard-content');
  const nextBtn = document.getElementById('wizard-next');
  const progress = document.querySelectorAll('.wizard-progress .step');

  if (!content) return;

  // Update progress indicators
  const stepMap = {
    'step-away': 1,
    'processing': 2,
    'draw-regions': 3,
    'confirm': 4
  };
  const currentStep = stepMap[setupState.status] || 1;

  progress.forEach((step, i) => {
    step.classList.remove('active', 'complete');
    if (i + 1 < currentStep) {
      step.classList.add('complete');
    } else if (i + 1 === currentStep) {
      step.classList.add('active');
    }
  });

  // Render step content
  switch (setupState.status) {
    case 'step-away':
      content.innerHTML = renderStepAway();
      if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = 'Please wait...';
      }
      break;

    case 'processing':
      content.innerHTML = renderProcessing();
      if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = 'Processing...';
      }
      break;

    case 'draw-regions':
      content.innerHTML = renderDrawRegions();
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = 'Next';
      }
      break;

    case 'confirm':
      content.innerHTML = renderConfirm();
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = 'Finish';
      }
      // Add preset change listeners
      document.querySelectorAll('input[name="preset"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          selectedPreset = e.target.value;
        });
      });
      break;
  }
}

/**
 * Render Step 1: Step Away content.
 */
function renderStepAway() {
  const isCountingDown = setupState.countdown > 0;

  return `
    <div class="wizard-step step-away">
      <div class="step-icon">${isCountingDown ? '🚶' : '📸'}</div>
      <h2>${isCountingDown ? 'Step Away from Camera' : 'Capturing Background'}</h2>
      <p>${isCountingDown
        ? 'Please step away so we can capture your empty background.'
        : 'Hold still... capturing your background.'}</p>

      ${isCountingDown ? `
        <div class="countdown-display">
          <span class="countdown-number">${setupState.countdown}</span>
          <span class="countdown-label">seconds</span>
        </div>
      ` : `
        <div class="capture-progress">
          <div class="progress-bar">
            <div class="progress-fill" id="capture-progress-fill" style="width: 0%"></div>
          </div>
          <span id="capture-status">Starting capture...</span>
        </div>
      `}

      ${setupState.personDetected ? `
        <div class="warning-message">
          <span class="warning-icon">⚠️</span>
          Person detected in frame - results may be affected
        </div>
      ` : ''}

      ${setupState.error ? `
        <div class="error-message">
          <span class="error-icon">❌</span>
          ${setupState.error}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render Step 2: Processing content.
 */
function renderProcessing() {
  return `
    <div class="wizard-step processing">
      <div class="step-icon">⚙️</div>
      <h2>Processing...</h2>
      <p>Setting up your environment.</p>

      <div class="processing-tasks">
        <div class="task ${processingTasks.medianFrame ? 'complete' : 'pending'}">
          <span class="task-icon">${processingTasks.medianFrame ? '✓' : '○'}</span>
          Building reference frame
        </div>
        <div class="task ${processingTasks.wallColors ? 'complete' : 'pending'}">
          <span class="task-icon">${processingTasks.wallColors ? '✓' : '○'}</span>
          Pre-computing wall colors
        </div>
        <div class="task ${processingTasks.benchmark ? 'complete' : 'pending'}">
          <span class="task-icon">${processingTasks.benchmark ? '✓' : '○'}</span>
          Running performance benchmark
        </div>
      </div>

      <div class="processing-spinner"></div>

      ${setupState.error ? `
        <div class="error-message">
          <span class="error-icon">❌</span>
          ${setupState.error}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render Step 3: Draw Regions content.
 */
function renderDrawRegions() {
  const regions = api.getWallArtRegions() || [];

  return `
    <div class="wizard-step draw-regions">
      <div class="step-icon">✏️</div>
      <h2>Draw Your Wall Art Regions</h2>
      <p>Return to your seat and use the <strong>Wall Art Regions</strong> panel below to draw where you want art placed.</p>

      <div class="hint-box">
        <strong>Tips:</strong>
        <ul>
          <li>Click <strong>"+ Add Region"</strong> to create a new region</li>
          <li>Drag corners to adjust the shape</li>
          <li>Click inside a region to select and move it</li>
        </ul>
      </div>

      <div class="region-count">
        Regions defined: <strong>${regions.length}</strong>
      </div>

      ${regions.length === 0 ? `
        <div class="info-message">
          <span class="info-icon">💡</span>
          Add at least one region to continue, or skip to use existing regions later.
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render Step 4: Confirm content.
 */
function renderConfirm() {
  const bm = benchmarkResults || {
    avgSegmentationTime: 0,
    estimatedFps: 30,
    recommendedPreset: 'balanced',
    isUnderpowered: false,
    warning: null
  };

  return `
    <div class="wizard-step confirm">
      <div class="step-icon">✅</div>
      <h2>Setup Complete!</h2>

      ${bm.isUnderpowered ? `
        <div class="warning-box">
          <span class="warning-icon">⚠️</span>
          <div>
            <strong>Performance Warning</strong>
            <p>${bm.warning}</p>
          </div>
        </div>
      ` : ''}

      <div class="benchmark-results">
        <h3>Performance Results</h3>
        <div class="result-row">
          <span>Segmentation Time:</span>
          <span>${bm.avgSegmentationTime.toFixed(1)}ms</span>
        </div>
        <div class="result-row">
          <span>Estimated FPS:</span>
          <span>${bm.estimatedFps}</span>
        </div>
      </div>

      <div class="preset-selection">
        <h3>Performance Preset</h3>
        <div class="preset-options">
          ${Object.entries(PERFORMANCE_PRESETS).map(([key, preset]) => `
            <label class="preset-option ${key === bm.recommendedPreset ? 'recommended' : ''}">
              <input type="radio" name="preset" value="${key}"
                     ${key === selectedPreset ? 'checked' : ''}>
              <span class="preset-name">${preset.name}</span>
              <span class="preset-desc">${preset.description}</span>
              ${key === bm.recommendedPreset ? '<span class="recommended-badge">Recommended</span>' : ''}
            </label>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Check if setup data exists.
 */
export { hasSetupData };

/**
 * Get setup status.
 */
export function getSetupStatus() {
  return setupState.status;
}
