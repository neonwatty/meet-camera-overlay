/**
 * Snap Engine - Provides snapping functionality for wall art region corners
 * Supports snapping to: detected edges, grid lines, and alignment with other corners
 */

/**
 * SnapEngine class for intelligent corner snapping
 */
class SnapEngine {
  constructor(options = {}) {
    this.snapThreshold = options.snapThreshold || 3; // Percentage distance for snapping
    this.gridSize = options.gridSize || 5; // Grid snap size in percentage
    this.edgeSnapStrength = options.edgeSnapStrength || 1.0; // Multiplier for edge snap priority
    this.alignSnapStrength = options.alignSnapStrength || 0.8; // Multiplier for alignment snap priority
    this.gridSnapStrength = options.gridSnapStrength || 0.5; // Multiplier for grid snap priority
  }

  /**
   * Calculate distance between two points
   * @param {Object} p1 - First point {x, y}
   * @param {Object} p2 - Second point {x, y}
   * @returns {number} Distance between points
   */
  distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Snap a point to the nearest grid intersection
   * @param {Object} point - Point to snap {x, y}
   * @returns {Object} Snapped point
   */
  snapToGrid(point) {
    return {
      x: Math.round(point.x / this.gridSize) * this.gridSize,
      y: Math.round(point.y / this.gridSize) * this.gridSize
    };
  }

  /**
   * Find all snap candidates for a point
   * @param {Object} point - Current point {x, y} in percentage coordinates
   * @param {Object|null} edgeDetector - EdgeDetector instance (optional)
   * @param {Object|null} edgeMap - Edge map from EdgeDetector.detectEdges (optional)
   * @param {Array} otherCorners - Array of other corner points to align with
   * @returns {Array} Array of snap candidates with type, point, and priority
   */
  getSnapCandidates(point, edgeDetector, edgeMap, otherCorners = []) {
    const candidates = [];

    // 1. Check for edge snapping (highest priority)
    if (edgeDetector && edgeMap) {
      const edgeSnap = edgeDetector.findSnapPoint(point.x, point.y, this.snapThreshold, edgeMap);
      if (edgeSnap) {
        candidates.push({
          type: 'edge',
          point: { x: edgeSnap.x, y: edgeSnap.y },
          distance: edgeSnap.distance,
          priority: this.edgeSnapStrength * (1 - edgeSnap.distance / this.snapThreshold),
          strength: edgeSnap.strength
        });
      }
    }

    // 2. Check for alignment with other corners
    for (const corner of otherCorners) {
      // Vertical alignment (same X)
      if (Math.abs(point.x - corner.x) < this.snapThreshold) {
        const alignPoint = { x: corner.x, y: point.y };
        const dist = Math.abs(point.x - corner.x);
        candidates.push({
          type: 'align-vertical',
          point: alignPoint,
          alignWith: corner,
          distance: dist,
          priority: this.alignSnapStrength * (1 - dist / this.snapThreshold)
        });
      }

      // Horizontal alignment (same Y)
      if (Math.abs(point.y - corner.y) < this.snapThreshold) {
        const alignPoint = { x: point.x, y: corner.y };
        const dist = Math.abs(point.y - corner.y);
        candidates.push({
          type: 'align-horizontal',
          point: alignPoint,
          alignWith: corner,
          distance: dist,
          priority: this.alignSnapStrength * (1 - dist / this.snapThreshold)
        });
      }
    }

    // 3. Check for grid snapping (lowest priority)
    const gridSnap = this.snapToGrid(point);
    const gridDist = this.distance(point, gridSnap);
    if (gridDist < this.snapThreshold) {
      candidates.push({
        type: 'grid',
        point: gridSnap,
        distance: gridDist,
        priority: this.gridSnapStrength * (1 - gridDist / this.snapThreshold)
      });
    }

    // Sort by priority (highest first)
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates;
  }

  /**
   * Apply the best snap to a point
   * @param {Object} point - Current point {x, y}
   * @param {Array} candidates - Snap candidates from getSnapCandidates
   * @returns {Object} Result with snapped point and snap info
   */
  applyBestSnap(point, candidates) {
    if (candidates.length === 0) {
      return {
        point: point,
        snapped: false,
        snapType: null
      };
    }

    // Get the highest priority candidate
    const best = candidates[0];

    return {
      point: best.point,
      snapped: true,
      snapType: best.type,
      snapInfo: best
    };
  }

