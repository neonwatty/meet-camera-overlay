/**
 * Pure utility functions for overlay calculations.
 * These are extracted for testability.
 */

/**
 * Calculate overlay dimensions that preserve aspect ratio within a bounding box.
 * @param {number} imgWidth - Natural width of the image
 * @param {number} imgHeight - Natural height of the image
 * @param {number} boxWidth - Width of the bounding box
 * @param {number} boxHeight - Height of the bounding box
 * @returns {{width: number, height: number}} Fitted dimensions
 */
export function fitImageInBox(imgWidth, imgHeight, boxWidth, boxHeight) {
  const imgAspect = imgWidth / imgHeight;
  const boxAspect = boxWidth / boxHeight;

  let width, height;
  if (imgAspect > boxAspect) {
    // Image is wider than box - fit to width
    width = boxWidth;
    height = boxWidth / imgAspect;
  } else {
    // Image is taller than box - fit to height
    height = boxHeight;
    width = boxHeight * imgAspect;
  }

  return { width, height };
}

/**
 * Convert percentage-based overlay position to pixel coordinates,
 * with horizontal mirroring for Meet's self-view.
 * @param {Object} overlay - Overlay with x, y, width, height as percentages
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} imgWidth - Natural image width
 * @param {number} imgHeight - Natural image height
 * @returns {{x: number, y: number, width: number, height: number}} Pixel coordinates
 */
export function calculateOverlayPosition(overlay, canvasWidth, canvasHeight, imgWidth, imgHeight) {
  // Calculate the target box size from overlay percentages
  const boxW = (overlay.width / 100) * canvasWidth;
  const boxH = (overlay.height / 100) * canvasHeight;

  // Preserve image aspect ratio (fit within box)
  const { width: w, height: h } = fitImageInBox(imgWidth, imgHeight, boxW, boxH);

  // Mirror the x-position so it appears where user intended after Meet mirrors
  const x = canvasWidth - ((overlay.x / 100) * canvasWidth) - w;
  const y = (overlay.y / 100) * canvasHeight;

  return { x, y, width: w, height: h };
}

/**
 * Validate overlay data structure.
 * @param {Object} overlay - Overlay object to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateOverlay(overlay) {
  const errors = [];

  if (!overlay) {
    return { valid: false, errors: ['Overlay is null or undefined'] };
  }

  if (typeof overlay.id !== 'string' || !overlay.id) {
    errors.push('Missing or invalid id');
  }

  if (typeof overlay.src !== 'string' || !overlay.src) {
    errors.push('Missing or invalid src');
  }

  if (typeof overlay.x !== 'number' || overlay.x < 0 || overlay.x > 100) {
    errors.push('x must be a number between 0 and 100');
  }

  if (typeof overlay.y !== 'number' || overlay.y < 0 || overlay.y > 100) {
    errors.push('y must be a number between 0 and 100');
  }

  if (typeof overlay.width !== 'number' || overlay.width <= 0 || overlay.width > 100) {
    errors.push('width must be a number between 0 and 100');
  }

  if (typeof overlay.height !== 'number' || overlay.height <= 0 || overlay.height > 100) {
    errors.push('height must be a number between 0 and 100');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a unique ID for overlays.
 * @returns {string} Unique identifier
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Create a new overlay with default values.
 * @param {string} src - Image source URL or data URL
 * @param {string} name - Display name for the overlay
 * @returns {Object} New overlay object
 */
export function createOverlay(src, name = 'Image') {
  return {
    id: generateId(),
    src,
    x: 5,
    y: 25,
    width: 20,
    height: 35,
    name
  };
}
