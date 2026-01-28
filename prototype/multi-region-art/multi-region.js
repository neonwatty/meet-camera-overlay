/**
 * Multi-Region Wall Art Prototype
 *
 * Features:
 * - Multiple perspective-transformed art regions
 * - Person occlusion (art appears behind user)
 * - Drag to move region, Shift+drag to pan art
 * - Corner dragging for perspective adjustment
 * - Zoom controls (+/- buttons and scroll wheel)
 * - Art picker with upload, gallery, URL tabs
 * - localStorage persistence
 */

// ============================================
// State
// ============================================
const state = {
  isRunning: false,
  animationId: null,

  // Regions
  regions: [],
  selectedRegionId: null,

  // Drag state
  dragging: null, // 'corner-topLeft', 'pan-art', 'move-region', etc.
  dragStartPoint: null,
  dragStartRegion: null, // Copy of region at drag start

  // Models
  segmenter: null,
  segmentationEnabled: true,
  segmentationReady: false,

  // Art sources cache (regionId -> Image)
  artSources: new Map(),

  // Canvas dimensions
  videoWidth: 640,
  videoHeight: 480
};

// Elements
const elements = {
  webcam: document.getElementById('webcam'),
  canvas: document.getElementById('canvas'),
  addRegionBtn: document.getElementById('add-region-btn'),
  sidebarAddBtn: document.getElementById('sidebar-add-btn'),
  toggleSegmentation: document.getElementById('toggle-segmentation'),
  regionList: document.getElementById('region-list'),
  infoPanel: document.getElementById('info-panel'),
  infoSelected: document.getElementById('info-selected'),
  infoZoom: document.getElementById('info-zoom'),
  infoPan: document.getElementById('info-pan'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  errorMessage: document.getElementById('error-message'),
  // Modal elements
  artPickerModal: document.getElementById('art-picker-modal'),
  closeModal: document.getElementById('close-modal'),
  cancelArt: document.getElementById('cancel-art'),
  applyArt: document.getElementById('apply-art'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  uploadPreview: document.getElementById('upload-preview'),
  previewImage: document.getElementById('preview-image'),
  clearPreview: document.getElementById('clear-preview'),
  galleryGrid: document.getElementById('gallery-grid'),
  urlInput: document.getElementById('url-input'),
  loadUrl: document.getElementById('load-url'),
  urlPreview: document.getElementById('url-preview'),
  urlPreviewImage: document.getElementById('url-preview-image'),
  urlError: document.getElementById('url-error')
};

const ctx = elements.canvas.getContext('2d');

// Art picker state
const artPickerState = {
  targetRegionId: null,
  selectedSource: null,
  uploadedImage: null
};

// Gallery images
const GALLERY_IMAGES = [
  { id: 'pattern-1', name: 'Checkerboard', category: 'patterns', color: '#4a5568' },
  { id: 'pattern-2', name: 'Stripes', category: 'patterns', color: '#667eea' },
  { id: 'pattern-3', name: 'Dots', category: 'patterns', color: '#ed8936' },
  { id: 'solid-1', name: 'Navy Blue', category: 'solid', color: '#2c3e50' },
  { id: 'solid-2', name: 'Forest Green', category: 'solid', color: '#27ae60' },
  { id: 'solid-3', name: 'Deep Purple', category: 'solid', color: '#8e44ad' },
  { id: 'solid-4', name: 'Warm Gray', category: 'solid', color: '#95a5a6' },
  { id: 'abstract-1', name: 'Gradient Blue', category: 'abstract', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'abstract-2', name: 'Sunset', category: 'abstract', color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'abstract-3', name: 'Ocean', category: 'abstract', color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'nature-1', name: 'Sky Blue', category: 'nature', color: '#3498db' },
  { id: 'nature-2', name: 'Grass Green', category: 'nature', color: '#2ecc71' }
];

// ============================================
// Initialization
// ============================================
async function init() {
  showLoading('Starting camera...');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });

    elements.webcam.srcObject = stream;
    await elements.webcam.play();

    state.videoWidth = elements.webcam.videoWidth;
    state.videoHeight = elements.webcam.videoHeight;
    elements.canvas.width = state.videoWidth;
    elements.canvas.height = state.videoHeight;

    loadFromStorage();

    updateSegmentationStatus('loading');
    loadSegmentationModel().catch(err => {
      console.error('Failed to load segmentation:', err);
      updateSegmentationStatus('error');
    });

    setupEventListeners();

    state.isRunning = true;
    hideLoading();
    renderLoop();

  } catch (error) {
    console.error('Init error:', error);
    hideLoading();
    showError('Camera access denied. Please allow camera access and reload.');
  }
}

