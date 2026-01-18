/**
 * Edge Detector - Detects edges in video frames using Sobel operator
 * Used for snapping wall art regions to natural boundaries like picture frames
 */

/**
 * EdgeDetector class for finding edges in images
 */
class EdgeDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 50;
    this.blurRadius = options.blurRadius || 1;
    this.minLineLength = options.minLineLength || 20; // Minimum pixels for a valid line
  }

  /**
   * Convert RGBA image data to grayscale
   * @param {Uint8ClampedArray} data - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Uint8Array} Grayscale values
   */
  toGrayscale(data, width, height) {
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      // Luminance formula: 0.299R + 0.587G + 0.114B
      gray[i] = Math.round(
        data[idx] * 0.299 +
        data[idx + 1] * 0.587 +
        data[idx + 2] * 0.114
      );
    }
    return gray;
  }

  /**
   * Apply simple box blur to reduce noise
   * @param {Uint8Array} gray - Grayscale values
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Uint8Array} Blurred grayscale values
   */
  boxBlur(gray, width, height) {
    const blurred = new Uint8Array(width * height);
    const radius = this.blurRadius;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              sum += gray[ny * width + nx];
              count++;
            }
          }
        }

        blurred[y * width + x] = Math.round(sum / count);
      }
    }

    return blurred;
  }

  /**
   * Detect edges using Sobel operator
   * @param {ImageData} imageData - Canvas ImageData object
   * @returns {Object} Edge map with edges array, width, height, and gradient directions
   */
  detectEdges(imageData) {
    const { width, height, data } = imageData;

    // Convert to grayscale
    const gray = this.toGrayscale(data, width, height);

    // Apply blur to reduce noise
    const blurred = this.boxBlur(gray, width, height);

    // Edge magnitude and direction arrays
    const edges = new Uint8Array(width * height);
    const directions = new Float32Array(width * height);

    // Sobel kernels
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    // Apply Sobel operator
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0;
        let gy = 0;

        // Convolve with Sobel kernels
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const ki = (ky + 1) * 3 + (kx + 1);
            gx += blurred[idx] * sobelX[ki];
            gy += blurred[idx] * sobelY[ki];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const idx = y * width + x;

        edges[idx] = magnitude > this.threshold ? Math.min(255, Math.round(magnitude)) : 0;
        directions[idx] = Math.atan2(gy, gx);
      }
    }

    return { edges, directions, width, height };
  }

  /**
   * Find edge points near a given coordinate
   * @param {number} x - X coordinate (0-100 percentage)
   * @param {number} y - Y coordinate (0-100 percentage)
   * @param {number} radius - Search radius in percentage
   * @param {Object} edgeMap - Edge map from detectEdges
   * @returns {Array} Array of nearby edge points with strength
   */
  findNearbyEdges(x, y, radius, edgeMap) {
    const { edges, directions, width, height } = edgeMap;
    const nearbyEdges = [];

    // Convert percentage to pixels
    const px = Math.round((x / 100) * width);
    const py = Math.round((y / 100) * height);
    const pr = Math.round((radius / 100) * Math.min(width, height));

    // Search in radius
    for (let dy = -pr; dy <= pr; dy++) {
      for (let dx = -pr; dx <= pr; dx++) {
        const nx = px + dx;
        const ny = py + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const idx = ny * width + nx;
          if (edges[idx] > 0) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= pr) {
              nearbyEdges.push({
                x: (nx / width) * 100,
                y: (ny / height) * 100,
                strength: edges[idx],
                direction: directions[idx],
                distance: (distance / pr) * radius
              });
            }
          }
        }
      }
    }

    // Sort by distance (closest first)
    nearbyEdges.sort((a, b) => a.distance - b.distance);

    return nearbyEdges;
  }

  /**
   * Find strong vertical edges (useful for picture frame sides)
   * @param {Object} edgeMap - Edge map from detectEdges
   * @returns {Array} Array of vertical edge lines
   */
  findVerticalEdges(edgeMap) {
    const { edges, directions, width, height } = edgeMap;
    const verticalLines = [];

    // Scan for vertical edges (direction near 0 or PI means vertical edge)
    for (let x = 0; x < width; x++) {
      let lineStart = null;
      let lineLength = 0;

      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        const isVerticalEdge = edges[idx] > 0 &&
          (Math.abs(directions[idx]) < 0.3 || Math.abs(directions[idx] - Math.PI) < 0.3 ||
           Math.abs(directions[idx] + Math.PI) < 0.3);

        if (isVerticalEdge) {
          if (lineStart === null) {
            lineStart = y;
          }
          lineLength++;
        } else {
          if (lineLength >= this.minLineLength) {
            verticalLines.push({
              x: (x / width) * 100,
              yStart: (lineStart / height) * 100,
              yEnd: ((lineStart + lineLength) / height) * 100,
              length: lineLength
            });
          }
          lineStart = null;
          lineLength = 0;
        }
      }

      // Check end of column
      if (lineLength >= this.minLineLength) {
        verticalLines.push({
          x: (x / width) * 100,
          yStart: (lineStart / height) * 100,
          yEnd: ((lineStart + lineLength) / height) * 100,
          length: lineLength
        });
      }
    }

    return verticalLines;
  }

  /**
   * Find strong horizontal edges (useful for picture frame tops/bottoms)
   * @param {Object} edgeMap - Edge map from detectEdges
   * @returns {Array} Array of horizontal edge lines
   */
  findHorizontalEdges(edgeMap) {
    const { edges, directions, width, height } = edgeMap;
    const horizontalLines = [];

    // Scan for horizontal edges (direction near PI/2 or -PI/2 means horizontal edge)
    for (let y = 0; y < height; y++) {
      let lineStart = null;
      let lineLength = 0;

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const isHorizontalEdge = edges[idx] > 0 &&
          (Math.abs(directions[idx] - Math.PI / 2) < 0.3 ||
           Math.abs(directions[idx] + Math.PI / 2) < 0.3);

        if (isHorizontalEdge) {
          if (lineStart === null) {
            lineStart = x;
          }
          lineLength++;
        } else {
          if (lineLength >= this.minLineLength) {
            horizontalLines.push({
              y: (y / height) * 100,
              xStart: (lineStart / width) * 100,
              xEnd: ((lineStart + lineLength) / width) * 100,
              length: lineLength
            });
          }
          lineStart = null;
          lineLength = 0;
        }
      }

      // Check end of row
      if (lineLength >= this.minLineLength) {
        horizontalLines.push({
          y: (y / height) * 100,
          xStart: (lineStart / width) * 100,
          xEnd: ((lineStart + lineLength) / width) * 100,
          length: lineLength
        });
      }
    }

    return horizontalLines;
  }

  /**
   * Find the closest edge point to snap to
   * @param {number} x - X coordinate (0-100 percentage)
   * @param {number} y - Y coordinate (0-100 percentage)
   * @param {number} snapRadius - Maximum snap distance in percentage
   * @param {Object} edgeMap - Edge map from detectEdges
   * @returns {Object|null} Closest edge point or null if none within radius
   */
  findSnapPoint(x, y, snapRadius, edgeMap) {
    const nearbyEdges = this.findNearbyEdges(x, y, snapRadius, edgeMap);

    if (nearbyEdges.length === 0) {
      return null;
    }

    // Return the closest strong edge
    const strongest = nearbyEdges
      .filter(e => e.strength > this.threshold * 1.5)
      .sort((a, b) => a.distance - b.distance)[0];

    return strongest || nearbyEdges[0];
  }
}

// Export for use in inject.js context
if (typeof window !== 'undefined') {
  window.EdgeDetector = EdgeDetector;
}

// Export for module context (Node.js/CommonJS)
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = { EdgeDetector };
}
