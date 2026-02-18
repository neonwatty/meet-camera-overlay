/**
 * Segmentation Mask Utilities
 *
 * Functions for converting, applying, and building person segmentation masks.
 * Used by WallArtSegmenter and the wall art rendering pipeline.
 */

/**
 * Convert MediaPipe segmentation result to RGBA ImageData.
 * Category mask has 0=background, 1=person.
 *
 * @param {Object} result - MediaPipe segmentation result
 * @param {HTMLVideoElement|HTMLCanvasElement} source - Original source for dimensions
 * @param {Object} maskState - Mutable state: { canvas, width, height }
 * @returns {ImageData} Person mask as ImageData
 */
function convertResultToImageData(result, source, maskState) {
  const width = /** @type {HTMLVideoElement} */ (source).videoWidth || source.width;
  const height = /** @type {HTMLVideoElement} */ (source).videoHeight || source.height;

  if (!maskState.canvas || maskState.width !== width || maskState.height !== height) {
    maskState.canvas = new OffscreenCanvas(width, height);
    maskState.width = width;
    maskState.height = height;
  }

  const ctx = maskState.canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  if (!result || !result.categoryMask) {
    return ctx.getImageData(0, 0, width, height);
  }

  const categoryMask = result.categoryMask;

  let maskData;
  if (categoryMask.getAsUint8Array) {
    maskData = categoryMask.getAsUint8Array();
  } else if (categoryMask.getAsFloat32Array) {
    const floatData = categoryMask.getAsFloat32Array();
    maskData = new Uint8Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      maskData[i] = Math.round(floatData[i] * 255);
    }
  }

  if (!maskData) {
    return ctx.getImageData(0, 0, width, height);
  }

  const maskWidth = categoryMask.width;
  const maskHeight = categoryMask.height;

  const imageData = ctx.createImageData(maskWidth, maskHeight);
  const data = imageData.data;

  for (let i = 0; i < maskData.length; i++) {
    const idx = i * 4;
    if (maskData[i] === 1) {
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  if (maskWidth === width && maskHeight === height) {
    return imageData;
  }

  const tempCanvas = new OffscreenCanvas(maskWidth, maskHeight);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);

  ctx.drawImage(tempCanvas, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Apply a person mask to a canvas context.
 * Cuts out (makes transparent) the areas where people are.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {ImageData} mask - Person mask (white = person, black = background)
 */
function applyMaskCutout(ctx, mask) {
  if (!mask) return;

  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;

  const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.putImageData(mask, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  ctx.restore();
}

/**
 * Apply mask with smooth edges (feathering).
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {ImageData} mask - Person mask
 * @param {number} featherRadius - Blur radius for feathering (px)
 */
function applyMaskWithFeathering(ctx, mask, featherRadius = 2) {
  if (!mask) return;

  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;

  const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.putImageData(mask, 0, 0);

  if (featherRadius > 0) {
    maskCtx.filter = `blur(${featherRadius}px)`;
    maskCtx.drawImage(maskCanvas, 0, 0);
    maskCtx.filter = 'none';
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  ctx.restore();
}

/**
 * Build an average mask from multiple segmentation results.
 *
 * @param {Array<ImageData>} masks - Array of masks to average
 * @returns {ImageData|null} Averaged mask
 */
function buildAverageMask(masks) {
  if (!masks || masks.length === 0) return null;

  const width = masks[0].width;
  const height = masks[0].height;
  const avgData = new Uint8ClampedArray(width * height * 4);

  for (const mask of masks) {
    const data = mask.data;
    for (let i = 0; i < data.length; i++) {
      avgData[i] += data[i] / masks.length;
    }
  }

  return new ImageData(avgData, width, height);
}

/**
 * Check if the browser supports the required features for segmentation.
 *
 * @returns {{supported: boolean, reason: string|null}}
 */
function checkSegmentationSupport() {
  if (typeof WebAssembly === 'undefined') {
    return {
      supported: false,
      reason: 'WebAssembly is not supported. Person segmentation requires WebAssembly.'
    };
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  if (!gl) {
    return {
      supported: false,
      reason: 'WebGL is not supported. Person segmentation requires WebGL.'
    };
  }

  if (typeof OffscreenCanvas === 'undefined') {
    return {
      supported: false,
      reason: 'OffscreenCanvas is not supported. Please update your browser.'
    };
  }

  return { supported: true, reason: null };
}

// Export for use in wall-segmentation.js
if (typeof window !== 'undefined') {
  window._SegmentationMask = {
    convertResultToImageData,
    applyMaskCutout,
    applyMaskWithFeathering,
    buildAverageMask,
    checkSegmentationSupport
  };
}
