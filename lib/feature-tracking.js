/**
 * Feature Tracking Module
 *
 * Pure computer vision algorithms for feature point detection and tracking.
 * Harris corner detection for feature points, Lucas-Kanade style optical flow.
 */

/**
 * Configuration constants for feature tracking
 */
const CONFIG = {
  // Feature detection
  MAX_FEATURES: 50,
  HARRIS_K: 0.04,
  CORNER_THRESHOLD: 0.01,
  MIN_DISTANCE: 20,

  // Tracking
  SEARCH_WINDOW: 15,
  MAX_ITERATIONS: 10,
  CONVERGENCE_THRESHOLD: 0.1,

  // Motion detection
  LARGE_MOTION_THRESHOLD: 20,
  DRIFT_THRESHOLD: 50,

  // Performance
  DOWNSAMPLE_FACTOR: 4,
  SKIP_FRAMES: 2
};

/**
 * Convert ImageData to grayscale
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
function toGrayscale(imageData) {
  const gray = new ImageData(imageData.width, imageData.height);
  const src = imageData.data;
  const dst = gray.data;

  for (let i = 0; i < src.length; i += 4) {
    const g = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
    dst[i] = dst[i + 1] = dst[i + 2] = g;
    dst[i + 3] = 255;
  }

  return gray;
}

/**
 * Downsample a person mask
 * @param {ImageData} mask
 * @param {number} origWidth
 * @param {number} origHeight
 * @param {number} dw - Downsampled width
 * @param {number} dh - Downsampled height
 * @returns {Uint8Array}
 */
function downsampleMask(mask, origWidth, origHeight, dw, dh) {
  const downsampled = new Uint8Array(dw * dh);

  const scaleX = origWidth / dw;
  const scaleY = origHeight / dh;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * origWidth + srcX) * 4;
      downsampled[y * dw + x] = mask.data[srcIdx] > 128 ? 255 : 0;
    }
  }

  return downsampled;
}

/**
 * Detect Harris corners as feature points
 * @param {ImageData} grayFrame
 * @param {Uint8Array|null} personMask
 * @returns {Array<{x: number, y: number, response: number}>}
 */
function detectFeatures(grayFrame, personMask = null) {
  const w = grayFrame.width;
  const h = grayFrame.height;
  const data = grayFrame.data;

  // Compute gradients
  const Ix = new Float32Array(w * h);
  const Iy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      Ix[idx] = (data[((y) * w + (x + 1)) * 4] - data[((y) * w + (x - 1)) * 4]) / 2;
      Iy[idx] = (data[((y + 1) * w + x) * 4] - data[((y - 1) * w + x) * 4]) / 2;
    }
  }

  // Compute Harris response
  const responses = [];
  const windowSize = 3;

  for (let y = windowSize; y < h - windowSize; y += 3) {
    for (let x = windowSize; x < w - windowSize; x += 3) {
      if (personMask && personMask[y * w + x] > 128) {
        continue;
      }

      let sumIx2 = 0, sumIy2 = 0, sumIxIy = 0;

      for (let wy = -windowSize; wy <= windowSize; wy++) {
        for (let wx = -windowSize; wx <= windowSize; wx++) {
          const idx = (y + wy) * w + (x + wx);
          const ix = Ix[idx];
          const iy = Iy[idx];
          sumIx2 += ix * ix;
          sumIy2 += iy * iy;
          sumIxIy += ix * iy;
        }
      }

      const det = sumIx2 * sumIy2 - sumIxIy * sumIxIy;
      const trace = sumIx2 + sumIy2;
      const response = det - CONFIG.HARRIS_K * trace * trace;

      if (response > CONFIG.CORNER_THRESHOLD) {
        responses.push({ x, y, response });
      }
    }
  }

  // Sort by response and take top features with non-maximum suppression
  responses.sort((a, b) => b.response - a.response);

  const features = [];
  for (const r of responses) {
    if (features.length >= CONFIG.MAX_FEATURES) break;

    let tooClose = false;
    for (const f of features) {
      const dist = Math.sqrt((r.x - f.x) ** 2 + (r.y - f.y) ** 2);
      if (dist < CONFIG.MIN_DISTANCE / CONFIG.DOWNSAMPLE_FACTOR) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      features.push(r);
    }
  }

  return features;
}

