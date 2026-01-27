/**
 * Wall Detector Module
 *
 * Automatically detects flat wall-like regions in the background
 * for wall art placement. Uses edge detection and color uniformity
 * analysis to find candidate regions.
 *
 * Falls back to manual selection if detection fails.
 */

/**
 * Configuration constants
 */
const CONFIG = {
  // Analysis resolution (downsample for performance)
  ANALYSIS_WIDTH: 160,
  ANALYSIS_HEIGHT: 120,

  // Edge detection
  EDGE_THRESHOLD: 30,           // Minimum edge strength to consider

  // Region detection
  MIN_REGION_SIZE: 0.05,        // Minimum region size as fraction of frame (5%)
  MAX_REGION_SIZE: 0.8,         // Maximum region size (80%)
  COLOR_VARIANCE_THRESHOLD: 25, // Max color variance for "uniform" region
  GRID_SIZE: 8,                 // Grid cells for initial sampling

  // Wall scoring weights
  SCORE_SIZE: 25,               // Points for larger regions
  SCORE_UNIFORMITY: 25,         // Points for color uniformity
  SCORE_POSITION: 20,           // Points for center/upper position
  SCORE_RECTANGULAR: 15,        // Points for rectangular shape
  SCORE_VERTICAL: 15,           // Points for vertical orientation

  // Result limits
  MAX_REGIONS: 3                // Maximum regions to return
};

/**
 * @typedef {Object} DetectedRegion
 * @property {Object} bounds - Bounding box {x, y, width, height} as percentages
 * @property {Object} region - 4-corner region for wall art
 * @property {number} score - Wall-likeness score (0-100)
 * @property {Object} color - Average color {r, g, b}
 * @property {number} area - Area as fraction of frame
 */

/**
 * WallDetector - Detects flat wall regions for art placement
 */
class WallDetector {
  constructor() {
    /** @type {HTMLCanvasElement|null} */
    this._workCanvas = null;

    /** @type {CanvasRenderingContext2D|null} */
    this._workCtx = null;

    /** @type {boolean} */
    this.initialized = false;
  }

  /**
   * Initialize the detector
   */
  initialize() {
    if (!this._workCanvas) {
      this._workCanvas = document.createElement('canvas');
      this._workCanvas.width = CONFIG.ANALYSIS_WIDTH;
      this._workCanvas.height = CONFIG.ANALYSIS_HEIGHT;
      this._workCtx = this._workCanvas.getContext('2d', { willReadFrequently: true });
    }
    this.initialized = true;
    console.log('[WallDetector] Initialized');
  }

  /**
   * Detect wall regions in a video frame
   * @param {HTMLVideoElement|HTMLCanvasElement} source - Video or canvas source
   * @param {ImageData|null} personMask - Person mask to exclude
   * @returns {Promise<{success: boolean, regions: DetectedRegion[], reason?: string}>}
   */
  async detectWalls(source, personMask = null) {
    if (!this.initialized) {
      this.initialize();
    }

    try {
      // Draw source to work canvas at analysis resolution
      this._workCtx.drawImage(source, 0, 0, CONFIG.ANALYSIS_WIDTH, CONFIG.ANALYSIS_HEIGHT);
      const imageData = this._workCtx.getImageData(0, 0, CONFIG.ANALYSIS_WIDTH, CONFIG.ANALYSIS_HEIGHT);

      // Scale person mask if provided
      let scaledMask = null;
      if (personMask) {
        scaledMask = this._scaleMask(personMask, CONFIG.ANALYSIS_WIDTH, CONFIG.ANALYSIS_HEIGHT);
      }

      // Detect edges
      const edges = this._detectEdges(imageData);

      // Find uniform regions (low edge density, consistent color)
      const regions = this._findUniformRegions(imageData, edges, scaledMask);

      // Score and rank regions
      const scoredRegions = regions
        .map(r => this._scoreRegion(r, imageData, scaledMask))
        .filter(r => r.score > 30) // Minimum score threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, CONFIG.MAX_REGIONS);

      if (scoredRegions.length === 0) {
        return { success: false, regions: [], reason: 'no_walls_found' };
      }

      // Convert to percentage-based regions
      const finalRegions = scoredRegions.map(r => this._convertToPercentRegion(r));

      console.log(`[WallDetector] Found ${finalRegions.length} wall regions`);
      return { success: true, regions: finalRegions };

    } catch (error) {
      console.error('[WallDetector] Detection failed:', error);
      return { success: false, regions: [], reason: 'detection_error' };
    }
  }