// ============================================
// MediaPipe Segmentation
// ============================================
async function loadSegmentationModel() {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm');
  const { ImageSegmenter, FilesetResolver } = vision;

  const wasmFileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  state.segmenter = await ImageSegmenter.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false
  });

  state.segmentationReady = true;
  updateSegmentationStatus('active');
}

function updateSegmentationStatus(status) {
  const btn = elements.toggleSegmentation;
  const statusEl = btn.querySelector('.status');

  btn.classList.remove('active', 'loading', 'disabled');

  switch (status) {
    case 'loading':
      btn.classList.add('loading');
      statusEl.textContent = 'Loading...';
      break;
    case 'active':
      btn.classList.add('active');
      statusEl.textContent = 'Active';
      break;
    case 'disabled':
      btn.classList.add('disabled');
      statusEl.textContent = 'Off';
      break;
    case 'error':
      btn.classList.add('disabled');
      statusEl.textContent = 'Error';
      break;
  }
}

// ============================================
// Region Management
// ============================================
function createRegion() {
  const id = `region-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const regionCount = state.regions.length;

  const offset = (regionCount * 5) % 20;
  const region = {
    id,
    name: `Region ${regionCount + 1}`,
    region: {
      topLeft: { x: 30 + offset, y: 30 + offset },
      topRight: { x: 70 + offset, y: 30 + offset },
      bottomLeft: { x: 30 + offset, y: 70 + offset },
      bottomRight: { x: 70 + offset, y: 70 + offset }
    },
    art: null,
    transform: { zoom: 1.0, panX: 0, panY: 0 },
    active: true,
    zIndex: regionCount
  };

  state.regions.push(region);
  selectRegion(id);
  updateRegionList();
  saveToStorage();

  openArtPicker(id);

  return region;
}

function deleteRegion(id) {
  const index = state.regions.findIndex(r => r.id === id);
  if (index === -1) return;

  state.regions.splice(index, 1);
  state.artSources.delete(id);

  if (state.selectedRegionId === id) {
    state.selectedRegionId = state.regions.length > 0 ? state.regions[state.regions.length - 1].id : null;
  }

  updateRegionList();
  saveToStorage();
}

function selectRegion(id) {
  state.selectedRegionId = id;
  updateRegionList();
  updateInfoPanel();
}

function getSelectedRegion() {
  return state.regions.find(r => r.id === state.selectedRegionId) || null;
}

// ============================================
// Render Loop
// ============================================
function renderLoop() {
  if (!state.isRunning) return;

  state.animationId = requestAnimationFrame(renderLoop);

  // Draw video
  ctx.drawImage(elements.webcam, 0, 0);

  // Get person mask if segmentation enabled
  let personMask = null;
  let maskWidth = 0, maskHeight = 0;

  if (state.segmentationEnabled && state.segmentationReady && state.segmenter) {
    try {
      const result = state.segmenter.segmentForVideo(elements.webcam, performance.now());
      if (result.categoryMask) {
        maskWidth = result.categoryMask.width;
        maskHeight = result.categoryMask.height;
        personMask = result.categoryMask.getAsUint8Array();
        result.categoryMask.close();
      }
    } catch {
      // Ignore segmentation errors
    }
  }

  // Render each region's art
  for (const region of state.regions) {
    if (!region.active) continue;

    if (region.art && state.artSources.has(region.id)) {
      renderRegionWithArt(region, personMask, maskWidth, maskHeight);
    }
  }

  // Draw region overlays (handles, outlines)
  for (const region of state.regions) {
    if (!region.active) continue;
    drawRegionOverlay(region, region.id === state.selectedRegionId);
  }
}

function renderRegionWithArt(region, personMask, maskWidth, maskHeight) {
  const source = state.artSources.get(region.id);
  if (!source || !source.complete) return;

  const width = elements.canvas.width;
  const height = elements.canvas.height;

  // Convert region % to pixels
  const corners = {
    topLeft: { x: (region.region.topLeft.x / 100) * width, y: (region.region.topLeft.y / 100) * height },
    topRight: { x: (region.region.topRight.x / 100) * width, y: (region.region.topRight.y / 100) * height },
    bottomLeft: { x: (region.region.bottomLeft.x / 100) * width, y: (region.region.bottomLeft.y / 100) * height },
    bottomRight: { x: (region.region.bottomRight.x / 100) * width, y: (region.region.bottomRight.y / 100) * height }
  };

  // Create temp canvas for this region's art
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');

  // Draw perspective-transformed image to temp canvas
  drawPerspectiveImage(tempCtx, source, corners, region.transform, width, height);

  // Apply person mask if available (makes person appear in front of art)
  if (personMask) {
    applyPersonMask(tempCtx, personMask, maskWidth, maskHeight);
  }

  // Composite onto main canvas
  ctx.drawImage(tempCanvas, 0, 0);
}

/**
 * Draw image into a quadrilateral region.
 * Simple approach: draw image stretched to bounding box, clipped to quad.
 * This doesn't have true perspective but tests basic rendering.
 */
function drawPerspectiveImage(ctx, source, corners, transform, _canvasWidth, _canvasHeight) {
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const { zoom = 1, panX = 0, panY = 0 } = transform;

  const srcWidth = source.naturalWidth || source.width;
  const srcHeight = source.naturalHeight || source.height;

  if (!srcWidth || !srcHeight) return;

  // Calculate source region based on zoom and pan
  const visibleWidth = srcWidth / zoom;
  const visibleHeight = srcHeight / zoom;
  const srcX = Math.max(0, Math.min(srcWidth - visibleWidth, (srcWidth - visibleWidth) / 2 + panX));
  const srcY = Math.max(0, Math.min(srcHeight - visibleHeight, (srcHeight - visibleHeight) / 2 + panY));

  // Use triangular mesh for perspective transformation
  // More subdivisions = smoother perspective approximation
  const gridSize = 8; // 8x8 grid of quads = good balance of quality vs performance

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Calculate UV coordinates for this cell
      const u0 = col / gridSize;
      const v0 = row / gridSize;
      const u1 = (col + 1) / gridSize;
      const v1 = (row + 1) / gridSize;

      // Get destination corners for this cell using bilinear interpolation
      const dstTL = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u0, v0);
      const dstTR = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u1, v0);
      const dstBL = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u0, v1);
      const dstBR = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u1, v1);

      // Calculate source coordinates (with zoom/pan applied)
      const sx0 = srcX + u0 * visibleWidth;
      const sy0 = srcY + v0 * visibleHeight;
      const sx1 = srcX + u1 * visibleWidth;
      const sy1 = srcY + v1 * visibleHeight;

      // Draw two triangles for this cell
      // Triangle 1: TL, TR, BL
      drawTexturedTriangle(ctx, source,
        sx0, sy0, sx1, sy0, sx0, sy1,
        dstTL, dstTR, dstBL
      );

      // Triangle 2: TR, BR, BL
      drawTexturedTriangle(ctx, source,
        sx1, sy0, sx1, sy1, sx0, sy1,
        dstTR, dstBR, dstBL
      );
    }
  }
}

/**
 * Bilinear interpolation for a point within a quadrilateral
 */
function bilinearPoint(tl, tr, bl, br, u, v) {
  const top = {
    x: tl.x + (tr.x - tl.x) * u,
    y: tl.y + (tr.y - tl.y) * u
  };
  const bottom = {
    x: bl.x + (br.x - bl.x) * u,
    y: bl.y + (br.y - bl.y) * u
  };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v
  };
}

/**
 * Draw a textured triangle using affine transform.
 * Maps source triangle to destination triangle using texture mapping.
 *
 * Source triangle: (sx0,sy0), (sx1,sy1), (sx2,sy2) - coordinates in source image
 * Dest triangle: p0, p1, p2 - coordinates on canvas
 */
function drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy1, sx2, sy2, p0, p1, p2) {
  // Skip degenerate triangles
  const destArea = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y));
  if (destArea < 1) return;

  ctx.save();

  // Clip to destination triangle
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();

  // We need to find a transform that maps source triangle to dest triangle.
  // The source image pixel at (sx, sy) should appear at canvas position that
  // corresponds to the same barycentric coordinates in the dest triangle.
  //
  // Using the standard texture mapping approach:
  // We compute transform T such that: T * [sx; sy; 1] = [dx; dy; 1]
  // for each corresponding pair of source/dest points.

  // Determinant of source triangle matrix
  const srcDet = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(srcDet) < 0.001) {
    ctx.restore();
    return;
  }

  // Compute the affine transform coefficients
  // Transform maps: (sx0,sy0)->p0, (sx1,sy1)->p1, (sx2,sy2)->p2
  //
  // The transform is: [dx]   [a c e] [sx]
  //                   [dy] = [b d f] [sy]
  //                   [1 ]   [0 0 1] [1 ]
  //
  // Solving the system of equations:
  const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y;
  const dx2 = p2.x - p0.x, dy2 = p2.y - p0.y;
  const dsx1 = sx1 - sx0, dsy1 = sy1 - sy0;
  const dsx2 = sx2 - sx0, dsy2 = sy2 - sy0;

  const invDet = 1 / srcDet;

  // Inverse of source triangle edge matrix
  const m11 = dsy2 * invDet, m12 = -dsx2 * invDet;
  const m21 = -dsy1 * invDet, m22 = dsx1 * invDet;

  // Transform coefficients
  const a = dx1 * m11 + dx2 * m21;
  const c = dx1 * m12 + dx2 * m22;
  const b = dy1 * m11 + dy2 * m21;
  const d = dy1 * m12 + dy2 * m22;
  const e = p0.x - a * sx0 - c * sy0;
  const f = p0.y - b * sx0 - d * sy0;

  // Apply the transform and draw
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(source, 0, 0);

  ctx.restore();
}



function applyPersonMask(ctx, mask, mWidth, mHeight) {

  const canvas = ctx.canvas;
  const cWidth = canvas.width;
  const cHeight = canvas.height;

  // If mask dimensions match canvas, work directly (faster)
  if (mWidth === cWidth && mHeight === cHeight) {
    const imageData = ctx.getImageData(0, 0, cWidth, cHeight);
    const pixels = imageData.data;

    // MediaPipe: 0 = person, 255 = background
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) {
        pixels[i * 4 + 3] = 0; // Person = transparent
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return;
  }

  // Need to scale mask - use canvas scaling for smooth interpolation
  // Step 1: Create mask canvas at original mask dimensions
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mWidth;
  maskCanvas.height = mHeight;
  const maskCtx = maskCanvas.getContext('2d');

  const maskImageData = maskCtx.createImageData(mWidth, mHeight);
  for (let i = 0; i < mask.length; i++) {
    // MediaPipe: 0 = person, 255 = background
    // We draw white (255) where person is, black (0) where background is
    const isPerson = mask[i] === 0;
    maskImageData.data[i * 4] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 1] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 2] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  // Step 2: Scale mask to canvas size using smooth interpolation
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = cWidth;
  scaledCanvas.height = cHeight;
  const scaledCtx = scaledCanvas.getContext('2d');
  scaledCtx.drawImage(maskCanvas, 0, 0, cWidth, cHeight);
  const scaledMask = scaledCtx.getImageData(0, 0, cWidth, cHeight);

  // Step 3: Apply scaled mask to artwork
  const imageData = ctx.getImageData(0, 0, cWidth, cHeight);
  const pixels = imageData.data;

  for (let i = 0; i < cWidth * cHeight; i++) {
    // Scaled mask: white (255) = person, make transparent
    if (scaledMask.data[i * 4] > 128) {
      pixels[i * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawRegionOverlay(region, isSelected) {
  const width = elements.canvas.width;
  const height = elements.canvas.height;

  const corners = {
    topLeft: { x: (region.region.topLeft.x / 100) * width, y: (region.region.topLeft.y / 100) * height },
    topRight: { x: (region.region.topRight.x / 100) * width, y: (region.region.topRight.y / 100) * height },
    bottomLeft: { x: (region.region.bottomLeft.x / 100) * width, y: (region.region.bottomLeft.y / 100) * height },
    bottomRight: { x: (region.region.bottomRight.x / 100) * width, y: (region.region.bottomRight.y / 100) * height }
  };

  // Draw outline
  ctx.strokeStyle = isSelected ? '#e94560' : 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = isSelected ? 3 : 1;
  ctx.setLineDash(isSelected ? [] : [5, 5]);

  ctx.beginPath();
  ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
  ctx.lineTo(corners.topRight.x, corners.topRight.y);
  ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
  ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw corner handles and zoom controls if selected
  if (isSelected) {
    const handleRadius = 12;
    const cornerColors = {
      topLeft: '#f472b6',
      topRight: '#818cf8',
      bottomLeft: '#34d399',
      bottomRight: '#fbbf24'
    };

    for (const [name, corner] of Object.entries(corners)) {
      // White border
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, handleRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Colored center
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = cornerColors[name];
      ctx.fill();
    }

    // Draw controls in center of region
    const centerX = (corners.topLeft.x + corners.topRight.x + corners.bottomLeft.x + corners.bottomRight.x) / 4;
    const centerY = (corners.topLeft.y + corners.topRight.y + corners.bottomLeft.y + corners.bottomRight.y) / 4;

    // Draw control panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(centerX - 60, centerY - 40, 120, 80, 8);
    ctx.fill();

    // === ZOOM ROW (top) ===
    const zoomY = centerY - 22;

    // Minus button
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX - 35, zoomY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('−', centerX - 35, zoomY);

    // Zoom text
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${region.transform.zoom.toFixed(1)}x`, centerX, zoomY);

    // Plus button
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX + 35, zoomY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('+', centerX + 35, zoomY);

    // === PAN ROW (bottom) - arrow buttons ===
    const panY = centerY + 18;

    // Left arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX - 35, panY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX - 35 + 4, panY - 5);
    ctx.lineTo(centerX - 35 - 4, panY);
    ctx.lineTo(centerX - 35 + 4, panY + 5);
    ctx.closePath();
    ctx.fill();

    // Pan label
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText('PAN', centerX, panY);

    // Right arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX + 35, panY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX + 35 - 4, panY - 5);
    ctx.lineTo(centerX + 35 + 4, panY);
    ctx.lineTo(centerX + 35 - 4, panY + 5);
    ctx.closePath();
    ctx.fill();

    // Up arrow (above PAN label)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX, panY - 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX - 4, panY - 15 + 3);
    ctx.lineTo(centerX, panY - 15 - 4);
    ctx.lineTo(centerX + 4, panY - 15 + 3);
    ctx.closePath();
    ctx.fill();

    // Down arrow (below PAN label)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX, panY + 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX - 4, panY + 15 - 3);
    ctx.lineTo(centerX, panY + 15 + 4);
    ctx.lineTo(centerX + 4, panY + 15 - 3);
    ctx.closePath();
    ctx.fill();

    // Draw instruction text at top
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const topCenterX = (corners.topLeft.x + corners.topRight.x) / 2;
    const topCenterY = (corners.topLeft.y + corners.topRight.y) / 2 - 20;
    ctx.fillText('Drag region | Use arrows to pan art', topCenterX, topCenterY);
  }
}

