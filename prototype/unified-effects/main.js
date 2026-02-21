/**
 * Unified Effects Prototype — main application controller.
 * Webcam + MediaPipe segmentation/landmarks + perspective-warped regions
 * + 9 transition effects + camera stabilization.
 */

import { TransitionEffectManager } from './effects/transition-manager.js';
import { ScannerSequence } from './effects/scanner-sequence.js';
import {
  updateStatusDot, updateActiveDisplay, setupScannerCallbacks, setupUI,
} from './ui.js';
import {
  regionToPixelCorners, loadArt, loadArtGalleries, loadRegionPreset,
  updateRegionColors,
} from './regions.js';
import { renderRegions } from './render-regions.js';

// ============================================
// State
// ============================================

const state = {
  webcamReady: false,
  segmentationReady: false,
  faceReady: false,
  poseReady: false,

  segmenter: null,
  faceLandmarker: null,
  poseLandmarker: null,

  segmentationEnabled: true,
  stabilizationEnabled: true,

  regions: [],
  artImages: new Map(),
  regionPresetCount: 3,

  // Segmentation mask cache
  lastMask: null,
  lastMaskW: 0,
  lastMaskH: 0,

  // Landmark cache (pixel coords)
  faceLandmarks: null,
  poseLandmarks: null,
  smoothingFactor: 0.3,

  // FPS tracking
  frameCount: 0,
  lastFpsTime: 0,
  fps: 0,

  // Jiggle compensator
  jiggle: null,
  jiggleInitialized: false,
};

const elements = {
  canvas: document.getElementById('canvas'),
  webcam: document.getElementById('webcam'),
};

const ctx = elements.canvas.getContext('2d');

// Temp canvas for region compositing
const tempCanvas = new OffscreenCanvas(1280, 720);
const tempCtx = tempCanvas.getContext('2d');

// Effect system
const manager = new TransitionEffectManager();
const scannerSequence = new ScannerSequence();

// Debug: expose for console inspection
window.__manager = manager;
window.__state = state;

// ============================================
// Initialization
// ============================================

async function initWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  elements.webcam.srcObject = stream;
  await new Promise((resolve) => {
    elements.webcam.onloadedmetadata = resolve;
  });
  elements.canvas.width = elements.webcam.videoWidth;
  elements.canvas.height = elements.webcam.videoHeight;
  tempCanvas.width = elements.canvas.width;
  tempCanvas.height = elements.canvas.height;
  state.webcamReady = true;
}

// ============================================
// MediaPipe
// ============================================

async function initMediaPipe() {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm');
  const { ImageSegmenter, FaceLandmarker, PoseLandmarker, FilesetResolver } = vision;

  const wasmFileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  // Segmenter (critical, load first)
  state.segmenter = await ImageSegmenter.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });
  state.segmentationReady = true;
  updateStatusDot('dot-seg', 'ready');

  // Face + Pose (non-blocking)
  Promise.all([
    FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }),
    PoseLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
  ]).then(([faceLandmarker, poseLandmarker]) => {
    state.faceLandmarker = faceLandmarker;
    state.poseLandmarker = poseLandmarker;
    state.faceReady = true;
    state.poseReady = true;
    updateStatusDot('dot-face', 'ready');
    updateStatusDot('dot-pose', 'ready');
    manager.setDetectors(
      faceLandmarker, poseLandmarker,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      PoseLandmarker.POSE_CONNECTIONS
    );
  }).catch((err) => {
    console.warn('Face/pose models failed:', err);
    updateStatusDot('dot-face', 'error');
    updateStatusDot('dot-pose', 'error');
  });
}

// ============================================
// Stabilization
// ============================================

function initStabilization() {
  if (typeof window.JiggleCompensator === 'undefined') {
    updateStatusDot('dot-stab', 'error');
    return;
  }
  state.jiggle = new window.JiggleCompensator();
  updateStatusDot('dot-stab', 'ready');
}

// ============================================
// Landmark Detection (per-frame)
// ============================================

function smoothLandmarks(prev, raw) {
  if (!prev || prev.length !== raw.length) return raw;
  const a = state.smoothingFactor;
  const b = 1 - a;
  return raw.map((p, i) => ({
    x: prev[i].x * b + p.x * a,
    y: prev[i].y * b + p.y * a,
  }));
}

let _landmarkErrorLogged = false;

function detectLandmarks(timestamp) {
  const w = elements.canvas.width;
  const h = elements.canvas.height;

  if (state.faceLandmarker) {
    try {
      const result = state.faceLandmarker.detectForVideo(elements.webcam, timestamp);
      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const raw = result.faceLandmarks[0].map((lm) => ({ x: lm.x * w, y: lm.y * h }));
        state.faceLandmarks = smoothLandmarks(state.faceLandmarks, raw);
      }
    } catch (err) {
      if (!_landmarkErrorLogged) {
        console.warn('[landmarks] Face detection error:', err.message || err);
        _landmarkErrorLogged = true;
      }
    }
  }

  if (state.poseLandmarker) {
    try {
      const result = state.poseLandmarker.detectForVideo(elements.webcam, timestamp + 1);
      if (result.landmarks && result.landmarks.length > 0) {
        const raw = result.landmarks[0].map((lm) => ({ x: lm.x * w, y: lm.y * h }));
        state.poseLandmarks = smoothLandmarks(state.poseLandmarks, raw);
      }
    } catch (err) {
      if (!_landmarkErrorLogged) {
        console.warn('[landmarks] Pose detection error:', err.message || err);
        _landmarkErrorLogged = true;
      }
    }
  }

  manager.updateLandmarkCache(state.faceLandmarks, state.poseLandmarks);
}

