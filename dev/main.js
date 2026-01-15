/**
 * Wall Art Dev Environment - Main Entry Point
 * Bootstraps the dev environment with video processing and mock controls.
 */

// Install Chrome mocks first
import './chrome-mock.js';

import { DevVideoProcessor } from './video-processor-adapter.js';
import { TEST_SCENARIOS, getScenario } from './scenarios.js';
import { initDebugPanel } from './components/DebugPanel.js';
import { initMockPopup } from './components/MockPopup.js';
import { initVideoControls } from './components/VideoControls.js';

// Global state
let processor = null;
let _currentScenario = null; // Reserved for scenario state tracking
let overlays = [];
const overlayImages = new Map();
let initialized = false;

/**
 * Initialize the dev environment.
 */
async function init() {
  // Prevent double initialization (HMR can re-run module)
  if (initialized) {
    console.log('[Dev] Already initialized, skipping');
    return;
  }
  initialized = true;

  console.log('[Dev] Initializing Wall Art Dev Environment');

  // Create processor
  processor = new DevVideoProcessor();

  // Get DOM elements
  const video = document.getElementById('demo-video');
  const canvas = document.getElementById('output-canvas');
  const placeholder = document.getElementById('video-placeholder');
  const scenarioSelect = document.getElementById('scenario-select');

  // Populate scenario dropdown
  TEST_SCENARIOS.forEach(scenario => {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.name;
    if (scenario.description) {
      option.title = scenario.description;
    }
    scenarioSelect.appendChild(option);
  });

  // Load overlays from mock storage
  const stored = await window.chrome.storage.local.get(['overlays']);
  overlays = stored.overlays || [];

  // Set up scenario switching
  scenarioSelect.addEventListener('change', async (e) => {
    const scenarioId = e.target.value;
    if (scenarioId) {
      await loadScenario(scenarioId);
    }
  });

  // Initialize UI components
  initDebugPanel(processor);
  initMockPopup({
    getOverlays: () => overlays,
    setOverlays: async (newOverlays) => {
      overlays = newOverlays;
      processor.setOverlays(overlays);
      await window.chrome.storage.local.set({ overlays });
    },
    loadImage: loadOverlayImage,
    removeImage: (id) => {
      overlayImages.delete(id);
      processor.removeOverlayImage(id);
    }
  });
  initVideoControls(video, processor);

  // Set up drag and drop for video files
  setupDragDrop(video, canvas, placeholder);

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', resetState);

  // Copy processor output to visible canvas
  processor.onFrameRendered = (srcCanvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = srcCanvas.width;
    canvas.height = srcCanvas.height;
    ctx.drawImage(srcCanvas, 0, 0);
  };

  // Try loading default scenario (demo placeholder)
  const defaultScenario = TEST_SCENARIOS.find(s => s.id === 'demo-placeholder');
  if (defaultScenario) {
    scenarioSelect.value = defaultScenario.id;
    await loadScenario(defaultScenario.id);
  }

  console.log('[Dev] Initialization complete');
}

/**
 * Load a scenario by ID.
 */
async function loadScenario(scenarioId) {
  try {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    console.error('[Dev] Scenario not found:', scenarioId);
    return;
  }

  console.log('[Dev] Loading scenario:', scenario.name);
  _currentScenario = scenario;

  const video = document.getElementById('demo-video');
  const placeholder = document.getElementById('video-placeholder');

  // Stop current processor
  if (processor.running) {
    processor.stop();
  }

  // Handle demo placeholder (no video file)
  if (!scenario.videoSrc) {
    await startDemoMode();
    return;
  }

  // Try to load video
  try {
    video.src = scenario.videoSrc;
    await video.load();

    video.addEventListener('loadedmetadata', async () => {
      placeholder.classList.add('hidden');

      // Get video dimensions
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      // Start processor
      await processor.start(video, width, height);
      processor.setOverlays(overlays);

      // Reload overlay images
      for (const overlay of overlays) {
        if (overlay.src) {
          await loadOverlayImage(overlay.id, overlay.src);
        }
      }

      // Start video playback
      video.play();
    }, { once: true });

    video.addEventListener('error', async () => {
      console.warn('[Dev] Video failed to load, starting demo mode');
      await startDemoMode();
    }, { once: true });
  } catch (error) {
    console.warn('[Dev] Error loading video:', error);
    await startDemoMode();
  }
  } catch (outerError) {
    console.error('[Dev] loadScenario failed:', outerError);
  }
}

/**
 * Start demo mode with animated canvas (no video file required).
 */
