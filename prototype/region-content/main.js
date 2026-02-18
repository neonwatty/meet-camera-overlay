import '../../lib/segmentation-mask.js';
import { SlideshowPlayer } from '../../lib/slideshow-player.js';
import { TabCapture } from '../../lib/tab-capture.js';
import { WallArtSegmenter } from '../../lib/wall-segmentation.js';
import { drawPerspectiveImage } from './region-renderer.js';

const DEFAULT_SLIDES = [
  { src: '../../assets/wall-art/abstract-ocean.png', name: 'Abstract Ocean' },
  { src: '../../assets/wall-art/nature-mountain.png', name: 'Nature Mountain' },
  { src: '../../assets/wall-art/abstract-sunset.png', name: 'Abstract Sunset' },
  { src: '../../assets/wall-art/nature-beach.png', name: 'Nature Beach' },
];

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const modeTabs = document.querySelectorAll('.mode-tab');
const slideshowPanel = document.getElementById('slideshow-panel');
const tabCapturePanel = document.getElementById('tab-capture-panel');
const intervalSelect = document.getElementById('interval');
const transitionSelect = document.getElementById('transition');
const addImagesBtn = document.getElementById('add-images');
const fileInput = document.getElementById('file-input');
const slideListEl = document.getElementById('slide-list');
const startCaptureBtn = document.getElementById('start-capture');
const stopCaptureBtn = document.getElementById('stop-capture');
const captureStatusEl = document.getElementById('capture-status');
const tabNameEl = document.getElementById('tab-name');
const webcamVideo = document.getElementById('webcam');
const segToggle = document.getElementById('segmentation-toggle');
const segDot = document.querySelector('.seg-dot');
const segText = document.getElementById('seg-text');
const resetRegionBtn = document.getElementById('reset-region');

let activeMode = 'slideshow';
const slides = [...DEFAULT_SLIDES];
let player = null;
const capture = new TabCapture();
let webcamReady = false;
let segmentationEnabled = true;

const tempCanvas = new OffscreenCanvas(1, 1);
const tempCtx = tempCanvas.getContext('2d');
const frameCanvas = new OffscreenCanvas(1, 1);
const frameCtx = frameCanvas.getContext('2d');

const CORNER_NAMES = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const CORNER_HIT_RADIUS = 4;
const DEFAULT_REGION = {
  topLeft: { x: 30, y: 20 }, topRight: { x: 70, y: 20 },
  bottomLeft: { x: 30, y: 70 }, bottomRight: { x: 70, y: 70 },
};

function cloneRegion(r) {
  const out = {};
  for (const k of CORNER_NAMES) out[k] = { x: r[k].x, y: r[k].y };
  return out;
}

let region = cloneRegion(DEFAULT_REGION);
let dragging = null;
let dragStart = null;
let regionSnapshot = null;

const segmenter = new WallArtSegmenter({
  preset: 'balanced',
  onInitialized() {
    segDot.className = 'seg-dot ready';
    segText.textContent = 'Ready';
  },
  onError(err) {
    segDot.className = 'seg-dot error';
    segText.textContent = `Error: ${err.message}`;
  },
});
segToggle.addEventListener('change', () => { segmentationEnabled = segToggle.checked; });

async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    webcamVideo.srcObject = stream;
    await webcamVideo.play();
    canvas.width = webcamVideo.videoWidth;
    canvas.height = webcamVideo.videoHeight;
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    frameCanvas.width = canvas.width;
    frameCanvas.height = canvas.height;
    webcamReady = true;
  } catch (err) {
    console.error('[RegionContent] Webcam access failed:', err);
    segDot.className = 'seg-dot error';
    segText.textContent = 'No camera';
  }
}

function createPlayer() {
  if (slides.length < 2) return;
  player = new SlideshowPlayer(slides, {
    intervalSeconds: Number(intervalSelect.value),
    transition: transitionSelect.value,
  });
}

function renderSlideList() {
  slideListEl.innerHTML = '';
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const item = document.createElement('div');
    item.className = 'slide-item';
    const thumb = document.createElement('img');
    thumb.className = 'slide-thumb';
    thumb.src = slide.src;
    thumb.alt = slide.name;
    const name = document.createElement('span');
    name.className = 'slide-name';
    name.textContent = slide.name;
    const remove = document.createElement('button');
    remove.className = 'slide-remove';
    remove.textContent = '\u00d7';
    remove.addEventListener('click', () => {
      slides.splice(i, 1);
      renderSlideList();
      if (slides.length >= 2) createPlayer();
      else player = null;
    });
    item.append(thumb, name, remove);
    slideListEl.appendChild(item);
  }
}

function setMode(mode) {
  activeMode = mode;
  for (const tab of modeTabs) tab.classList.toggle('active', tab.dataset.mode === mode);
  slideshowPanel.classList.toggle('hidden', mode !== 'slideshow');
  tabCapturePanel.classList.toggle('hidden', mode !== 'tabCapture');
}
for (const tab of modeTabs) tab.addEventListener('click', () => setMode(tab.dataset.mode));

intervalSelect.addEventListener('change', createPlayer);
transitionSelect.addEventListener('change', createPlayer);
addImagesBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  for (const file of fileInput.files) slides.push({ src: URL.createObjectURL(file), name: file.name });
  fileInput.value = '';
  renderSlideList();
  createPlayer();
});

