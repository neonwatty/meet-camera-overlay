/**
 * Wall Region Utilities
 *
 * Utilities for creating, validating, and transforming wall art regions.
 * Regions are defined as 4-corner quadrilaterals with coordinates as percentages (0-100).
 */

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate (percentage 0-100)
 * @property {number} y - Y coordinate (percentage 0-100)
 */

/**
 * @typedef {Object} WallRegion
 * @property {Point} topLeft - Top-left corner
 * @property {Point} topRight - Top-right corner
 * @property {Point} bottomLeft - Bottom-left corner
 * @property {Point} bottomRight - Bottom-right corner
 */

/**
 * @typedef {'stretch' | 'fit' | 'crop'} AspectRatioMode
 */

/**
 * Create a default rectangular wall region.
 *
 * @param {number} [x=25] - X position (percentage)
 * @param {number} [y=25] - Y position (percentage)
 * @param {number} [width=50] - Width (percentage)
 * @param {number} [height=50] - Height (percentage)
 * @returns {WallRegion}
 */
export function createDefaultRegion(x = 25, y = 25, width = 50, height = 50) {
  return {
    topLeft: { x, y },
    topRight: { x: x + width, y },
    bottomLeft: { x, y: y + height },
    bottomRight: { x: x + width, y: y + height }
  };
}

/**
 * Validate a wall region.
 *
 * @param {WallRegion} region - Region to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRegion(region) {
  const errors = [];

  if (!region) {
    return { valid: false, errors: ['Region is null or undefined'] };
  }

  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

  for (const corner of corners) {
    if (!region[corner]) {
      errors.push(`Missing corner: ${corner}`);
      continue;
    }

    const { x, y } = region[corner];

    if (typeof x !== 'number' || typeof y !== 'number') {
      errors.push(`Invalid coordinates for ${corner}`);
      continue;
    }

    if (x < 0 || x > 100 || y < 0 || y > 100) {
      errors.push(`Coordinates out of bounds for ${corner}: (${x}, ${y})`);
    }
  }

  // Check for minimum size
  if (errors.length === 0) {
    const width = Math.abs(region.topRight.x - region.topLeft.x);
    const height = Math.abs(region.bottomLeft.y - region.topLeft.y);

    if (width < 5) {
      errors.push('Region width too small (minimum 5%)');
    }
    if (height < 5) {
      errors.push('Region height too small (minimum 5%)');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Convert region coordinates from percentages to pixels.
 *
 * @param {WallRegion} region - Region with percentage coordinates
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {WallRegion} Region with pixel coordinates
 */
export function regionToPixels(region, canvasWidth, canvasHeight) {
  const toPixel = (point) => ({
    x: (point.x / 100) * canvasWidth,
    y: (point.y / 100) * canvasHeight
  });

  return {
    topLeft: toPixel(region.topLeft),
    topRight: toPixel(region.topRight),
    bottomLeft: toPixel(region.bottomLeft),
    bottomRight: toPixel(region.bottomRight)
  };
}

/**
 * Convert region coordinates from pixels to percentages.
 *
 * @param {WallRegion} region - Region with pixel coordinates
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {WallRegion} Region with percentage coordinates
 */
export function regionToPercent(region, canvasWidth, canvasHeight) {
  const toPercent = (point) => ({
    x: (point.x / canvasWidth) * 100,
    y: (point.y / canvasHeight) * 100
  });

  return {
    topLeft: toPercent(region.topLeft),
    topRight: toPercent(region.topRight),
    bottomLeft: toPercent(region.bottomLeft),
    bottomRight: toPercent(region.bottomRight)
  };
}

/**
 * Get the bounding box of a region.
 *
 * @param {WallRegion} region - Region to get bounds for
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
 */
