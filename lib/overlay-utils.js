/**
 * Pure utility functions for overlay calculations.
 * These are extracted for testability.
 */

/**
 * Overlay categories
 */
export const CATEGORY_USER = 'user';
export const CATEGORY_BUNDLED = 'bundled';

/**
 * Layer types for z-ordering
 */
export const LAYER_FOREGROUND = 'foreground';
export const LAYER_BACKGROUND = 'background';

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

  // Opacity is optional, defaults to 1 if not present
  if (overlay.opacity !== undefined) {
    if (typeof overlay.opacity !== 'number' || overlay.opacity < 0 || overlay.opacity > 1) {
      errors.push('opacity must be a number between 0 and 1');
    }
  }

  // Type is optional, defaults to 'standard'
  if (overlay.type !== undefined) {
    if (overlay.type !== 'standard' && overlay.type !== 'effect') {
      errors.push('type must be "standard" or "effect"');
    }
  }

  // Active is optional for effects, defaults to false
  if (overlay.active !== undefined) {
    if (typeof overlay.active !== 'boolean') {
      errors.push('active must be a boolean');
    }
  }

  // Category is optional, defaults to 'user'
  if (overlay.category !== undefined) {
    if (overlay.category !== CATEGORY_USER && overlay.category !== CATEGORY_BUNDLED) {
      errors.push('category must be "user" or "bundled"');
    }
  }

  // Layer is optional, defaults based on type
  if (overlay.layer !== undefined) {
    if (overlay.layer !== LAYER_FOREGROUND && overlay.layer !== LAYER_BACKGROUND) {
      errors.push('layer must be "foreground" or "background"');
    }
  }

  // zIndex is optional, defaults to 0
  if (overlay.zIndex !== undefined) {
    if (typeof overlay.zIndex !== 'number' || overlay.zIndex < 0) {
      errors.push('zIndex must be a non-negative number');
    }
  }

  // createdAt is optional
  if (overlay.createdAt !== undefined) {
    if (typeof overlay.createdAt !== 'number') {
      errors.push('createdAt must be a number (timestamp)');
    }
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
 * @param {Object} options - Additional options
 * @param {string} options.category - 'user' or 'bundled' (default: 'user')
 * @param {string} options.layer - 'foreground' or 'background' (default: 'foreground')
 * @returns {Object} New overlay object
 */
export function createOverlay(src, name = 'Image', options = {}) {
  const { category = CATEGORY_USER, layer = LAYER_FOREGROUND } = options;
  return {
    id: generateId(),
    src,
    x: 5,
    y: 25,
    width: 20,
    height: 35,
    opacity: 1,
    type: 'standard',
    name,
    category,
    layer,
    zIndex: 0,
    createdAt: Date.now()
  };
}

/**
 * Create a new effect overlay with default values.
 * Effects are larger (full-screen) and start inactive.
 * @param {string} src - Image source URL or data URL (typically animated GIF)
 * @param {string} name - Display name for the effect
 * @param {Object} options - Additional options
 * @param {string} options.category - 'user' or 'bundled' (default: 'user')
 * @returns {Object} New effect overlay object
 */
export function createEffect(src, name = 'Effect', options = {}) {
  const { category = CATEGORY_USER } = options;
  return {
    id: generateId(),
    src,
    x: 0,      // Full screen - start at left edge
    y: 0,      // Full screen - start at top
    width: 100,  // Full width
    height: 100, // Full height
    opacity: 1,
    type: 'effect',
    active: false,  // Effects start inactive
    name,
    category,
    layer: LAYER_BACKGROUND,  // Effects default to background
    zIndex: 0,
    createdAt: Date.now()
  };
}

/**
 * Check if an overlay is an effect type.
 * @param {Object} overlay - Overlay to check
 * @returns {boolean} True if overlay is an effect
 */
export function isEffect(overlay) {
  return overlay && overlay.type === 'effect';
}

/**
 * Check if an overlay should be rendered.
 * Standard overlays always render, effects only render when active.
 * @param {Object} overlay - Overlay to check
 * @returns {boolean} True if overlay should be rendered
 */
export function shouldRender(overlay) {
  if (!overlay) return false;
  if (overlay.type === 'effect') {
    return overlay.active === true;
  }
  return true; // Standard overlays always render
}

/**
 * Migrate an overlay to the current schema by adding missing fields.
 * This ensures backward compatibility with overlays created before new fields were added.
 * @param {Object} overlay - Overlay to migrate
 * @returns {Object} Migrated overlay with all fields
 */
export function migrateOverlay(overlay) {
  if (!overlay) return overlay;

  const migrated = { ...overlay };

  // Add category if missing (default to user for uploaded, bundled for effects without it)
  if (!migrated.category) {
    migrated.category = CATEGORY_USER;
  }

  // Add layer if missing
  if (!migrated.layer) {
    // Effects default to background, standard overlays to foreground
    migrated.layer = migrated.type === 'effect' ? LAYER_BACKGROUND : LAYER_FOREGROUND;
  }

  // Add zIndex if missing
  if (migrated.zIndex === undefined) {
    migrated.zIndex = 0;
  }

  // Add createdAt if missing (use current time as fallback)
  if (!migrated.createdAt) {
    migrated.createdAt = Date.now();
  }

  return migrated;
}

/**
 * Migrate an array of overlays to the current schema.
 * @param {Array} overlays - Array of overlays to migrate
 * @returns {Array} Migrated overlays
 */
export function migrateOverlays(overlays) {
  if (!Array.isArray(overlays)) return [];
  return overlays.map(migrateOverlay);
}

/**
 * Sort overlays by layer and zIndex for correct rendering order.
 * Background overlays render first (behind), then foreground overlays (in front).
 * Within each layer, lower zIndex renders first (behind higher zIndex).
 * @param {Array} overlays - Array of overlays to sort
 * @returns {Array} Sorted overlays (new array, original unchanged)
 */
export function sortOverlaysByLayer(overlays) {
  if (!Array.isArray(overlays)) return [];

  return [...overlays].sort((a, b) => {
    // Background = 0, Foreground = 1
    const aLayerOrder = a.layer === LAYER_BACKGROUND ? 0 : 1;
    const bLayerOrder = b.layer === LAYER_BACKGROUND ? 0 : 1;

    // First sort by layer
    if (aLayerOrder !== bLayerOrder) {
      return aLayerOrder - bLayerOrder;
    }

    // Within same layer, sort by zIndex
    const aZIndex = a.zIndex || 0;
    const bZIndex = b.zIndex || 0;
    return aZIndex - bZIndex;
  });
}

/**
 * Duplicate an overlay with a new ID and modified name.
 * @param {Object} overlay - Overlay to duplicate
 * @returns {Object} New overlay with unique ID
 */
export function duplicateOverlay(overlay) {
  if (!overlay) return null;

  return {
    ...overlay,
    id: generateId(),
    name: `${overlay.name} (Copy)`,
    createdAt: Date.now()
  };
}

/**
 * Recalculate zIndex values for an array of overlays to be sequential.
 * Useful after reordering or removing overlays.
 * @param {Array} overlays - Array of overlays
 * @returns {Array} Overlays with recalculated zIndex values
 */
export function recalculateZIndices(overlays) {
  if (!Array.isArray(overlays)) return [];

  // Separate by layer
  const background = overlays.filter(o => o.layer === LAYER_BACKGROUND);
  const foreground = overlays.filter(o => o.layer !== LAYER_BACKGROUND);

  // Assign sequential zIndex within each layer
  background.forEach((overlay, index) => {
    overlay.zIndex = index;
  });

  foreground.forEach((overlay, index) => {
    overlay.zIndex = index;
  });

  return overlays;
}
