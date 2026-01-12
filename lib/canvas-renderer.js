/**
 * Canvas rendering utilities for overlay compositing.
 * Extracted for testability - same logic used in inject.js
 */

import {
  fitImageInBox,
  sortOverlaysByLayer,
  TEXT_POSITION_LOWER_THIRD,
  TEXT_POSITION_TOP,
  TEXT_POSITION_CENTER
} from './overlay-utils.js';

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

/**
 * Render a text banner overlay onto the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} banner - Text banner overlay configuration
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.mirror] - Whether to mirror for Meet self-view (default: true)
 */
export function renderTextBanner(ctx, banner, canvasWidth, canvasHeight, options = {}) {
  const { mirror = true } = options;

  if (!banner || !banner.text) return;

  const style = banner.style || {};
  const {
    fontFamily = 'Arial, sans-serif',
    fontSize = 24,
    textColor = '#ffffff',
    backgroundColor = '#000000',
    backgroundOpacity = 0.7,
    padding = 12,
    borderRadius = 8
  } = style;

  // Get the text to display (handle array for slideshow)
  const displayText = Array.isArray(banner.text) ? banner.text[0] : banner.text;
  if (!displayText) return;

  // Scale font size based on canvas size (design at 720p)
  const scaleFactor = canvasHeight / 720;
  const scaledFontSize = Math.round(fontSize * scaleFactor);
  const scaledPadding = Math.round(padding * scaleFactor);
  const scaledBorderRadius = Math.round(borderRadius * scaleFactor);

  ctx.save();

  // Set up font for measuring
  ctx.font = `${scaledFontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';

  // Split text into lines
  const lines = displayText.split('\n');
  const lineHeight = scaledFontSize * 1.3;

  // Measure text dimensions
  let maxLineWidth = 0;
  lines.forEach(line => {
    const metrics = ctx.measureText(line);
    maxLineWidth = Math.max(maxLineWidth, metrics.width);
  });

  const textHeight = lines.length * lineHeight;
  const boxWidth = maxLineWidth + scaledPadding * 2;
  const boxHeight = textHeight + scaledPadding * 2;

  // Calculate position based on textPosition preset
  let x, y;
  const position = banner.textPosition || TEXT_POSITION_LOWER_THIRD;

  if (position === TEXT_POSITION_LOWER_THIRD) {
    // Lower third: bottom 1/3 of screen, centered horizontally
    x = (canvasWidth - boxWidth) / 2;
    y = canvasHeight * 0.7 - boxHeight / 2;
  } else if (position === TEXT_POSITION_TOP) {
    // Top: near top of screen, centered horizontally
    x = (canvasWidth - boxWidth) / 2;
    y = canvasHeight * 0.1;
  } else if (position === TEXT_POSITION_CENTER) {
    // Center: middle of screen
    x = (canvasWidth - boxWidth) / 2;
    y = (canvasHeight - boxHeight) / 2;
  } else {
    // Custom: use x/y percentages from overlay
    x = (banner.x / 100) * canvasWidth - boxWidth / 2;
    y = (banner.y / 100) * canvasHeight - boxHeight / 2;
  }

  // Mirror x position if needed (for Meet self-view)
  if (mirror) {
    x = canvasWidth - x - boxWidth;
  }

  // Apply overlay opacity
  const opacity = banner.opacity !== undefined ? banner.opacity : 1;
  ctx.globalAlpha = opacity;

  // Draw background with rounded corners
  ctx.fillStyle = backgroundColor;
  ctx.globalAlpha = opacity * backgroundOpacity;
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, scaledBorderRadius);
  ctx.fill();

  // Draw text
  ctx.globalAlpha = opacity;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';

  const textX = x + boxWidth / 2;
  const textStartY = y + scaledPadding + lineHeight / 2;

  lines.forEach((line, index) => {
    ctx.fillText(line, textX, textStartY + index * lineHeight);
  });

  ctx.restore();
}

/**
 * Render a timer overlay onto the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} timer - Timer overlay configuration
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} timestamp - Current timestamp in ms for animation
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.mirror] - Whether to mirror for Meet self-view (default: true)
 */
export function renderTimer(ctx, timer, canvasWidth, canvasHeight, timestamp, options = {}) {
  const { mirror = true } = options;

  if (!timer) return;

  const style = timer.style || {};
  const {
    fontSize = 32,
    textColor = '#ffffff',
    backgroundColor = '#000000',
    backgroundOpacity = 0.7
  } = style;

  const timerState = timer.timerState || { running: false, elapsed: 0 };
  const mode = timer.timerMode || 'countdown';
  const duration = timer.duration || 300;
  const format = timer.format || 'mm:ss';

  // Calculate current time
  let displaySeconds;
  if (mode === 'clock') {
    // Show current time
    const now = new Date();
    displaySeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  } else if (mode === 'countup') {
    // Count up from 0
    displaySeconds = timerState.elapsed;
  } else {
    // Countdown from duration
    displaySeconds = Math.max(0, duration - timerState.elapsed);
  }

  // Format time string
  const timeString = formatTime(displaySeconds, format);

  // Scale font size based on canvas size (design at 720p)
  const scaleFactor = canvasHeight / 720;
  const scaledFontSize = Math.round(fontSize * scaleFactor);
  const scaledPadding = Math.round(10 * scaleFactor);
  const scaledBorderRadius = Math.round(6 * scaleFactor);

  ctx.save();

  // Set up font for measuring
  ctx.font = `bold ${scaledFontSize}px 'Courier New', monospace`;
  ctx.textBaseline = 'middle';

  // Measure text dimensions
  const metrics = ctx.measureText(timeString);
  const boxWidth = metrics.width + scaledPadding * 2;
  const boxHeight = scaledFontSize + scaledPadding * 2;

  // Calculate position from overlay x/y percentages
  let x = (timer.x / 100) * canvasWidth;
  const y = (timer.y / 100) * canvasHeight;

  // Adjust position based on which corner (using x percentage as indicator)
  if (timer.x > 50) {
    // Right side - align box to end at x position
    x = x - boxWidth;
  }

  // Mirror x position if needed (for Meet self-view)
  if (mirror) {
    x = canvasWidth - x - boxWidth;
  }

  // Apply overlay opacity
  const opacity = timer.opacity !== undefined ? timer.opacity : 1;
  ctx.globalAlpha = opacity;

  // Check if timer is in alert state (e.g., last 10 seconds of countdown)
  const isAlert = mode === 'countdown' && displaySeconds <= 10 && displaySeconds > 0;

  // Draw background with rounded corners
  ctx.fillStyle = isAlert ? '#cc0000' : backgroundColor;
  ctx.globalAlpha = opacity * backgroundOpacity;
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, scaledBorderRadius);
  ctx.fill();

  // Draw text
  ctx.globalAlpha = opacity;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.fillText(timeString, x + boxWidth / 2, y + boxHeight / 2);

  ctx.restore();
}

/**
 * Format seconds into a time string.
 *
 * @param {number} totalSeconds - Total seconds to format
 * @param {string} format - Format string: 'mm:ss', 'hh:mm:ss', or 'minimal'
 * @returns {string} Formatted time string
 */
export function formatTime(totalSeconds, format = 'mm:ss') {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (format === 'hh:mm:ss') {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else if (format === 'minimal') {
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  } else {
    // Default: mm:ss
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Draw a rounded rectangle path.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @param {number} radius - Corner radius
 */
export function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