startCaptureBtn.addEventListener('click', async () => {
  try {
    await capture.start();
    captureStatusEl.classList.remove('hidden');
    startCaptureBtn.classList.add('hidden');
    tabNameEl.textContent = capture.tabName;
    capture.onEnded(() => stopCapture());
  } catch { /* User cancelled */ }
});

function stopCapture() {
  capture.stop();
  captureStatusEl.classList.add('hidden');
  startCaptureBtn.classList.remove('hidden');
  tabNameEl.textContent = '';
}
stopCaptureBtn.addEventListener('click', stopCapture);

function getCanvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * 100 / rect.width, y: (e.clientY - rect.top) * 100 / rect.height };
}

function findCornerAtPoint(point) {
  for (const name of CORNER_NAMES) {
    if (Math.hypot(point.x - region[name].x, point.y - region[name].y) < CORNER_HIT_RADIUS) return name;
  }
  return null;
}

function isPointInRegion(point) {
  const poly = [region.topLeft, region.topRight, region.bottomRight, region.bottomLeft];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

canvas.addEventListener('mousedown', (e) => {
  const point = getCanvasPoint(e);
  const corner = findCornerAtPoint(point);
  if (corner) {
    dragging = `corner-${corner}`;
    dragStart = point;
    canvas.classList.add('cursor-grabbing');
    return;
  }
  if (isPointInRegion(point)) {
    dragging = 'move';
    dragStart = point;
    regionSnapshot = cloneRegion(region);
    canvas.classList.add('cursor-grabbing');
  }
});

canvas.addEventListener('mousemove', (e) => {
  const point = getCanvasPoint(e);
  if (!dragging) {
    const corner = findCornerAtPoint(point);
    if (corner) canvas.className = 'cursor-grab';
    else if (isPointInRegion(point)) canvas.className = 'cursor-move';
    else canvas.className = '';
    return;
  }
  if (dragging.startsWith('corner-')) {
    const name = dragging.slice(7);
    region[name] = { x: clamp(point.x, 0, 100), y: clamp(point.y, 0, 100) };
  } else if (dragging === 'move') {
    const dx = point.x - dragStart.x;
    const dy = point.y - dragStart.y;
    for (const name of CORNER_NAMES) {
      region[name] = { x: clamp(regionSnapshot[name].x + dx, 0, 100), y: clamp(regionSnapshot[name].y + dy, 0, 100) };
    }
  }
});

function endDrag() {
  dragging = null;
  dragStart = null;
  regionSnapshot = null;
  canvas.classList.remove('cursor-grabbing');
}
canvas.addEventListener('mouseup', endDrag);
canvas.addEventListener('mouseleave', () => { if (dragging) endDrag(); canvas.className = ''; });

resetRegionBtn.addEventListener('click', () => { region = cloneRegion(DEFAULT_REGION); });

function toPixelCorners() {
  const w = canvas.width, h = canvas.height;
  const out = {};
  for (const k of CORNER_NAMES) out[k] = { x: region[k].x / 100 * w, y: region[k].y / 100 * h };
  return out;
}

function drawRegionOverlay(drawCtx, px) {
  drawCtx.strokeStyle = '#e85d04';
  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.moveTo(px.topLeft.x, px.topLeft.y);
  drawCtx.lineTo(px.topRight.x, px.topRight.y);
  drawCtx.lineTo(px.bottomRight.x, px.bottomRight.y);
  drawCtx.lineTo(px.bottomLeft.x, px.bottomLeft.y);
  drawCtx.closePath();
  drawCtx.stroke();
  drawCtx.fillStyle = '#e85d04';
  for (const k of CORNER_NAMES) {
    drawCtx.beginPath();
    drawCtx.arc(px[k].x, px[k].y, 8, 0, Math.PI * 2);
    drawCtx.fill();
  }
}

function render(timestamp) {
  requestAnimationFrame(render);
  if (!webcamReady) return;
  ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
  let contentFrame = null;
  if (activeMode === 'slideshow' && player) {
    player.update(timestamp);
    contentFrame = player.currentFrame;
  } else if (activeMode === 'tabCapture' && capture.active && capture.video) {
    contentFrame = capture.video;
  }
  const pixelCorners = toPixelCorners();
  if (contentFrame) {
    // Snapshot video frames once so the 128-triangle mesh draws from a static canvas
    // instead of decoding the live video 128 times per frame
    let warpSource = contentFrame;
    if (contentFrame instanceof HTMLVideoElement) {
      frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
      frameCtx.drawImage(contentFrame, 0, 0, frameCanvas.width, frameCanvas.height);
      warpSource = frameCanvas;
    }
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    drawPerspectiveImage(tempCtx, warpSource, pixelCorners);
    const mask = segmenter.getCachedMask();
    if (segmentationEnabled && mask) segmenter.applyMaskCutout(tempCtx, mask);
    ctx.drawImage(tempCanvas, 0, 0);
  }
  drawRegionOverlay(ctx, pixelCorners);
}

async function segmentLoop() {
  while (true) {
    if (webcamReady && segmentationEnabled && webcamVideo.readyState >= 2) {
      await segmenter.segment(webcamVideo);
    }
    await new Promise((r) => setTimeout(r, 33));
  }
}

createPlayer();
renderSlideList();
initWebcam().then(() => { segmenter.initialize(); segmentLoop(); });
requestAnimationFrame(render);