export function getRegionBounds(region) {
  const xs = [region.topLeft.x, region.topRight.x, region.bottomLeft.x, region.bottomRight.x];
  const ys = [region.topLeft.y, region.topRight.y, region.bottomLeft.y, region.bottomRight.y];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Check if a point is inside a region.
 * Uses ray casting algorithm for arbitrary quadrilaterals.
 *
 * @param {Point} point - Point to test
 * @param {WallRegion} region - Region to test against
 * @returns {boolean}
 */
export function isPointInRegion(point, region) {
  const polygon = [
    region.topLeft,
    region.topRight,
    region.bottomRight,
    region.bottomLeft
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

/**
 * Find which corner handle is at a given point.
 *
 * @param {Point} point - Point to test (in same coordinate system as region)
 * @param {WallRegion} region - Region to check
 * @param {number} [threshold=3] - Distance threshold (percentage)
 * @returns {string|null} Corner name or null if none found
 */
export function findCornerAtPoint(point, region, threshold = 3) {
  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

  for (const corner of corners) {
    const cornerPoint = region[corner];
    const distance = Math.sqrt(
      Math.pow(point.x - cornerPoint.x, 2) +
      Math.pow(point.y - cornerPoint.y, 2)
    );

    if (distance <= threshold) {
      return corner;
    }
  }

  return null;
}

/**
 * Move a corner of the region to a new position.
 *
 * @param {WallRegion} region - Original region
 * @param {string} corner - Corner name to move
 * @param {Point} newPosition - New position for the corner
 * @returns {WallRegion} New region with moved corner
 */
export function moveCorner(region, corner, newPosition) {
  // Clamp position to valid range
  const clampedPosition = {
    x: Math.max(0, Math.min(100, newPosition.x)),
    y: Math.max(0, Math.min(100, newPosition.y))
  };

  return {
    ...region,
    [corner]: clampedPosition
  };
}

/**
 * Move the entire region by a delta.
 *
 * @param {WallRegion} region - Original region
 * @param {number} deltaX - X offset (percentage)
 * @param {number} deltaY - Y offset (percentage)
 * @returns {WallRegion} New region with moved position
 */
export function moveRegion(region, deltaX, deltaY) {
  const bounds = getRegionBounds(region);

  // Clamp movement to keep region in bounds
  let clampedDeltaX = deltaX;
  let clampedDeltaY = deltaY;

  if (bounds.minX + deltaX < 0) clampedDeltaX = -bounds.minX;
  if (bounds.maxX + deltaX > 100) clampedDeltaX = 100 - bounds.maxX;
  if (bounds.minY + deltaY < 0) clampedDeltaY = -bounds.minY;
  if (bounds.maxY + deltaY > 100) clampedDeltaY = 100 - bounds.maxY;

  const movePoint = (point) => ({
    x: point.x + clampedDeltaX,
    y: point.y + clampedDeltaY
  });

  return {
    topLeft: movePoint(region.topLeft),
    topRight: movePoint(region.topRight),
    bottomLeft: movePoint(region.bottomLeft),
    bottomRight: movePoint(region.bottomRight)
  };
}

/**
 * Draw a region outline on a canvas.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {WallRegion} region - Region to draw (percentage coordinates)
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Object} [options] - Drawing options
 * @param {string} [options.strokeColor='#e94560'] - Stroke color
 * @param {string} [options.fillColor='rgba(233, 69, 96, 0.1)'] - Fill color
 * @param {number} [options.lineWidth=2] - Line width
 * @param {boolean} [options.showHandles=true] - Show corner handles
 * @param {number} [options.handleRadius=8] - Handle radius in pixels
 */
export function drawRegion(ctx, region, canvasWidth, canvasHeight, options = {}) {
  const {
    strokeColor = '#e94560',
    fillColor = 'rgba(233, 69, 96, 0.1)',
    lineWidth = 2,
    showHandles = true,
    handleRadius = 8
  } = options;

  const pixelRegion = regionToPixels(region, canvasWidth, canvasHeight);

  ctx.save();

  // Draw filled region
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(pixelRegion.topLeft.x, pixelRegion.topLeft.y);
  ctx.lineTo(pixelRegion.topRight.x, pixelRegion.topRight.y);
  ctx.lineTo(pixelRegion.bottomRight.x, pixelRegion.bottomRight.y);
  ctx.lineTo(pixelRegion.bottomLeft.x, pixelRegion.bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw outline
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Draw corner handles
  if (showHandles) {
    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

    for (const corner of corners) {
      const point = pixelRegion[corner];

      // Outer circle (white border)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(point.x, point.y, handleRadius + 2, 0, Math.PI * 2);
      ctx.fill();

      // Inner circle (colored)
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Get the center point of a region.
 *
 * @param {WallRegion} region - Region to get center of
 * @returns {Point} Center point
 */
export function getRegionCenter(region) {
  const bounds = getRegionBounds(region);
  return {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2
  };
}

/**
 * Calculate the area of a region (as percentage squared).
 *
 * @param {WallRegion} region - Region to calculate area of
 * @returns {number} Area in percentage squared
 */
export function getRegionArea(region) {
  // Use shoelace formula for arbitrary quadrilateral
  const points = [
    region.topLeft,
    region.topRight,
    region.bottomRight,
    region.bottomLeft
  ];

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * Create a WallArtOverlay object with the given region.
 *
 * @param {WallRegion} region - Region for the overlay
 * @param {Object} [options] - Additional options
 * @param {string} [options.name] - Name for the overlay
 * @returns {Object} WallArtOverlay object
 */
export function createWallArtOverlay(region, options = {}) {
  const id = `wall-art-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id,
    type: 'wallArt',
    name: options.name || 'Wall Art Region',
    region,
    paint: null,
    art: null,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
