/**
 * Pure utility functions and constants for overlay calculations.
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
 * Overlay types
 */
export const TYPE_STANDARD = 'standard';
export const TYPE_EFFECT = 'effect';
export const TYPE_TEXT_BANNER = 'textBanner';
export const TYPE_TIMER = 'timer';

/**
 * Text banner position presets
 */
export const TEXT_POSITION_LOWER_THIRD = 'lower-third';
export const TEXT_POSITION_TOP = 'top';
export const TEXT_POSITION_CENTER = 'center';
export const TEXT_POSITION_CUSTOM = 'custom';

/**
 * Text banner animation types
 */
export const TEXT_ANIMATION_NONE = 'none';
export const TEXT_ANIMATION_FADE = 'fade';
export const TEXT_ANIMATION_SLIDE_LEFT = 'slide-left';
export const TEXT_ANIMATION_SLIDE_UP = 'slide-up';

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
    width = boxWidth;
    height = boxWidth / imgAspect;
  } else {
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
  const boxW = (overlay.width / 100) * canvasWidth;
  const boxH = (overlay.height / 100) * canvasHeight;

  const { width: w, height: h } = fitImageInBox(imgWidth, imgHeight, boxW, boxH);

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

  if (overlay.opacity !== undefined) {
    if (typeof overlay.opacity !== 'number' || overlay.opacity < 0 || overlay.opacity > 1) {
      errors.push('opacity must be a number between 0 and 1');
    }
  }

  if (overlay.type !== undefined) {
    const validTypes = [TYPE_STANDARD, TYPE_EFFECT, TYPE_TEXT_BANNER, TYPE_TIMER];
    if (!validTypes.includes(overlay.type)) {
      errors.push('type must be "standard", "effect", "textBanner", or "timer"');
    }
  }

  if (overlay.type === TYPE_TEXT_BANNER) {
    if (typeof overlay.text !== 'string' && !Array.isArray(overlay.text)) {
      errors.push('text must be a string or array of strings');
    }
    if (overlay.textPosition !== undefined) {
      const validPositions = [
        TEXT_POSITION_LOWER_THIRD, TEXT_POSITION_TOP, TEXT_POSITION_CENTER, TEXT_POSITION_CUSTOM,
      ];
      if (!validPositions.includes(overlay.textPosition)) {
        errors.push('textPosition must be "lower-third", "top", "center", or "custom"');
      }
    }
    if (overlay.animation !== undefined) {
      const validAnimations = [
        TEXT_ANIMATION_NONE, TEXT_ANIMATION_FADE, TEXT_ANIMATION_SLIDE_LEFT, TEXT_ANIMATION_SLIDE_UP,
      ];
      if (!validAnimations.includes(overlay.animation)) {
        errors.push('animation must be "none", "fade", "slide-left", or "slide-up"');
      }
    }
  }

  if (overlay.type === TYPE_TIMER) {
    if (overlay.duration !== undefined && (typeof overlay.duration !== 'number' || overlay.duration < 0)) {
      errors.push('duration must be a non-negative number (seconds)');
    }
    if (overlay.timerMode !== undefined) {
      const validModes = ['countdown', 'countup', 'clock'];
      if (!validModes.includes(overlay.timerMode)) {
        errors.push('timerMode must be "countdown", "countup", or "clock"');
      }
    }
  }

  if (overlay.active !== undefined) {
    if (typeof overlay.active !== 'boolean') {
      errors.push('active must be a boolean');
    }
  }

  if (overlay.category !== undefined) {
    if (overlay.category !== CATEGORY_USER && overlay.category !== CATEGORY_BUNDLED) {
      errors.push('category must be "user" or "bundled"');
    }
  }

  if (overlay.layer !== undefined) {
    if (overlay.layer !== LAYER_FOREGROUND && overlay.layer !== LAYER_BACKGROUND) {
      errors.push('layer must be "foreground" or "background"');
    }
  }

  if (overlay.zIndex !== undefined) {
    if (typeof overlay.zIndex !== 'number' || overlay.zIndex < 0) {
      errors.push('zIndex must be a non-negative number');
    }
  }

  if (overlay.createdAt !== undefined) {
    if (typeof overlay.createdAt !== 'number') {
      errors.push('createdAt must be a number (timestamp)');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if an overlay is an effect type.
 * @param {Object} overlay - Overlay to check
 * @returns {boolean} True if overlay is an effect
 */
export function isEffect(overlay) {
  return overlay && overlay.type === TYPE_EFFECT;
}

/**
 * Check if an overlay is a text banner type.
 * @param {Object} overlay - Overlay to check
 * @returns {boolean} True if overlay is a text banner
 */
export function isTextBanner(overlay) {
  return overlay && overlay.type === TYPE_TEXT_BANNER;
}

/**
 * Check if an overlay is a timer type.
 * @param {Object} overlay - Overlay to check
 * @returns {boolean} True if overlay is a timer
 */
export function isTimer(overlay) {
  return overlay && overlay.type === TYPE_TIMER;
}

/**
 * Check if an overlay should be rendered.
 * Standard overlays always render, effects/text/timers only render when active.
 * @param {Object} overlay - Overlay to check
 * @returns {boolean} True if overlay should be rendered
 */
export function shouldRender(overlay) {
  if (!overlay) return false;
  if (overlay.type === TYPE_EFFECT || overlay.type === TYPE_TEXT_BANNER || overlay.type === TYPE_TIMER) {
    return overlay.active === true;
  }
  return true;
}