async function startDemoMode() {
  console.log('[Dev] Starting demo mode');

  try {
  const placeholder = document.getElementById('video-placeholder');

  // Create a demo video source using canvas
  const demoCanvas = document.createElement('canvas');
  demoCanvas.width = 1280;
  demoCanvas.height = 720;
  const demoCtx = demoCanvas.getContext('2d');

  // Draw initial frame so stream has content (required for captureStream)
  demoCtx.fillStyle = '#1a1a2e';
  demoCtx.fillRect(0, 0, 1280, 720);

  // Create a fake video element from the canvas stream
  const demoStream = demoCanvas.captureStream(30);
  const demoVideo = document.createElement('video');
  demoVideo.srcObject = demoStream;
  demoVideo.muted = true;
  await demoVideo.play();

  // Animate the demo canvas
  let hue = 0;
  let time = 0;
  function animateDemo() {
    time += 0.02;
    hue = (hue + 0.5) % 360;

    // Background gradient
    const gradient = demoCtx.createLinearGradient(0, 0, 1280, 720);
    gradient.addColorStop(0, `hsl(${hue}, 50%, 20%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 50%, 15%)`);
    demoCtx.fillStyle = gradient;
    demoCtx.fillRect(0, 0, 1280, 720);

    // Simulated person silhouette
    demoCtx.fillStyle = `hsl(${(hue + 180) % 360}, 30%, 25%)`;
    demoCtx.beginPath();
    // Head
    demoCtx.arc(640, 280, 80, 0, Math.PI * 2);
    demoCtx.fill();
    // Body
    demoCtx.beginPath();
    demoCtx.ellipse(640, 550, 150, 200, 0, 0, Math.PI * 2);
    demoCtx.fill();

    // Animated shapes in background
    for (let i = 0; i < 5; i++) {
      const x = 200 + i * 220 + Math.sin(time + i) * 30;
      const y = 150 + Math.cos(time * 0.7 + i) * 50;
      const size = 40 + Math.sin(time * 2 + i) * 10;

      demoCtx.fillStyle = `hsla(${(hue + i * 30) % 360}, 60%, 50%, 0.3)`;
      demoCtx.beginPath();
      demoCtx.arc(x, y, size, 0, Math.PI * 2);
      demoCtx.fill();
    }

    // Grid lines (simulated wall)
    demoCtx.strokeStyle = `hsla(${hue}, 20%, 40%, 0.2)`;
    demoCtx.lineWidth = 1;
    for (let x = 0; x < 1280; x += 80) {
      demoCtx.beginPath();
      demoCtx.moveTo(x, 0);
      demoCtx.lineTo(x, 720);
      demoCtx.stroke();
    }
    for (let y = 0; y < 720; y += 80) {
      demoCtx.beginPath();
      demoCtx.moveTo(0, y);
      demoCtx.lineTo(1280, y);
      demoCtx.stroke();
    }

    // Text label
    demoCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    demoCtx.font = '16px monospace';
    demoCtx.fillText('Demo Mode - Drop a video file or select a scenario', 20, 700);

    requestAnimationFrame(animateDemo);
  }

  animateDemo();
  placeholder.classList.add('hidden');

  // Start processor with demo video
  await processor.start(demoVideo, 1280, 720);
  processor.setOverlays(overlays);

  // Reload overlay images
  for (const overlay of overlays) {
    if (overlay.src) {
      await loadOverlayImage(overlay.id, overlay.src);
    }
  }
  } catch (error) {
    console.error('[Dev] startDemoMode failed:', error);
  }
}

/**
 * Load an image for an overlay.
 */
async function loadOverlayImage(id, src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      overlayImages.set(id, img);
      processor.setOverlayImage(id, img);
      resolve(img);
    };

    img.onerror = () => {
      console.warn('[Dev] Failed to load image:', src);
      reject(new Error('Failed to load image'));
    };

    img.src = src;
  });
}

/**
 * Set up drag and drop for video files.
 */
function setupDragDrop(video, canvas, placeholder) {
  const container = document.querySelector('.video-container');

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.classList.add('drag-over');
  });

  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('video/')) {
      console.warn('[Dev] Dropped file is not a video');
      return;
    }

    console.log('[Dev] Loading dropped video:', file.name);

    // Create object URL for the video
    const url = URL.createObjectURL(file);
    video.src = url;
    await video.load();

    video.addEventListener('loadedmetadata', async () => {
      placeholder.classList.add('hidden');

      // Stop current processor
      if (processor.running) {
        processor.stop();
      }

      // Start with new video
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      await processor.start(video, width, height);
      processor.setOverlays(overlays);

      // Reload overlay images
      for (const overlay of overlays) {
        if (overlay.src) {
          await loadOverlayImage(overlay.id, overlay.src);
        }
      }

      video.play();
    }, { once: true });
  });
}

/**
 * Reset all state.
 */
async function resetState() {
  console.log('[Dev] Resetting state');

  overlays = [];
  overlayImages.clear();

  await window.chrome.storage.local.set({ overlays: [] });

  processor.setOverlays([]);

  // Reinitialize popup
  initMockPopup({
    getOverlays: () => overlays,
    setOverlays: async (newOverlays) => {
      overlays = newOverlays;
      processor.setOverlays(overlays);
      await window.chrome.storage.local.set({ overlays });
    },
    loadImage: loadOverlayImage,
    removeImage: (id) => {
      overlayImages.delete(id);
      processor.removeOverlayImage(id);
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => console.error('[Dev] Init failed:', err));
  });
} else {
  init().catch(err => console.error('[Dev] Init failed:', err));
}
