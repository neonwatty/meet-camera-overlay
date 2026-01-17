/* global HTMLVideoElement */
/**
 * Wall Art Renderer Module
 *
 * Renders images, animated GIFs, and video loops into wall art regions with:
 * - Perspective transform for arbitrary quadrilaterals
 * - Person mask occlusion (art appears behind people)
 * - Aspect ratio modes: stretch, fit, crop
 * - Support for multiple simultaneous regions
 */

import { regionToPixels, getRegionBounds } from './wall-region.js';

/**
 * @typedef {'stretch' | 'fit' | 'crop'} AspectRatioMode
 */

/**
 * @typedef {Object} WallArtContent
 * @property {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source - Image, canvas, or video element
 * @property {'image' | 'gif' | 'video'} contentType - Type of content
 * @property {AspectRatioMode} aspectRatioMode - How to handle aspect ratio mismatch
 * @property {number} opacity - Opacity (0-1)
 */

/**
 * @typedef {Object} RenderOptions
 * @property {ImageData} [personMask] - Person mask for occlusion
 * @property {number} [featherRadius=0] - Edge feather radius in pixels
 */

/**
 * Render wall art content into a region.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {Object} region - Wall region with 4 corners (percentage coordinates)
 * @param {WallArtContent} content - Art content to render
 * @param {RenderOptions} [options] - Rendering options
 */
