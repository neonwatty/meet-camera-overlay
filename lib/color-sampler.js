/**
 * Color Sampler Module
 *
 * Utilities for sampling colors from video frames, including:
 * - Eyedropper tool (10x10 pixel average for stability)
 * - Dominant color detection in regions
 * - Color manipulation utilities
 */

/**
 * @typedef {Object} RGBColor
 * @property {number} r - Red (0-255)
 * @property {number} g - Green (0-255)
 * @property {number} b - Blue (0-255)
 */

/**
 * @typedef {Object} HSLColor
 * @property {number} h - Hue (0-360)
 * @property {number} s - Saturation (0-100)
 * @property {number} l - Lightness (0-100)
 */

/**
 * Sample a color from a canvas at a given position.
 * Uses 10x10 pixel averaging for stability (reduces noise from compression artifacts).
 *
 * @param {CanvasRenderingContext2D|HTMLCanvasElement} source - Canvas or context to sample from
 * @param {number} x - X coordinate (pixels)
 * @param {number} y - Y coordinate (pixels)
 * @param {number} [sampleSize=10] - Size of sample area (sampleSize x sampleSize pixels)
 * @returns {RGBColor} Averaged RGB color
 */
export function sampleColor(source, x, y, sampleSize = 10) {
  const ctx = /** @type {HTMLCanvasElement} */ (source).getContext ? /** @type {HTMLCanvasElement} */ (source).getContext('2d') : /** @type {CanvasRenderingContext2D} */ (source);
  const canvas = ctx.canvas;

  // Calculate sample area bounds (centered on x,y)
  const halfSize = Math.floor(sampleSize / 2);
  const startX = Math.max(0, Math.floor(x) - halfSize);
  const startY = Math.max(0, Math.floor(y) - halfSize);
  const endX = Math.min(canvas.width, startX + sampleSize);
  const endY = Math.min(canvas.height, startY + sampleSize);

  const width = endX - startX;
  const height = endY - startY;

  if (width <= 0 || height <= 0) {
    return { r: 0, g: 0, b: 0 };
  }

  // Get pixel data
  const imageData = ctx.getImageData(startX, startY, width, height);
  const data = imageData.data;

  // Calculate average color
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let pixelCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
    pixelCount++;
  }

  return {
    r: Math.round(totalR / pixelCount),
    g: Math.round(totalG / pixelCount),
    b: Math.round(totalB / pixelCount)
  };
}

/**
 * Sample a color at percentage coordinates.
 *
 * @param {CanvasRenderingContext2D|HTMLCanvasElement} source - Canvas or context
 * @param {number} xPercent - X position as percentage (0-100)
 * @param {number} yPercent - Y position as percentage (0-100)
 * @param {number} [sampleSize=10] - Size of sample area
 * @returns {RGBColor} Averaged RGB color
 */
export function sampleColorAtPercent(source, xPercent, yPercent, sampleSize = 10) {
  const ctx = /** @type {HTMLCanvasElement} */ (source).getContext ? /** @type {HTMLCanvasElement} */ (source).getContext('2d') : /** @type {CanvasRenderingContext2D} */ (source);
  const canvas = ctx.canvas;

  const x = (xPercent / 100) * canvas.width;
  const y = (yPercent / 100) * canvas.height;

  return sampleColor(source, x, y, sampleSize);
}

/**
 * Detect the dominant color in a region.
 * Uses k-means clustering to find the most common color.
 *
 * @param {CanvasRenderingContext2D|HTMLCanvasElement} source - Canvas or context
 * @param {Object} region - Region with topLeft, topRight, bottomLeft, bottomRight
 * @param {Object} [options] - Detection options
 * @param {number} [options.sampleDensity=0.1] - Fraction of pixels to sample (0-1)
 * @param {number} [options.clusters=5] - Number of color clusters
 * @returns {RGBColor} Dominant color
 */
export function detectDominantColor(source, region, options = {}) {
  const { sampleDensity = 0.1, clusters = 5 } = options;

  const ctx = /** @type {HTMLCanvasElement} */ (source).getContext ? /** @type {HTMLCanvasElement} */ (source).getContext('2d') : /** @type {CanvasRenderingContext2D} */ (source);
  const canvas = ctx.canvas;

  // Get bounding box of region
  const xs = [region.topLeft.x, region.topRight.x, region.bottomLeft.x, region.bottomRight.x];
  const ys = [region.topLeft.y, region.topRight.y, region.bottomLeft.y, region.bottomRight.y];

  const minX = Math.floor((Math.min(...xs) / 100) * canvas.width);
  const maxX = Math.ceil((Math.max(...xs) / 100) * canvas.width);
  const minY = Math.floor((Math.min(...ys) / 100) * canvas.height);
  const maxY = Math.ceil((Math.max(...ys) / 100) * canvas.height);

  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) {
    return { r: 128, g: 128, b: 128 };
  }

  // Get pixel data from region
  const imageData = ctx.getImageData(minX, minY, width, height);
  const data = imageData.data;

  // Sample pixels
  const colors = [];
  const step = Math.max(1, Math.floor(1 / sampleDensity));

  for (let i = 0; i < data.length; i += 4 * step) {
    colors.push({
      r: data[i],
      g: data[i + 1],
      b: data[i + 2]
    });
  }

  if (colors.length === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  // Simple k-means clustering
  const dominantColor = kMeansClustering(colors, clusters);

  return dominantColor;
}

