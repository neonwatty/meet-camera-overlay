/**
 * Factory functions for creating, migrating, and managing overlay collections.
 * Handles overlay lifecycle: creation, duplication, migration, sorting.
 */

import {
  CATEGORY_USER,
  TYPE_EFFECT,
  TYPE_TEXT_BANNER,
  TYPE_TIMER,
  TEXT_POSITION_LOWER_THIRD,
  TEXT_ANIMATION_NONE,
  LAYER_FOREGROUND,
  LAYER_BACKGROUND,
} from './overlay-utils.js';

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
 * @param {string} [name] - Display name for the overlay
 * @param {Object} [options] - Additional options
 * @param {string} [options.category] - 'user' or 'bundled' (default: 'user')
 * @param {string} [options.layer] - 'foreground' or 'background' (default: 'foreground')
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
 * @param {string} [name] - Display name for the effect
 * @param {Object} [options] - Additional options
 * @param {string} [options.category] - 'user' or 'bundled' (default: 'user')
 * @returns {Object} New effect overlay object
 */
export function createEffect(src, name = 'Effect', options = {}) {
  const { category = CATEGORY_USER } = options;
  return {
    id: generateId(),
    src,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    type: 'effect',
    active: false,
    name,
    category,
    layer: LAYER_BACKGROUND,
    zIndex: 0,
    createdAt: Date.now()
  };
}

/**
 * Create a new text banner overlay with default values.
 * @param {string} text - Text to display
 * @param {string} [name] - Display name for the banner
 * @param {Object} [options] - Additional options
 * @returns {Object} New text banner overlay object
 */
export function createTextBanner(text = 'Your Text Here', name = 'Text Banner', options = {}) {
  const {
    textPosition = TEXT_POSITION_LOWER_THIRD,
    animation = TEXT_ANIMATION_NONE,
    fontFamily = 'Arial, sans-serif',
    fontSize = 24,
    textColor = '#ffffff',
    backgroundColor = '#000000',
    backgroundOpacity = 0.7,
    padding = 12,
    borderRadius = 8,
    slideshow = null
  } = options;

  return {
    id: generateId(),
    type: TYPE_TEXT_BANNER,
    text,
    name,
    textPosition,
    animation,
    style: {
      fontFamily,
      fontSize,
      textColor,
      backgroundColor,
      backgroundOpacity,
      padding,
      borderRadius
    },
    slideshow,
    x: 50,
    y: 75,
    width: 80,
    height: 20,
    opacity: 1,
    active: true,
    layer: LAYER_FOREGROUND,
    zIndex: 10,
    createdAt: Date.now()
  };
}

/**
 * Create a new timer overlay with default values.
 * @param {number} [duration] - Duration in seconds (for countdown/countup modes)
 * @param {string} [name] - Display name for the timer
 * @param {Object} [options] - Additional options
 * @returns {Object} New timer overlay object
 */
export function createTimer(duration = 300, name = 'Timer', options = {}) {
  const {
    timerMode = 'countdown',
    format = 'mm:ss',
    fontSize = 32,
    textColor = '#ffffff',
    backgroundColor = '#000000',
    backgroundOpacity = 0.7,
    alertAt = [],
    autoStart = false,
    position = 'top-right'
  } = options;

  const positionMap = {
    'top-left': { x: 5, y: 5 },
    'top-center': { x: 50, y: 5 },
    'top-right': { x: 95, y: 5 },
    'bottom-left': { x: 5, y: 90 },
    'bottom-center': { x: 50, y: 90 },
    'bottom-right': { x: 95, y: 90 }
  };
  const pos = positionMap[position] || positionMap['top-right'];

  return {
    id: generateId(),
    type: TYPE_TIMER,
    name,
    duration,
    timerMode,
    format,
    style: {
      fontSize,
      textColor,
      backgroundColor,
      backgroundOpacity
    },
    alertAt,
    autoStart,
    timerState: {
      running: false,
      startTime: null,
      pausedAt: null,
      elapsed: 0
    },
    x: pos.x,
    y: pos.y,
    width: 15,
    height: 10,
    opacity: 1,
    active: true,
    layer: LAYER_FOREGROUND,
    zIndex: 11,
    createdAt: Date.now()
  };
}

/**
 * Migrate an overlay to the current schema by adding missing fields.
 * @param {Object} overlay - Overlay to migrate
 * @returns {Object} Migrated overlay with all fields
 */
export function migrateOverlay(overlay) {
  if (!overlay) return overlay;

  const migrated = { ...overlay };

  if (!migrated.category) {
    migrated.category = CATEGORY_USER;
  }

  if (!migrated.layer) {
    migrated.layer = migrated.type === TYPE_EFFECT ? LAYER_BACKGROUND : LAYER_FOREGROUND;
  }

  if (migrated.zIndex === undefined) {
    if (migrated.type === TYPE_TIMER) {
      migrated.zIndex = 11;
    } else if (migrated.type === TYPE_TEXT_BANNER) {
      migrated.zIndex = 10;
    } else {
      migrated.zIndex = 0;
    }
  }

  if (!migrated.createdAt) {
    migrated.createdAt = Date.now();
  }

  if (migrated.type === TYPE_TEXT_BANNER) {
    if (!migrated.style) {
      migrated.style = {
        fontFamily: 'Arial, sans-serif',
        fontSize: 24,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        backgroundOpacity: 0.7,
        padding: 12,
        borderRadius: 8
      };
    }
    if (!migrated.textPosition) {
      migrated.textPosition = TEXT_POSITION_LOWER_THIRD;
    }
    if (!migrated.animation) {
      migrated.animation = TEXT_ANIMATION_NONE;
    }
  }

  if (migrated.type === TYPE_TIMER) {
    if (!migrated.style) {
      migrated.style = {
        fontSize: 32,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        backgroundOpacity: 0.7
      };
    }
    if (!migrated.timerState) {
      migrated.timerState = {
        running: false,
        startTime: null,
        pausedAt: null,
        elapsed: 0
      };
    }
    if (!migrated.timerMode) {
      migrated.timerMode = 'countdown';
    }
    if (!migrated.format) {
      migrated.format = 'mm:ss';
    }
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
 * @param {Array} overlays - Array of overlays to sort
 * @returns {Array} Sorted overlays (new array, original unchanged)
 */
export function sortOverlaysByLayer(overlays) {
  if (!Array.isArray(overlays)) return [];

  return [...overlays].sort((a, b) => {
    const aLayerOrder = a.layer === LAYER_BACKGROUND ? 0 : 1;
    const bLayerOrder = b.layer === LAYER_BACKGROUND ? 0 : 1;

    if (aLayerOrder !== bLayerOrder) {
      return aLayerOrder - bLayerOrder;
    }

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
 * @param {Array} overlays - Array of overlays
 * @returns {Array} Overlays with recalculated zIndex values
 */
export function recalculateZIndices(overlays) {
  if (!Array.isArray(overlays)) return [];

  const background = overlays.filter(o => o.layer === LAYER_BACKGROUND);
  const foreground = overlays.filter(o => o.layer !== LAYER_BACKGROUND);

  background.forEach((overlay, index) => {
    overlay.zIndex = index;
  });

  foreground.forEach((overlay, index) => {
    overlay.zIndex = index;
  });

  return overlays;
}