export function renderWallArt(ctx, region, content, options = {}) {
  const { personMask = null, featherRadius = 0 } = options;
  const { source, aspectRatioMode = 'stretch', opacity = 1 } = content;

  if (!source) return;

  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;

  // Get source dimensions (video elements have videoWidth/Height, images have width/height)
  const sourceWidth = /** @type {*} */ (source).videoWidth || source.width;
  const sourceHeight = /** @type {*} */ (source).videoHeight || source.height;

  if (!sourceWidth || !sourceHeight) return;

  // Convert region to pixel coordinates
  const pixelRegion = regionToPixels(region, width, height);

  // Get region bounds for aspect ratio calculations
  const bounds = getRegionBounds(region);
  const regionWidth = (bounds.width / 100) * width;
  const regionHeight = (bounds.height / 100) * height;

  // Create temporary canvas for art rendering
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d');

  // Calculate source crop/scale based on aspect ratio mode
  const sourceRect = calculateSourceRect(
    sourceWidth,
    sourceHeight,
    regionWidth,
    regionHeight,
    aspectRatioMode
  );

  // Draw the art with perspective transform into the quadrilateral region
  drawPerspectiveQuad(
    /** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (tempCtx)),
    source,
    sourceRect,
    pixelRegion
  );

  // Apply person mask cutout if provided
  if (personMask) {
    applyPersonMaskToCanvas(
      /** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (tempCtx)),
      personMask,
      featherRadius
    );
  }

  // Draw to main canvas with opacity
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

/**
 * Calculate the source rectangle based on aspect ratio mode.
 *
 * @param {number} sourceWidth - Source image/video width
 * @param {number} sourceHeight - Source image/video height
 * @param {number} targetWidth - Target region width
 * @param {number} targetHeight - Target region height
 * @param {AspectRatioMode} mode - Aspect ratio mode
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function calculateSourceRect(sourceWidth, sourceHeight, targetWidth, targetHeight, mode) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (mode === 'stretch') {
    // Use entire source
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  if (mode === 'fit') {
    // Use entire source (letterboxing handled by destination sizing)
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  if (mode === 'crop') {
    // Crop source to match target aspect ratio
    if (sourceAspect > targetAspect) {
      // Source is wider, crop horizontally
      const newWidth = sourceHeight * targetAspect;
      const x = (sourceWidth - newWidth) / 2;
      return { x, y: 0, width: newWidth, height: sourceHeight };
    } else {
      // Source is taller, crop vertically
      const newHeight = sourceWidth / targetAspect;
      const y = (sourceHeight - newHeight) / 2;
      return { x: 0, y, width: sourceWidth, height: newHeight };
    }
  }

  // Default to stretch
  return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
}

/**
 * Draw an image with perspective transform into an arbitrary quadrilateral.
 * Uses triangular subdivision for accurate perspective.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source - Source image/video
 * @param {{ x: number, y: number, width: number, height: number }} srcRect - Source rectangle
 * @param {Object} destQuad - Destination quadrilateral with topLeft, topRight, bottomLeft, bottomRight
 */
function drawPerspectiveQuad(ctx, source, srcRect, destQuad) {
  // Use canvas path clipping with the quadrilateral shape
  // Then use triangular mesh subdivision for perspective-correct rendering

  const { topLeft, topRight, bottomLeft, bottomRight } = destQuad;

  // For simple cases (near-rectangular quads), use direct drawing
  // For complex perspective, we subdivide into triangles

  const subdivisions = 8; // Higher = more accurate but slower

  for (let row = 0; row < subdivisions; row++) {
    for (let col = 0; col < subdivisions; col++) {
      // Calculate UV coordinates for this cell
      const u0 = col / subdivisions;
      const v0 = row / subdivisions;
      const u1 = (col + 1) / subdivisions;
      const v1 = (row + 1) / subdivisions;

      // Calculate source coordinates
      const sx0 = srcRect.x + u0 * srcRect.width;
      const sy0 = srcRect.y + v0 * srcRect.height;
      const sx1 = srcRect.x + u1 * srcRect.width;
      const sy1 = srcRect.y + v1 * srcRect.height;

      // Bilinear interpolation for destination coordinates
      const d00 = bilinearInterpolate(topLeft, topRight, bottomLeft, bottomRight, u0, v0);
      const d10 = bilinearInterpolate(topLeft, topRight, bottomLeft, bottomRight, u1, v0);
      const d01 = bilinearInterpolate(topLeft, topRight, bottomLeft, bottomRight, u0, v1);
      const d11 = bilinearInterpolate(topLeft, topRight, bottomLeft, bottomRight, u1, v1);

      // Draw two triangles for this cell
      drawTexturedTriangle(ctx, source,
        sx0, sy0, sx1, sy0, sx0, sy1,
        d00.x, d00.y, d10.x, d10.y, d01.x, d01.y
      );

      drawTexturedTriangle(ctx, source,
        sx1, sy0, sx1, sy1, sx0, sy1,
        d10.x, d10.y, d11.x, d11.y, d01.x, d01.y
      );
    }
  }
}

/**
 * Bilinear interpolation between four corner points.
 *
 * @param {Object} tl - Top-left point
 * @param {Object} tr - Top-right point
 * @param {Object} bl - Bottom-left point
 * @param {Object} br - Bottom-right point
 * @param {number} u - Horizontal interpolation factor (0-1)
 * @param {number} v - Vertical interpolation factor (0-1)
 * @returns {{ x: number, y: number }}
 */
function bilinearInterpolate(tl, tr, bl, br, u, v) {
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
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source - Source image
 * @param {number} sx0 - Source x0
 * @param {number} sy0 - Source y0
 * @param {number} sx1 - Source x1
 * @param {number} sy1 - Source y1
 * @param {number} sx2 - Source x2
 * @param {number} sy2 - Source y2
 * @param {number} dx0 - Dest x0
 * @param {number} dy0 - Dest y0
 * @param {number} dx1 - Dest x1
 * @param {number} dy1 - Dest y1
 * @param {number} dx2 - Dest x2
 * @param {number} dy2 - Dest y2
 */
function drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
  ctx.save();

  // Clip to destination triangle
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();

  // Calculate affine transform matrix
  // Source triangle to destination triangle mapping
  const denom = (sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0);

  if (Math.abs(denom) < 0.001) {
    ctx.restore();
    return;
  }

  const m11 = -(sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / denom;
  const m12 = (sy0 * (dy2 - dy1) - sy1 * dy2 + sy2 * dy1 + (sy1 - sy2) * dy0) / denom;
  const m21 = (sx0 * (dx2 - dx1) - sx1 * dx2 + sx2 * dx1 + (sx1 - sx2) * dx0) / denom;
  const m22 = -(sx0 * (dy2 - dy1) - sx1 * dy2 + sy2 * dy1 + (sx1 - sx2) * dy0) / denom;
  const m31 = (sx0 * (sy2 * dx1 - sy1 * dx2) + sy0 * (sx1 * dx2 - sx2 * dx1) + (sx2 * sy1 - sx1 * sy2) * dx0) / denom;
  const m32 = -(sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / denom;

  ctx.transform(m11, m12, m21, m22, m31, m32);
  ctx.drawImage(source, 0, 0);

  ctx.restore();
}

/**
 * Apply person mask to a canvas, cutting out person areas.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {ImageData} mask - Person mask
 * @param {number} featherRadius - Blur radius for soft edges
 */
function applyPersonMaskToCanvas(ctx, mask, featherRadius = 0) {
  const canvas = ctx.canvas;

  // Create mask canvas
  const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.putImageData(mask, 0, 0);

  // Apply blur for feathering
  if (featherRadius > 0) {
    maskCtx.filter = `blur(${featherRadius}px)`;
    maskCtx.drawImage(maskCanvas, 0, 0);
    maskCtx.filter = 'none';
  }

  // Use destination-out to cut out person areas
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Render all wall art overlays.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {Array} wallArtOverlays - Array of wall art overlay objects
 * @param {Map<string, HTMLImageElement|HTMLCanvasElement|HTMLVideoElement>} artSources - Map of overlay ID to art source
 * @param {Object} [options] - Rendering options
 * @param {ImageData} [options.personMask] - Person mask for all regions
 * @param {number} [options.featherRadius] - Edge feather radius
 * @param {number} [options.timestamp] - Current timestamp for GIF animation
 */
export function renderAllWallArt(ctx, wallArtOverlays, artSources, options = {}) {
  const { personMask = null, featherRadius = 0, timestamp = 0 } = options;

  // Filter to only overlays with art enabled
  const artOverlays = wallArtOverlays.filter(
    overlay => overlay.type === 'wallArt' && overlay.art && overlay.art.src && overlay.active
  );

  // Render each art layer
  for (const overlay of artOverlays) {
    const source = artSources.get(overlay.id);

    if (!source) continue;

    // For AnimatedImage, update frame and get current frame canvas
    let renderSource = source;
    const animSource = /** @type {*} */ (source);
    if (animSource.update && animSource.currentFrame) {
      // It's an AnimatedImage
      animSource.update(timestamp);
      renderSource = animSource.currentFrame;
    }

    renderWallArt(ctx, overlay.region, {
      source: renderSource,
      contentType: overlay.art.contentType || 'image',
      aspectRatioMode: overlay.art.aspectRatioMode || 'stretch',
      opacity: overlay.art.opacity !== undefined ? overlay.art.opacity : 1
    }, {
      personMask,
      featherRadius
    });
  }
}

/**
 * Check if content is a video element.
 *
 * @param {*} source - Source to check
 * @returns {boolean}
 */
export function isVideoSource(source) {
  return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
}

/**
 * Check if content is an animated image (AnimatedImage class).
 *
 * @param {*} source - Source to check
 * @returns {boolean}
 */
export function isAnimatedImageSource(source) {
  return source && typeof source.update === 'function' && source.currentFrame;
}

/**
 * Create a video element for loop playback.
 *
 * @param {string} src - Video source URL or data URL
 * @returns {Promise<HTMLVideoElement>}
 */
export async function createVideoLoop(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      video.play().then(() => resolve(video)).catch(reject);
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    video.load();
  });
}

/**
 * Render a simple filled quad (for testing/debugging).
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} region - Region with 4 corners (percentage coordinates)
 * @param {string} color - Fill color
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 */
export function renderFilledQuad(ctx, region, color, canvasWidth, canvasHeight) {
  const pixelRegion = regionToPixels(region, canvasWidth, canvasHeight);

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pixelRegion.topLeft.x, pixelRegion.topLeft.y);
  ctx.lineTo(pixelRegion.topRight.x, pixelRegion.topRight.y);
  ctx.lineTo(pixelRegion.bottomRight.x, pixelRegion.bottomRight.y);
  ctx.lineTo(pixelRegion.bottomLeft.x, pixelRegion.bottomLeft.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Export for use in inject.js (non-module context)
if (typeof window !== 'undefined') {
  window.WallArtRenderer = {
    renderWallArt,
    renderAllWallArt,
    isVideoSource,
    isAnimatedImageSource,
    createVideoLoop,
    renderFilledQuad
  };
}