// ============================================
// Input Handling
// ============================================
function setupEventListeners() {
  // Add region buttons
  elements.addRegionBtn.addEventListener('click', createRegion);
  elements.sidebarAddBtn.addEventListener('click', createRegion);

  // Toggle segmentation
  elements.toggleSegmentation.addEventListener('click', () => {
    state.segmentationEnabled = !state.segmentationEnabled;
    updateSegmentationStatus(state.segmentationEnabled && state.segmentationReady ? 'active' : 'disabled');
  });

  // Canvas mouse handlers
  const canvas = elements.canvas;

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);
  canvas.addEventListener('dblclick', handleDoubleClick);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const selected = getSelectedRegion();

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected && document.activeElement === document.body) {
        e.preventDefault();
        deleteRegion(selected.id);
      }
    } else if (e.key === 'Escape') {
      selectRegion(null);
      closeArtPicker();
    } else if (e.key === '+' || e.key === '=') {
      if (selected) {
        selected.transform.zoom = Math.min(4, selected.transform.zoom + 0.1);
        updateInfoPanel();
        saveToStorage();
      }
    } else if (e.key === '-' || e.key === '_') {
      if (selected) {
        selected.transform.zoom = Math.max(0.25, selected.transform.zoom - 0.1);
        updateInfoPanel();
        saveToStorage();
      }
    }
  });

  // Art picker modal
  elements.closeModal.addEventListener('click', closeArtPicker);
  elements.cancelArt.addEventListener('click', closeArtPicker);
  elements.applyArt.addEventListener('click', applySelectedArt);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Upload drop zone
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
  });
  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
  });
  elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    }
  });

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  });

  elements.clearPreview.addEventListener('click', () => {
    artPickerState.uploadedImage = null;
    artPickerState.selectedSource = null;
    elements.uploadPreview.classList.add('hidden');
    updateApplyButton();
  });

  // Gallery
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery(btn.dataset.category);
    });
  });
  renderGallery('all');

  // URL input
  elements.loadUrl.addEventListener('click', loadImageFromUrl);
  elements.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadImageFromUrl();
  });
}