/**
 * Track features using Lucas-Kanade optical flow
 * @param {ImageData} prevFrame
 * @param {ImageData} currFrame
 * @param {Array<{x: number, y: number, response: number}>} features
 * @returns {{trackedPoints: Array, lostCount: number}}
 */
function trackFeatures(prevFrame, currFrame, features) {
  const w = prevFrame.width;
  const h = prevFrame.height;
  const prevData = prevFrame.data;
  const currData = currFrame.data;

  const trackedPoints = [];
  let lostCount = 0;

  for (const feature of features) {
    const { x: fx, y: fy } = feature;
    const win = CONFIG.SEARCH_WINDOW;

    if (fx < win || fx >= w - win || fy < win || fy >= h - win) {
      lostCount++;
      continue;
    }

    let dx = 0, dy = 0;

    for (let iter = 0; iter < CONFIG.MAX_ITERATIONS; iter++) {
      let sumIx2 = 0, sumIy2 = 0, sumIxIy = 0;
      let sumIxIt = 0, sumIyIt = 0;

      const nx = fx + dx;
      const ny = fy + dy;

      if (nx < win || nx >= w - win || ny < win || ny >= h - win) {
        break;
      }

      for (let wy = -win; wy <= win; wy++) {
        for (let wx = -win; wx <= win; wx++) {
          const px = Math.floor(fx + wx);
          const py = Math.floor(fy + wy);
          const cx = Math.floor(nx + wx);
          const cy = Math.floor(ny + wy);

          const prevIdx = (py * w + px) * 4;
          const currIdx = (cy * w + cx) * 4;

          const iX = (prevData[(py * w + px + 1) * 4] - prevData[(py * w + px - 1) * 4]) / 2;
          const iY = (prevData[((py + 1) * w + px) * 4] - prevData[((py - 1) * w + px) * 4]) / 2;
          const iT = currData[currIdx] - prevData[prevIdx];

          sumIx2 += iX * iX;
          sumIy2 += iY * iY;
          sumIxIy += iX * iY;
          sumIxIt += iX * iT;
          sumIyIt += iY * iT;
        }
      }

      const det = sumIx2 * sumIy2 - sumIxIy * sumIxIy;
      if (Math.abs(det) < 1e-6) break;

      const vx = -(sumIy2 * sumIxIt - sumIxIy * sumIyIt) / det;
      const vy = -(sumIx2 * sumIyIt - sumIxIy * sumIxIt) / det;

      dx += vx;
      dy += vy;

      if (Math.abs(vx) < CONFIG.CONVERGENCE_THRESHOLD && Math.abs(vy) < CONFIG.CONVERGENCE_THRESHOLD) {
        break;
      }
    }

    const newX = fx + dx;
    const newY = fy + dy;

    if (newX >= 0 && newX < w && newY >= 0 && newY < h && Math.abs(dx) < win && Math.abs(dy) < win) {
      trackedPoints.push({ x: newX, y: newY, response: feature.response });
    } else {
      lostCount++;
    }
  }

  return { trackedPoints, lostCount };
}

/**
 * Compute translation transform from point correspondences using median
 * @param {Array} prevFeatures
 * @param {Array} currFeatures
 * @returns {{dx: number, dy: number, scale: number, rotation: number}}
 */
function computeTransform(prevFeatures, currFeatures) {
  if (prevFeatures.length !== currFeatures.length || prevFeatures.length === 0) {
    return { dx: 0, dy: 0, scale: 1, rotation: 0 };
  }

  const dxs = [];
  const dys = [];

  for (let i = 0; i < prevFeatures.length; i++) {
    dxs.push(currFeatures[i].x - prevFeatures[i].x);
    dys.push(currFeatures[i].y - prevFeatures[i].y);
  }

  dxs.sort((a, b) => a - b);
  dys.sort((a, b) => a - b);

  const medianIdx = Math.floor(dxs.length / 2);

  return {
    dx: dxs[medianIdx],
    dy: dys[medianIdx],
    scale: 1,
    rotation: 0
  };
}

// Export for use in jiggle-compensator.js
if (typeof window !== 'undefined') {
  window._FeatureTracking = {
    CONFIG,
    toGrayscale,
    downsampleMask,
    detectFeatures,
    trackFeatures,
    computeTransform
  };
}

// Also export for module systems
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  // eslint-disable-next-line no-undef
  module.exports = { CONFIG, toGrayscale, downsampleMask, detectFeatures, trackFeatures, computeTransform };
}