// ============================================
// Render Loop
// ============================================

function renderLoop(timestamp) {
  requestAnimationFrame(renderLoop);
  if (!state.webcamReady) return;

  const w = elements.canvas.width;
  const h = elements.canvas.height;

  // FPS
  state.frameCount++;
  if (timestamp - state.lastFpsTime >= 1000) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.lastFpsTime = timestamp;
    const fpsEl = document.getElementById('fps-display');
    if (fpsEl) {
      const face = state.faceLandmarks ? '\u2714' : '\u2718';
      const pose = state.poseLandmarks ? '\u2714' : '\u2718';
      fpsEl.textContent = `${state.fps} | F:${face} P:${pose}`;
    }
  }

  // 1. Draw webcam
  ctx.drawImage(elements.webcam, 0, 0, w, h);

  // 2. Segmentation
  let personMask = null;
  if (state.segmentationEnabled && state.segmentationReady && state.segmenter) {
    try {
      const result = state.segmenter.segmentForVideo(elements.webcam, timestamp);
      if (result.categoryMask) {
        personMask = new Uint8Array(result.categoryMask.getAsUint8Array());
        state.lastMask = personMask;
        state.lastMaskW = result.categoryMask.width;
        state.lastMaskH = result.categoryMask.height;
        result.categoryMask.close();

        manager.updateContourCache(personMask, state.lastMaskW, state.lastMaskH, w, h);

        // Auto-trigger first segmentation effects
        if (!scannerSequence.isActive) {
          manager.triggerFirstSegmentation(personMask, state.lastMaskW, state.lastMaskH, w, h, timestamp);
        }
      }
    } catch { /* ignore per-frame errors */ }
  }

  // 3. Landmarks
  detectLandmarks(timestamp);

  // 4. Stabilization
  if (state.stabilizationEnabled && state.jiggle) {
    try {
      if (!state.jiggleInitialized && personMask) {
        state.jiggle.initialize(elements.webcam, personMask);
        state.jiggleInitialized = true;
      } else if (state.jiggleInitialized) {
        state.jiggle.process(elements.webcam, personMask);
      }
    } catch { /* stabilization non-critical */ }
  }

  // 5. Render regions (with gesture hooks: tilt, warmth, art swap)
  renderRegions(ctx, tempCtx, tempCanvas, state, manager, timestamp);

  // 6. Effects layer
  manager.update(ctx, timestamp, w, h);

  // 7. Scanner sequence
  scannerSequence.update(ctx, timestamp, w, h);

  // 8. Region outlines (subtle, non-interactive)
  drawRegionOutlines(ctx, w, h);

  // Update active effect display
  updateActiveDisplay(manager);
}

function drawRegionOutlines(drawCtx, w, h) {
  drawCtx.save();
  drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  drawCtx.lineWidth = 1;
  drawCtx.setLineDash([4, 4]);

  for (const region of state.regions) {
    if (!region.active) continue;
    const c = regionToPixelCorners(region, w, h);
    drawCtx.beginPath();
    drawCtx.moveTo(c.topLeft.x, c.topLeft.y);
    drawCtx.lineTo(c.topRight.x, c.topRight.y);
    drawCtx.lineTo(c.bottomRight.x, c.bottomRight.y);
    drawCtx.lineTo(c.bottomLeft.x, c.bottomLeft.y);
    drawCtx.closePath();
    drawCtx.stroke();
  }

  drawCtx.setLineDash([]);
  drawCtx.restore();
}

// ============================================
// Init
// ============================================

async function init() {
  const w = () => elements.canvas.width;
  const h = () => elements.canvas.height;
  state.onPresetChange = (count) => loadRegionPreset(count, state, manager, w(), h());
  setupUI(manager, scannerSequence, state);
  setupScannerCallbacks(scannerSequence, manager, state, elements);
  loadRegionPreset(3, state, manager, w(), h());

  try {
    await initWebcam();
  } catch (err) {
    console.error('Webcam failed:', err);
    return;
  }

  manager.setVideoSource(elements.webcam);
  await loadArt(state.artImages);
  await loadArtGalleries(manager);
  updateRegionColors(state, manager, w(), h());

  // Start render loop before models load (shows webcam immediately)
  requestAnimationFrame(renderLoop);

  // Load jiggle compensator (classic script)
  try {
    await import('../../lib/feature-tracking.js');
    await import('../../lib/jiggle-compensator.js');
    initStabilization();
  } catch (err) {
    console.warn('Stabilization unavailable:', err);
    updateStatusDot('dot-stab', 'error');
  }

  // Load MediaPipe models
  try {
    await initMediaPipe();
  } catch (err) {
    console.error('MediaPipe failed:', err);
    updateStatusDot('dot-seg', 'error');
  }
}

init();