  /**
   * Detect edges using Sobel operator
   * @param {ImageData} imageData
   * @returns {Uint8ClampedArray} Edge magnitude map
   * @private
   */
  _detectEdges(imageData) {
    const { width, height, data } = imageData;
    const edges = new Uint8ClampedArray(width * height);

    // Convert to grayscale and apply Sobel
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Sobel kernels
        let gx = 0, gy = 0;

        // Get grayscale values for 3x3 neighborhood
        const getGray = (px, py) => {
          const idx = (py * width + px) * 4;
          return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        };

        // Sobel X
        gx = -getGray(x - 1, y - 1) + getGray(x + 1, y - 1)
           - 2 * getGray(x - 1, y) + 2 * getGray(x + 1, y)
           - getGray(x - 1, y + 1) + getGray(x + 1, y + 1);

        // Sobel Y
        gy = -getGray(x - 1, y - 1) - 2 * getGray(x, y - 1) - getGray(x + 1, y - 1)
           + getGray(x - 1, y + 1) + 2 * getGray(x, y + 1) + getGray(x + 1, y + 1);

        // Magnitude
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = Math.min(255, magnitude);
      }
    }

    return edges;
  }

  /**
   * Find uniform regions using grid-based analysis
   * @param {ImageData} imageData
   * @param {Uint8ClampedArray} edges
   * @param {Uint8ClampedArray|null} personMask
   * @returns {Array} Array of region candidates
   * @private
   */
  _findUniformRegions(imageData, edges, personMask) {
    const { width, height, data } = imageData;
    const cellWidth = Math.floor(width / CONFIG.GRID_SIZE);
    const cellHeight = Math.floor(height / CONFIG.GRID_SIZE);

    // Analyze each grid cell
    const grid = [];
    for (let gy = 0; gy < CONFIG.GRID_SIZE; gy++) {
      grid[gy] = [];
      for (let gx = 0; gx < CONFIG.GRID_SIZE; gx++) {
        const cell = this._analyzeCell(
          data, edges, personMask,
          gx * cellWidth, gy * cellHeight,
          cellWidth, cellHeight,
          width, height
        );
        grid[gy][gx] = cell;
      }
    }

    // Find connected uniform regions using flood fill
    const visited = Array(CONFIG.GRID_SIZE).fill(null).map(() => Array(CONFIG.GRID_SIZE).fill(false));
    const regions = [];

    for (let gy = 0; gy < CONFIG.GRID_SIZE; gy++) {
      for (let gx = 0; gx < CONFIG.GRID_SIZE; gx++) {
        const cell = grid[gy]?.[gx];
        if (!visited[gy][gx] && cell?.isUniform && !cell?.isPerson) {
          const region = this._floodFillRegion(grid, visited, gx, gy);
          if (region.cells.length >= 2) { // At least 2 cells
            regions.push(region);
          }
        }
      }
    }

    return regions;
  }

  /**
   * Analyze a single grid cell
   * @private
   */
  _analyzeCell(data, edges, personMask, x, y, w, h, imgWidth, imgHeight) {
    let totalR = 0, totalG = 0, totalB = 0;
    let totalEdge = 0;
    let personPixels = 0;
    let validPixels = 0;

    const colorSamples = [];

    for (let cy = y; cy < y + h && cy < imgHeight; cy++) {
      for (let cx = x; cx < x + w && cx < imgWidth; cx++) {
        const idx = cy * imgWidth + cx;
        const pixelIdx = idx * 4;

        // Check person mask
        if (personMask && personMask[pixelIdx] > 128) {
          personPixels++;
          continue;
        }

        totalR += data[pixelIdx];
        totalG += data[pixelIdx + 1];
        totalB += data[pixelIdx + 2];
        totalEdge += edges[idx];
        validPixels++;

        // Sample colors for variance calculation
        if (validPixels % 4 === 0) {
          colorSamples.push({
            r: data[pixelIdx],
            g: data[pixelIdx + 1],
            b: data[pixelIdx + 2]
          });
        }
      }
    }

    const totalPixels = w * h;
    const isPerson = personPixels > totalPixels * 0.5;

    if (validPixels === 0) {
      return { isUniform: false, isPerson, avgColor: null, edgeDensity: 1 };
    }

    const avgColor = {
      r: totalR / validPixels,
      g: totalG / validPixels,
      b: totalB / validPixels
    };

    const edgeDensity = totalEdge / validPixels / 255;

    // Calculate color variance
    let variance = 0;
    for (const sample of colorSamples) {
      variance += Math.pow(sample.r - avgColor.r, 2);
      variance += Math.pow(sample.g - avgColor.g, 2);
      variance += Math.pow(sample.b - avgColor.b, 2);
    }
    variance = colorSamples.length > 0 ? Math.sqrt(variance / colorSamples.length / 3) : 0;

    const isUniform = variance < CONFIG.COLOR_VARIANCE_THRESHOLD && edgeDensity < 0.15;

    return { isUniform, isPerson, avgColor, edgeDensity, variance };
  }

  /**
   * Flood fill to find connected uniform cells
   * @private
   */
  _floodFillRegion(grid, visited, startX, startY) {
    const cells = [];
    const queue = [{ x: startX, y: startY }];
    const baseColor = grid[startY][startX].avgColor;

    while (queue.length > 0) {
      const { x, y } = queue.shift();

      if (x < 0 || x >= CONFIG.GRID_SIZE || y < 0 || y >= CONFIG.GRID_SIZE) continue;
      if (visited[y][x]) continue;
      if (!grid[y][x].isUniform || grid[y][x].isPerson) continue;

      // Check color similarity with base color
      const cell = grid[y][x];
      if (baseColor && cell.avgColor) {
        const colorDiff = Math.sqrt(
          Math.pow(cell.avgColor.r - baseColor.r, 2) +
          Math.pow(cell.avgColor.g - baseColor.g, 2) +
          Math.pow(cell.avgColor.b - baseColor.b, 2)
        );
        if (colorDiff > 40) continue; // Too different in color
      }

      visited[y][x] = true;
      cells.push({ x, y, cell });

      // Add neighbors
      queue.push({ x: x - 1, y });
      queue.push({ x: x + 1, y });
      queue.push({ x, y: y - 1 });
      queue.push({ x, y: y + 1 });
    }

    // Calculate bounding box
    let minX = CONFIG.GRID_SIZE, minY = CONFIG.GRID_SIZE;
    let maxX = 0, maxY = 0;
    let totalR = 0, totalG = 0, totalB = 0;

    for (const { x, y, cell } of cells) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (cell.avgColor) {
        totalR += cell.avgColor.r;
        totalG += cell.avgColor.g;
        totalB += cell.avgColor.b;
      }
    }

    return {
      cells,
      bounds: { minX, minY, maxX, maxY },
      avgColor: cells.length > 0 ? {
        r: totalR / cells.length,
        g: totalG / cells.length,
        b: totalB / cells.length
      } : null
    };
  }

  /**
   * Score a region for wall-likeness
   * @private
   */
  _scoreRegion(region, _imageData, _personMask) {
    let score = 0;
    const { bounds, cells, avgColor: _avgColor } = region;
    const { minX, minY, maxX, maxY } = bounds;

    // Calculate region properties
    const width = (maxX - minX + 1) / CONFIG.GRID_SIZE;
    const height = (maxY - minY + 1) / CONFIG.GRID_SIZE;
    const area = cells.length / (CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);

    // Size score (prefer larger regions, but not too large)
    if (area >= CONFIG.MIN_REGION_SIZE && area <= CONFIG.MAX_REGION_SIZE) {
      score += Math.min(area * 100, CONFIG.SCORE_SIZE);
    }

    // Uniformity score (already filtered, but can boost very uniform regions)
    const avgVariance = cells.reduce((sum, c) => sum + (c.cell.variance || 0), 0) / cells.length;
    score += Math.max(0, CONFIG.SCORE_UNIFORMITY - avgVariance);

    // Position score (prefer upper-center regions - more likely walls)
    const centerX = (minX + maxX) / 2 / CONFIG.GRID_SIZE;
    const centerY = (minY + maxY) / 2 / CONFIG.GRID_SIZE;
    const xScore = 1 - Math.abs(centerX - 0.5) * 2; // 1 at center, 0 at edges
    const yScore = 1 - centerY; // Higher score for upper regions
    score += (xScore * 0.5 + yScore * 0.5) * CONFIG.SCORE_POSITION;

    // Rectangular score
    const expectedCells = (maxX - minX + 1) * (maxY - minY + 1);
    const rectangularity = cells.length / expectedCells;
    score += rectangularity * CONFIG.SCORE_RECTANGULAR;

    // Vertical orientation score (walls are usually taller than wide)
    if (height >= width) {
      score += CONFIG.SCORE_VERTICAL * Math.min(height / width, 2) / 2;
    }

    return {
      ...region,
      score: Math.round(score),
      area,
      width,
      height
    };
  }

  /**
   * Convert region to percentage-based coordinates
   * @private
   */
  _convertToPercentRegion(region) {
    const { bounds, score, avgColor, area } = region;
    const { minX, minY, maxX, maxY } = bounds;

    // Convert grid coordinates to percentages
    const x = (minX / CONFIG.GRID_SIZE) * 100;
    const y = (minY / CONFIG.GRID_SIZE) * 100;
    const w = ((maxX - minX + 1) / CONFIG.GRID_SIZE) * 100;
    const h = ((maxY - minY + 1) / CONFIG.GRID_SIZE) * 100;

    // Add small margin
    const margin = 2;
    const finalX = Math.max(0, x + margin);
    const finalY = Math.max(0, y + margin);
    const finalW = Math.min(100 - finalX, w - margin * 2);
    const finalH = Math.min(100 - finalY, h - margin * 2);

    return {
      bounds: { x: finalX, y: finalY, width: finalW, height: finalH },
      region: {
        topLeft: { x: finalX, y: finalY },
        topRight: { x: finalX + finalW, y: finalY },
        bottomLeft: { x: finalX, y: finalY + finalH },
        bottomRight: { x: finalX + finalW, y: finalY + finalH }
      },
      score,
      color: avgColor,
      area
    };
  }

  /**
   * Scale person mask to analysis resolution
   * @private
   */
  _scaleMask(mask, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = mask.width;
    tempCanvas.height = mask.height;
    tempCtx.putImageData(mask, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight).data;
  }

  /**
   * Reset detector state
   */
  reset() {
    this.initialized = false;
    console.log('[WallDetector] Reset');
  }
}

// Export for use in inject.js
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = { WallDetector, CONFIG };
}

// Make available globally for browser context
window.WallDetector = WallDetector;
window.WALL_DETECTOR_CONFIG = CONFIG;
