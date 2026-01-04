/**
 * Canvas rendering utilities for overlay compositing.
 * Extracted for testability - same logic used in inject.js
 */

import { fitImageInBox, sortOverlaysByLayer } from './overlay-utils.js';

/**
 * Draw an overlay image onto a canvas context with proper positioning,
 * mirroring, and opacity.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} overlay - Overlay configuration {x, y, width, height, opacity}
 * @param {HTMLImageElement|ImageBitmap} img - Image to draw
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.mirror] - Whether to mirror for Meet self-view (default: true)
 */
export function drawOverlay(ctx, overlay, img, canvasWidth, canvasHeight, options = {}) {
  const { mirror = true } = options;

  if (!img || !img.width || !img.height) {
    return;
  }

  // Calculate the target box size from overlay percentages
  const boxW = (overlay.width / 100) * canvasWidth;
  const boxH = (overlay.height / 100) * canvasHeight;

  // Preserve image aspect ratio (fit within box)
  const { width: w, height: h } = fitImageInBox(img.width, img.height, boxW, boxH);

  // Calculate position
  const y = (overlay.y / 100) * canvasHeight;
  let x;
  if (mirror) {
    // Mirror the x-position so it appears where user intended after Meet mirrors
    x = canvasWidth - ((overlay.x / 100) * canvasWidth) - w;
  } else {
    x = (overlay.x / 100) * canvasWidth;
  }

  // Apply opacity (default to 1 if not set)
  const opacity = overlay.opacity !== undefined ? overlay.opacity : 1;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (mirror) {
    // Flip the image horizontally so it appears correct after Meet's mirror
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(img, x, y, w, h);
  }

  ctx.restore();
}

/**
 * Render all overlays onto a canvas.
 * Overlays are sorted by layer (background first, then foreground) and zIndex.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array} overlays - Array of overlay configurations
 * @param {Map} overlayImages - Map of overlay.id -> Image
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Object} options - Rendering options
 */
export function renderOverlays(ctx, overlays, overlayImages, canvasWidth, canvasHeight, options = {}) {
  // Sort overlays by layer and zIndex for correct rendering order
  const sortedOverlays = sortOverlaysByLayer(overlays);

  sortedOverlays.forEach(overlay => {
    const img = overlayImages.get(overlay.id);
    // Check for valid image - support both Image elements (have .complete) and Canvas elements
    const isValidImage = img && img.width > 0 && (img.complete !== false);
    if (isValidImage) {
      drawOverlay(ctx, overlay, img, canvasWidth, canvasHeight, options);
    }
  });
}

/**
 * Get the average alpha value of pixels in a region of the canvas.
 * Useful for testing opacity.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Start x
 * @param {number} y - Start y
 * @param {number} width - Region width
 * @param {number} height - Region height
 * @returns {number} Average alpha value (0-255)
 */
export function getRegionAlpha(ctx, x, y, width, height) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;

  let totalAlpha = 0;
  let pixelCount = 0;

  // Alpha is every 4th value (RGBA)
  for (let i = 3; i < data.length; i += 4) {
    totalAlpha += data[i];
    pixelCount++;
  }

  return totalAlpha / pixelCount;
}

/**
 * Check if a region has been drawn on (non-transparent).
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Start x
 * @param {number} y - Start y
 * @param {number} width - Region width
 * @param {number} height - Region height
 * @returns {boolean} True if region has non-transparent pixels
 */
export function hasContentInRegion(ctx, x, y, width, height) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;

  // Check if any pixel has alpha > 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Get color values at a specific pixel.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {{r: number, g: number, b: number, a: number}} RGBA values
 */
export function getPixelColor(ctx, x, y) {
  const imageData = ctx.getImageData(x, y, 1, 1);
  const [r, g, b, a] = imageData.data;
  return { r, g, b, a };
}