function handleMouseDown(e) {
  const point = getCanvasPoint(e);
  const pixelPoint = getCanvasPixelPoint(e);
  const selected = getSelectedRegion();

  // Check if clicking on control buttons (zoom/pan) for selected region
  if (selected) {
    const action = checkControlButtonClick(pixelPoint, selected);
    if (action) {
      const panStep = 30; // Pixels to pan per click

      if (action === 'zoom-in') {
        selected.transform.zoom = Math.min(4, selected.transform.zoom + 0.2);
      } else if (action === 'zoom-out') {
        selected.transform.zoom = Math.max(0.25, selected.transform.zoom - 0.2);
      } else if (action === 'pan-left') {
        selected.transform.panX -= panStep;
      } else if (action === 'pan-right') {
        selected.transform.panX += panStep;
      } else if (action === 'pan-up') {
        selected.transform.panY -= panStep;
      } else if (action === 'pan-down') {
        selected.transform.panY += panStep;
      }
      updateInfoPanel();
      updateRegionList();
      saveToStorage();
      return;
    }

    // Check corners first (highest priority)
    const corner = findCornerAtPoint(point, selected);
    if (corner) {
      state.dragging = `corner-${corner}`;
      state.dragStartPoint = point;
      elements.canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
  }

  // Check if clicking inside any region
  for (let i = state.regions.length - 1; i >= 0; i--) {
    const region = state.regions[i];
    if (isPointInRegion(point, region)) {
      selectRegion(region.id);

      if (e.shiftKey) {
        // Shift+drag = pan art inside region
        state.dragging = 'pan-art';
        state.dragStartPoint = point;
        state.dragStartRegion = {
          panX: region.transform.panX,
          panY: region.transform.panY
        };
        elements.canvas.style.cursor = 'move';
      } else {
        // Regular drag = move entire region
        state.dragging = 'move-region';
        state.dragStartPoint = point;
        state.dragStartRegion = JSON.parse(JSON.stringify(region.region));
        elements.canvas.style.cursor = 'move';
      }
      e.preventDefault();
      return;
    }
  }

  // Clicked outside all regions
  selectRegion(null);
}

function handleMouseMove(e) {
  const point = getCanvasPoint(e);
  const selected = getSelectedRegion();

  if (!state.dragging) {
    updateCursor(point, e.shiftKey);
    return;
  }

  if (!selected) return;

  if (state.dragging.startsWith('corner-')) {
    const cornerName = state.dragging.replace('corner-', '');
    moveCorner(selected, cornerName, point);
  } else if (state.dragging === 'move-region' && state.dragStartRegion) {
    // Move entire region
    const dx = point.x - state.dragStartPoint.x;
    const dy = point.y - state.dragStartPoint.y;

    selected.region.topLeft.x = clamp(state.dragStartRegion.topLeft.x + dx, 0, 100);
    selected.region.topLeft.y = clamp(state.dragStartRegion.topLeft.y + dy, 0, 100);
    selected.region.topRight.x = clamp(state.dragStartRegion.topRight.x + dx, 0, 100);
    selected.region.topRight.y = clamp(state.dragStartRegion.topRight.y + dy, 0, 100);
    selected.region.bottomLeft.x = clamp(state.dragStartRegion.bottomLeft.x + dx, 0, 100);
    selected.region.bottomLeft.y = clamp(state.dragStartRegion.bottomLeft.y + dy, 0, 100);
    selected.region.bottomRight.x = clamp(state.dragStartRegion.bottomRight.x + dx, 0, 100);
    selected.region.bottomRight.y = clamp(state.dragStartRegion.bottomRight.y + dy, 0, 100);
  } else if (state.dragging === 'pan-art' && state.dragStartRegion) {
    // Pan art inside region
    const dx = point.x - state.dragStartPoint.x;
    const dy = point.y - state.dragStartPoint.y;

    // Scale pan amount by zoom level and canvas size
    const panScale = 5;
    selected.transform.panX = state.dragStartRegion.panX - dx * panScale;
    selected.transform.panY = state.dragStartRegion.panY - dy * panScale;
    updateInfoPanel();
  }
}

function handleMouseUp() {
  if (state.dragging) {
    state.dragging = null;
    state.dragStartPoint = null;
    state.dragStartRegion = null;
    elements.canvas.style.cursor = 'default';
    saveToStorage();
  }
}

function handleDoubleClick(e) {
  const point = getCanvasPoint(e);
  const selected = getSelectedRegion();

  if (selected && isPointInRegion(point, selected)) {
    // Check if not on a corner
    const corner = findCornerAtPoint(point, selected);
    if (!corner) {
      // Reset zoom/pan
      selected.transform.zoom = 1.0;
      selected.transform.panX = 0;
      selected.transform.panY = 0;
      updateInfoPanel();
      updateRegionList();
      saveToStorage();
    }
  }
}

function handleWheel(e) {
  const point = getCanvasPoint(e);
  const selected = getSelectedRegion();

  if (selected && isPointInRegion(point, selected)) {
    e.preventDefault();

    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    selected.transform.zoom = Math.max(0.25, Math.min(4, selected.transform.zoom + zoomDelta));
    updateInfoPanel();
    updateRegionList();
    saveToStorage();
  }
}

function checkControlButtonClick(pixelPoint, region) {
  const width = elements.canvas.width;
  const height = elements.canvas.height;

  const corners = {
    topLeft: { x: (region.region.topLeft.x / 100) * width, y: (region.region.topLeft.y / 100) * height },
    topRight: { x: (region.region.topRight.x / 100) * width, y: (region.region.topRight.y / 100) * height },
    bottomLeft: { x: (region.region.bottomLeft.x / 100) * width, y: (region.region.bottomLeft.y / 100) * height },
    bottomRight: { x: (region.region.bottomRight.x / 100) * width, y: (region.region.bottomRight.y / 100) * height }
  };

  const centerX = (corners.topLeft.x + corners.topRight.x + corners.bottomLeft.x + corners.bottomRight.x) / 4;
  const centerY = (corners.topLeft.y + corners.topRight.y + corners.bottomLeft.y + corners.bottomRight.y) / 4;

  const buttonRadius = 15;
  const smallRadius = 12;

  // Zoom buttons (top row)
  const zoomY = centerY - 22;
  const distToZoomMinus = Math.sqrt(Math.pow(pixelPoint.x - (centerX - 35), 2) + Math.pow(pixelPoint.y - zoomY, 2));
  const distToZoomPlus = Math.sqrt(Math.pow(pixelPoint.x - (centerX + 35), 2) + Math.pow(pixelPoint.y - zoomY, 2));

  if (distToZoomMinus < buttonRadius) return 'zoom-out';
  if (distToZoomPlus < buttonRadius) return 'zoom-in';

  // Pan buttons (bottom section)
  const panY = centerY + 18;
  const distToPanLeft = Math.sqrt(Math.pow(pixelPoint.x - (centerX - 35), 2) + Math.pow(pixelPoint.y - panY, 2));
  const distToPanRight = Math.sqrt(Math.pow(pixelPoint.x - (centerX + 35), 2) + Math.pow(pixelPoint.y - panY, 2));
  const distToPanUp = Math.sqrt(Math.pow(pixelPoint.x - centerX, 2) + Math.pow(pixelPoint.y - (panY - 15), 2));
  const distToPanDown = Math.sqrt(Math.pow(pixelPoint.x - centerX, 2) + Math.pow(pixelPoint.y - (panY + 15), 2));

  if (distToPanLeft < buttonRadius) return 'pan-left';
  if (distToPanRight < buttonRadius) return 'pan-right';
  if (distToPanUp < smallRadius) return 'pan-up';
  if (distToPanDown < smallRadius) return 'pan-down';

  return null;
}

function getCanvasPoint(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  return {
    x: ((e.clientX - rect.left) * scaleX / elements.canvas.width) * 100,
    y: ((e.clientY - rect.top) * scaleY / elements.canvas.height) * 100
  };
}

function getCanvasPixelPoint(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function findCornerAtPoint(point, region) {
  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
  const threshold = 4;

  for (const corner of corners) {
    const cx = region.region[corner].x;
    const cy = region.region[corner].y;
    const dist = Math.sqrt(Math.pow(point.x - cx, 2) + Math.pow(point.y - cy, 2));
    if (dist <= threshold) {
      return corner;
    }
  }
  return null;
}

function isPointInRegion(point, region) {
  const polygon = [
    region.region.topLeft,
    region.region.topRight,
    region.region.bottomRight,
    region.region.bottomLeft
  ];

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

function moveCorner(region, cornerName, newPosition) {
  region.region[cornerName] = {
    x: clamp(newPosition.x, 0, 100),
    y: clamp(newPosition.y, 0, 100)
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function updateCursor(point, shiftKey) {
  const canvas = elements.canvas;
  const selected = getSelectedRegion();

  if (selected) {
    const corner = findCornerAtPoint(point, selected);
    if (corner) {
      canvas.style.cursor = 'grab';
      return;
    }
  }

  for (let i = state.regions.length - 1; i >= 0; i--) {
    if (isPointInRegion(point, state.regions[i])) {
      canvas.style.cursor = shiftKey ? 'move' : 'grab';
      return;
    }
  }

  canvas.style.cursor = 'default';
}

// ============================================
// UI Updates
// ============================================
function updateRegionList() {
  if (state.regions.length === 0) {
    elements.regionList.innerHTML = '<div class="empty-state">Click + to add your first region</div>';
    return;
  }

  elements.regionList.innerHTML = state.regions.map(region => {
    const isSelected = region.id === state.selectedRegionId;
    const hasArt = region.art && region.art.src;

    return `
      <div class="region-item ${isSelected ? 'selected' : ''}" data-id="${region.id}">
        <div class="region-item-header">
          <div class="region-thumbnail">
            ${hasArt ? `<img src="${region.art.src}" alt="${region.art.name}">` : '<span class="placeholder">?</span>'}
          </div>
          <div class="region-info">
            <div class="region-name">${region.name}</div>
            <div class="region-meta">${hasArt ? region.art.name : 'No art assigned'}</div>
          </div>
          <div class="region-actions">
            <button class="region-action-btn change-art" title="Change art" data-id="${region.id}">🖼</button>
            <button class="region-action-btn delete" title="Delete" data-id="${region.id}">🗑</button>
          </div>
        </div>
        <div class="region-controls">
          <div class="zoom-control">
            <button class="zoom-btn minus" data-id="${region.id}">−</button>
            <span class="zoom-value">${region.transform.zoom.toFixed(1)}x</span>
            <button class="zoom-btn plus" data-id="${region.id}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  elements.regionList.querySelectorAll('.region-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.region-action-btn') && !e.target.closest('.zoom-btn')) {
        selectRegion(item.dataset.id);
      }
    });
  });

  elements.regionList.querySelectorAll('.change-art').forEach(btn => {
    btn.addEventListener('click', () => openArtPicker(btn.dataset.id));
  });

  elements.regionList.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRegion(btn.dataset.id));
  });

  elements.regionList.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const region = state.regions.find(r => r.id === btn.dataset.id);
      if (region) {
        if (btn.classList.contains('plus')) {
          region.transform.zoom = Math.min(4, region.transform.zoom + 0.2);
        } else {
          region.transform.zoom = Math.max(0.25, region.transform.zoom - 0.2);
        }
        updateInfoPanel();
        updateRegionList();
        saveToStorage();
      }
      e.stopPropagation();
    });
  });
}

function updateInfoPanel() {
  const selected = getSelectedRegion();

  if (selected) {
    elements.infoSelected.textContent = selected.name;
    elements.infoZoom.textContent = `${selected.transform.zoom.toFixed(2)}x`;
    elements.infoPan.textContent = `(${Math.round(selected.transform.panX)}, ${Math.round(selected.transform.panY)})`;
  } else {
    elements.infoSelected.textContent = 'None';
    elements.infoZoom.textContent = '-';
    elements.infoPan.textContent = '-';
  }
}

// ============================================
// Art Picker
// ============================================
function openArtPicker(regionId) {
  artPickerState.targetRegionId = regionId;
  artPickerState.selectedSource = null;
  artPickerState.uploadedImage = null;

  elements.uploadPreview.classList.add('hidden');
  elements.urlPreview.classList.add('hidden');
  elements.urlError.classList.add('hidden');
  elements.urlInput.value = '';
  elements.fileInput.value = '';

  elements.galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.remove('selected');
  });

  updateApplyButton();
  elements.artPickerModal.classList.remove('hidden');
}

function closeArtPicker() {
  elements.artPickerModal.classList.add('hidden');
  artPickerState.targetRegionId = null;
}

function updateApplyButton() {
  elements.applyArt.disabled = !artPickerState.selectedSource;
}

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    elements.previewImage.src = dataUrl;
    elements.uploadPreview.classList.remove('hidden');

    artPickerState.selectedSource = {
      type: 'upload',
      src: dataUrl,
      name: file.name
    };
    updateApplyButton();
  };
  reader.readAsDataURL(file);
}

function renderGallery(category) {
  const filtered = category === 'all'
    ? GALLERY_IMAGES
    : GALLERY_IMAGES.filter(img => img.category === category);

  elements.galleryGrid.innerHTML = filtered.map(img => `
    <div class="gallery-item" data-id="${img.id}" data-name="${img.name}" style="background: ${img.color};">
    </div>
  `).join('');

  elements.galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      elements.galleryGrid.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');

      const canvas = generatePatternCanvas(item.style.background, 400, 300);
      artPickerState.selectedSource = {
        type: 'gallery',
        src: canvas.toDataURL(),
        name: item.dataset.name
      };
      updateApplyButton();
    });
  });
}

function generatePatternCanvas(background, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (background.includes('gradient')) {
    const matches = background.match(/#[0-9a-fA-F]{6}/g);
    if (matches && matches.length >= 2) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, matches[0]);
      gradient.addColorStop(1, matches[1]);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = '#4a5568';
    }
  } else {
    ctx.fillStyle = background;
  }

  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function loadImageFromUrl() {
  const url = elements.urlInput.value.trim();
  if (!url) return;

  elements.urlError.classList.add('hidden');

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    elements.urlPreviewImage.src = url;
    elements.urlPreview.classList.remove('hidden');

    artPickerState.selectedSource = {
      type: 'url',
      src: url,
      name: url.split('/').pop() || 'URL Image'
    };
    updateApplyButton();
  };

  img.onerror = () => {
    elements.urlError.textContent = 'Failed to load image. Check the URL or CORS policy.';
    elements.urlError.classList.remove('hidden');
  };

  img.src = url;
}

function applySelectedArt() {
  const region = state.regions.find(r => r.id === artPickerState.targetRegionId);
  if (!region || !artPickerState.selectedSource) return;

  region.art = {
    src: artPickerState.selectedSource.src,
    name: artPickerState.selectedSource.name,
    contentType: 'image'
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.artSources.set(region.id, img);
  };
  img.src = artPickerState.selectedSource.src;

  updateRegionList();
  saveToStorage();
  closeArtPicker();
}

// ============================================
// Storage
// ============================================
function saveToStorage() {
  const data = {
    regions: state.regions.map(r => ({
      ...r,
      art: r.art ? { ...r.art } : null
    }))
  };
  localStorage.setItem('multiRegionArt', JSON.stringify(data));
}

function loadFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem('multiRegionArt'));
    if (data && data.regions) {
      state.regions = data.regions;

      for (const region of state.regions) {
        if (region.art && region.art.src) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            state.artSources.set(region.id, img);
          };
          img.src = region.art.src;
        }
      }

      updateRegionList();
    }
  } catch (e) {
    console.warn('Failed to load from storage:', e);
  }
}

// ============================================
// Helpers
// ============================================
function showLoading(text) {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove('hidden');
}

// Start app
init();
