/**
 * Shared utility functions for transition effects.
 */

// ============================================
// Easing
// ============================================

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ============================================
// Contour Extraction
// ============================================

/**
 * Extract person boundary contour from segmentation mask.
 * Left/right edge scan per row, with moving-average smoothing.
 */
export function extractContour(mask, maskW, maskH, canvasW, canvasH) {
  const scaleX = canvasW / maskW;
  const scaleY = canvasH / maskH;

  const rawLeft = [];
  const rawRight = [];

  for (let y = 0; y < maskH; y++) {
    let leftX = -1;
    let rightX = -1;

    for (let x = 0; x < maskW; x++) {
      if (mask[y * maskW + x] === 0) {
        if (leftX === -1) leftX = x;
        rightX = x;
      }
    }

    if (leftX !== -1) {
      rawLeft.push({ x: leftX, y });
      rawRight.push({ x: rightX, y });
    }
  }

  if (rawLeft.length < 5) return [];

  const smooth = (arr, key) => {
    const w = 3;
    return arr.map((p, i) => {
      let sum = 0;
      let count = 0;
      for (
        let j = Math.max(0, i - w);
        j <= Math.min(arr.length - 1, i + w);
        j++
      ) {
        sum += arr[j][key];
        count++;
      }
      return sum / count;
    });
  };

  const smoothedLeftX = smooth(rawLeft, 'x');
  const smoothedRightX = smooth(rawRight, 'x');

  const step = 2;
  const leftEdges = [];
  const rightEdges = [];

  for (let i = 0; i < rawLeft.length; i += step) {
    leftEdges.push({
      x: smoothedLeftX[i] * scaleX,
      y: rawLeft[i].y * scaleY,
    });
    rightEdges.push({
      x: smoothedRightX[i] * scaleX,
      y: rawRight[i].y * scaleY,
    });
  }

  const points = [];
  for (const p of leftEdges) points.push(p);
  for (let i = rightEdges.length - 1; i >= 0; i--) {
    points.push(rightEdges[i]);
  }

  return points;
}

// ============================================
// Mask Overlay Renderer
// ============================================

export function renderMaskOverlay(
  mask, maskW, maskH, canvasW, canvasH
) {
  const offscreen = new OffscreenCanvas(canvasW, canvasH);
  const ctx = offscreen.getContext('2d');

  const imgData = ctx.createImageData(canvasW, canvasH);
  const data = imgData.data;
  const scaleX = maskW / canvasW;
  const scaleY = maskH / canvasH;

  for (let y = 0; y < canvasH; y++) {
    const my = Math.floor(y * scaleY);
    for (let x = 0; x < canvasW; x++) {
      const mx = Math.floor(x * scaleX);
      if (mask[my * maskW + mx] === 0) {
        const i = (y * canvasW + x) * 4;
        data[i] = 0;
        data[i + 1] = 255;
        data[i + 2] = 65;
        data[i + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return offscreen;
}

// ============================================
// Inline Sobel Edge Detection (green-tinted)
// ============================================

export function sobelEdgeDetect(sourceCanvas, width, height) {
  const offscreen = new OffscreenCanvas(width, height);
  const offCtx = offscreen.getContext('2d');
  offCtx.drawImage(sourceCanvas, 0, 0, width, height);
  const imageData = offCtx.getImageData(0, 0, width, height);
  const src = imageData.data;

  const output = offCtx.createImageData(width, height);
  const dst = output.data;

  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] =
      (src[j] * 77 + src[j + 1] * 150 + src[j + 2] * 29) >> 8;
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -gray[idx - width - 1] +
        gray[idx - width + 1] +
        -2 * gray[idx - 1] +
        2 * gray[idx + 1] +
        -gray[idx + width - 1] +
        gray[idx + width + 1];
      const gy =
        -gray[idx - width - 1] -
        2 * gray[idx - width] -
        gray[idx - width + 1] +
        gray[idx + width - 1] +
        2 * gray[idx + width] +
        gray[idx + width + 1];

      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      const di = idx * 4;
      dst[di] = 0;
      dst[di + 1] = mag;
      dst[di + 2] = Math.floor(mag * 0.25);
      dst[di + 3] = 255;
    }
  }

  offCtx.putImageData(output, 0, 0);
  return offscreen;
}