/**
 * Simple k-means clustering to find dominant color.
 *
 * @param {RGBColor[]} colors - Array of colors to cluster
 * @param {number} k - Number of clusters
 * @param {number} [maxIterations=10] - Maximum iterations
 * @returns {RGBColor} Center of largest cluster
 */
function kMeansClustering(colors, k, maxIterations = 10) {
  if (colors.length === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  if (colors.length <= k) {
    // Not enough colors for clustering, return average
    return averageColors(colors);
  }

  // Initialize centroids by picking evenly spaced colors
  const step = Math.floor(colors.length / k);
  let centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push({ ...colors[i * step] });
  }

  // Iterate
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign colors to nearest centroid
    const clusters = Array.from({ length: k }, () => []);

    for (const color of colors) {
      let minDist = Infinity;
      let nearestIdx = 0;

      for (let i = 0; i < centroids.length; i++) {
        const dist = colorDistance(color, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      }

      clusters[nearestIdx].push(color);
    }

    // Update centroids
    const newCentroids = clusters.map((cluster, i) => {
      if (cluster.length === 0) {
        return centroids[i];
      }
      return averageColors(cluster);
    });

    centroids = newCentroids;
  }

  // Find largest cluster and return its centroid
  const clusters = Array.from({ length: k }, () => []);
  for (const color of colors) {
    let minDist = Infinity;
    let nearestIdx = 0;

    for (let i = 0; i < centroids.length; i++) {
      const dist = colorDistance(color, centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }

    clusters[nearestIdx].push(color);
  }

  let largestClusterIdx = 0;
  let largestClusterSize = 0;

  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].length > largestClusterSize) {
      largestClusterSize = clusters[i].length;
      largestClusterIdx = i;
    }
  }

  return centroids[largestClusterIdx];
}

/**
 * Calculate Euclidean distance between two colors in RGB space.
 *
 * @param {RGBColor} c1 - First color
 * @param {RGBColor} c2 - Second color
 * @returns {number} Distance
 */
function colorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Calculate average of multiple colors.
 *
 * @param {RGBColor[]} colors - Array of colors
 * @returns {RGBColor} Average color
 */
function averageColors(colors) {
  if (colors.length === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  for (const color of colors) {
    totalR += color.r;
    totalG += color.g;
    totalB += color.b;
  }

  return {
    r: Math.round(totalR / colors.length),
    g: Math.round(totalG / colors.length),
    b: Math.round(totalB / colors.length)
  };
}

/**
 * Convert RGB color to hex string.
 *
 * @param {RGBColor} color - RGB color
 * @returns {string} Hex string (e.g., '#ff0000')
 */
export function rgbToHex(color) {
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Convert hex string to RGB color.
 *
 * @param {string} hex - Hex string (e.g., '#ff0000' or 'ff0000')
 * @returns {RGBColor} RGB color
 */
export function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Convert RGB to HSL.
 *
 * @param {RGBColor} color - RGB color
 * @returns {HSLColor} HSL color
 */
export function rgbToHsl(color) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Convert HSL to RGB.
 *
 * @param {HSLColor} color - HSL color
 * @returns {RGBColor} RGB color
 */
export function hslToRgb(color) {
  const h = color.h / 360;
  const s = color.s / 100;
  const l = color.l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * Get a contrasting text color (black or white) for a background color.
 *
 * @param {RGBColor} bgColor - Background color
 * @returns {string} '#000000' or '#ffffff'
 */
export function getContrastingTextColor(bgColor) {
  // Calculate relative luminance
  const luminance = (0.299 * bgColor.r + 0.587 * bgColor.g + 0.114 * bgColor.b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Adjust brightness of a color.
 *
 * @param {RGBColor} color - Input color
 * @param {number} factor - Brightness factor (1 = no change, <1 = darker, >1 = lighter)
 * @returns {RGBColor} Adjusted color
 */
export function adjustBrightness(color, factor) {
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r * factor))),
    g: Math.min(255, Math.max(0, Math.round(color.g * factor))),
    b: Math.min(255, Math.max(0, Math.round(color.b * factor)))
  };
}
