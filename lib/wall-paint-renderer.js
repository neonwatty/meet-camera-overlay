/**
 * Wall Paint Renderer Module
 *
 * Renders solid color fills into wall art regions with:
 * - Perspective transform for arbitrary quadrilaterals
 * - Opacity control
 * - Person mask cutout support
 */

import { regionToPixels } from './wall-region.js';

/**
 * Render a solid color paint fill into a region.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {Object} region - Wall region with 4 corners (percentage coordinates)
 * @param {string} color - Fill color (hex or CSS color)
 * @param {Object} [options] - Rendering options
 * @param {number} [options.opacity=1] - Fill opacity (0-1)
 * @param {ImageData} [options.personMask] - Person mask for cutout (optional)
 * @param {number} [options.featherRadius=0] - Edge feather radius in pixels
 */
export function renderWallPaint(ctx, region, color, options = {}) {
  const { opacity = 1, personMask = null, featherRadius = 0 } = options;

  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;

  // Convert region to pixel coordinates
  const pixelRegion = regionToPixels(region, width, height);

  ctx.save();

  // Set opacity
  ctx.globalAlpha = opacity;

  // Create path for the quadrilateral region
  ctx.beginPath();
  ctx.moveTo(pixelRegion.topLeft.x, pixelRegion.topLeft.y);
  ctx.lineTo(pixelRegion.topRight.x, pixelRegion.topRight.y);
  ctx.lineTo(pixelRegion.bottomRight.x, pixelRegion.bottomRight.y);
  ctx.lineTo(pixelRegion.bottomLeft.x, pixelRegion.bottomLeft.y);
  ctx.closePath();

  // Fill with color
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();

  // Apply person mask cutout if provided
  if (personMask) {
    applyPersonMaskCutout(ctx, personMask, featherRadius);
  }
}

/**
 * Render wall paint with perspective transform.
 * For more accurate rendering into non-rectangular regions.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {Object} region - Wall region with 4 corners
 * @param {string} color - Fill color
 * @param {Object} [options] - Rendering options
 */
export function renderWallPaintPerspective(ctx, region, color, options = {}) {
  const { opacity = 1, personMask = null, featherRadius = 0 } = options;

  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;

  // Convert region to pixel coordinates
  const pixelRegion = regionToPixels(region, width, height);

  // Create temporary canvas for the paint
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d');

  // Fill the quadrilateral on temp canvas
  tempCtx.beginPath();
  tempCtx.moveTo(pixelRegion.topLeft.x, pixelRegion.topLeft.y);
  tempCtx.lineTo(pixelRegion.topRight.x, pixelRegion.topRight.y);
  tempCtx.lineTo(pixelRegion.bottomRight.x, pixelRegion.bottomRight.y);
  tempCtx.lineTo(pixelRegion.bottomLeft.x, pixelRegion.bottomLeft.y);
  tempCtx.closePath();
  tempCtx.fillStyle = color;
  tempCtx.fill();

  // Apply feathering if specified
  if (featherRadius > 0) {
    applyEdgeFeathering(/** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (tempCtx)), pixelRegion, featherRadius);
  }

  // Apply person mask cutout if provided
  if (personMask) {
    applyPersonMaskToTemp(/** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (tempCtx)), personMask);
  }

  // Draw to main canvas with opacity
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

/**
 * Apply person mask cutout to the main canvas.
 * Removes pixels where the person is detected.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {ImageData} mask - Person mask
 * @param {number} featherRadius - Blur radius for soft edges
 */
function applyPersonMaskCutout(ctx, mask, featherRadius = 0) {
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
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Apply person mask to a temporary canvas.
 *
 * @param {CanvasRenderingContext2D} tempCtx - Temporary canvas context
 * @param {ImageData} mask - Person mask
 */
function applyPersonMaskToTemp(tempCtx, mask) {
  const canvas = tempCtx.canvas;

  // Create mask canvas
  const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.putImageData(mask, 0, 0);

  // Use destination-out to cut out person areas
  tempCtx.globalCompositeOperation = 'destination-out';
  tempCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  tempCtx.globalCompositeOperation = 'source-over';
}

/**
 * Apply edge feathering to soften the region edges.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} pixelRegion - Region in pixel coordinates
 * @param {number} radius - Feather radius
 */
function applyEdgeFeathering(ctx, pixelRegion, radius) {
  // This is a simplified feathering approach
  // For a more accurate result, we would use distance-to-edge calculations

  const canvas = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Get region bounds
  const points = [
    pixelRegion.topLeft,
    pixelRegion.topRight,
    pixelRegion.bottomRight,
    pixelRegion.bottomLeft
  ];

  // For each pixel, calculate distance to nearest edge
  // and fade alpha accordingly (simplified version)
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const alpha = data[idx + 3];

      if (alpha > 0) {
        const edgeDist = distanceToPolygonEdge(x, y, points);

        if (edgeDist < radius) {
          // Fade alpha based on distance to edge
          const fadeAlpha = Math.round(alpha * (edgeDist / radius));
          data[idx + 3] = fadeAlpha;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Calculate distance from a point to the nearest edge of a polygon.
 *
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {Array} points - Polygon vertices
 * @returns {number} Distance to nearest edge
 */
function distanceToPolygonEdge(px, py, points) {
  let minDist = Infinity;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dist = distanceToLineSegment(
      px, py,
      points[i].x, points[i].y,
      points[j].x, points[j].y
    );
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

/**
 * Calculate distance from a point to a line segment.
 *
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} x1 - Line start X
 * @param {number} y1 - Line start Y
 * @param {number} x2 - Line end X
 * @param {number} y2 - Line end Y
 * @returns {number} Distance
 */
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Point segment
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  // Project point onto line
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;

  return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
}

/**
 * Render multiple wall paint regions.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {Array} wallArtOverlays - Array of wall art overlay objects with paint property
 * @param {Object} [options] - Rendering options
 * @param {ImageData} [options.personMask] - Person mask for all regions
 * @param {number} [options.featherRadius] - Edge feather radius in pixels
 */
export function renderAllWallPaint(ctx, wallArtOverlays, options = {}) {
  const { personMask = null } = options;

  // Filter to only overlays with paint enabled
  const paintOverlays = wallArtOverlays.filter(
    overlay => overlay.type === 'wallArt' && overlay.paint && overlay.paint.enabled && overlay.active
  );

  // Render each paint layer
  for (const overlay of paintOverlays) {
    renderWallPaint(ctx, overlay.region, overlay.paint.color, {
      opacity: overlay.paint.opacity,
      personMask,
      featherRadius: options.featherRadius || 0
    });
  }
}