  /**
   * Get snap guides to display for visualization
   * @param {Object} point - Current point being dragged
   * @param {Array} candidates - Snap candidates
   * @param {Object} _region - Current region with all corners (unused)
   * @returns {Array} Array of guide lines to draw
   */
  getSnapGuides(point, candidates, _region) {
    const guides = [];

    for (const candidate of candidates) {
      if (candidate.type === 'align-vertical') {
        // Vertical guide line
        guides.push({
          type: 'vertical',
          x: candidate.point.x,
          yStart: Math.min(point.y, candidate.alignWith.y) - 5,
          yEnd: Math.max(point.y, candidate.alignWith.y) + 5,
          color: '#00ff00',
          strength: candidate.priority
        });
      } else if (candidate.type === 'align-horizontal') {
        // Horizontal guide line
        guides.push({
          type: 'horizontal',
          y: candidate.point.y,
          xStart: Math.min(point.x, candidate.alignWith.x) - 5,
          xEnd: Math.max(point.x, candidate.alignWith.x) + 5,
          color: '#00ff00',
          strength: candidate.priority
        });
      } else if (candidate.type === 'edge') {
        // Edge snap indicator
        guides.push({
          type: 'edge-indicator',
          x: candidate.point.x,
          y: candidate.point.y,
          radius: 1.5,
          color: '#ff6600',
          strength: candidate.priority
        });
      } else if (candidate.type === 'grid') {
        // Grid snap indicator
        guides.push({
          type: 'grid-indicator',
          x: candidate.point.x,
          y: candidate.point.y,
          color: '#0066ff',
          strength: candidate.priority
        });
      }
    }

    return guides;
  }

  /**
   * Check if a region would be valid after moving a corner
   * @param {Object} region - Current region
   * @param {string} cornerName - Name of corner being moved (topLeft, topRight, bottomLeft, bottomRight)
   * @param {Object} newPosition - New position for the corner
   * @returns {boolean} True if the resulting region would be valid
   */
  isValidRegion(region, cornerName, newPosition) {
    // Create a copy of the region with the new corner position
    const testRegion = JSON.parse(JSON.stringify(region));
    testRegion[cornerName] = newPosition;

    // Check minimum size (at least 5% in each dimension)
    const minSize = 5;
    const width = Math.abs(testRegion.topRight.x - testRegion.topLeft.x);
    const height = Math.abs(testRegion.bottomLeft.y - testRegion.topLeft.y);

    if (width < minSize || height < minSize) {
      return false;
    }

    // Check that corners maintain proper relationships
    // Top corners should be above bottom corners
    if (testRegion.topLeft.y >= testRegion.bottomLeft.y ||
        testRegion.topRight.y >= testRegion.bottomRight.y) {
      return false;
    }

    // Left corners should be left of right corners
    if (testRegion.topLeft.x >= testRegion.topRight.x ||
        testRegion.bottomLeft.x >= testRegion.bottomRight.x) {
      return false;
    }

    return true;
  }

  /**
   * Apply snapping with validation
   * @param {Object} point - Current point
   * @param {Array} candidates - Snap candidates
   * @param {Object} region - Current region
   * @param {string} cornerName - Corner being moved
   * @returns {Object} Result with valid snapped point
   */
  applySnapWithValidation(point, candidates, region, cornerName) {
    // Try each candidate in priority order
    for (const candidate of candidates) {
      if (this.isValidRegion(region, cornerName, candidate.point)) {
        return {
          point: candidate.point,
          snapped: true,
          snapType: candidate.type,
          snapInfo: candidate
        };
      }
    }

    // If no snap candidate produces a valid region, check if original point is valid
    if (this.isValidRegion(region, cornerName, point)) {
      return {
        point: point,
        snapped: false,
        snapType: null
      };
    }

    // Return original point if nothing works (will be constrained by editor)
    return {
      point: point,
      snapped: false,
      snapType: null
    };
  }
}

// Export for use in inject.js context
if (typeof window !== 'undefined') {
  window.SnapEngine = SnapEngine;
}

// Export for module context (Node.js/CommonJS)
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = { SnapEngine };
}
