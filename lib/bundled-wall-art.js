/**
 * Bundled Wall Art - Curated gallery of default wall art images
 *
 * Categories:
 * - abstract: Gradients, shapes, and artistic backgrounds
 * - nature: Landscapes, plants, and natural scenes
 * - patterns: Geometric and decorative patterns
 * - solid: Simple solid color backgrounds
 * - office: Professional/office-appropriate backgrounds
 * - seasonal: Holiday and seasonal themes
 */

export const WALL_ART_CATEGORIES = [
  { id: 'abstract', name: 'Abstract', icon: '🎨' },
  { id: 'nature', name: 'Nature', icon: '🌿' },
  { id: 'patterns', name: 'Patterns', icon: '🔷' },
  { id: 'solid', name: 'Solid Colors', icon: '🟦' },
  { id: 'office', name: 'Office', icon: '🏢' },
  { id: 'seasonal', name: 'Seasonal', icon: '🎄' }
];

export const BUNDLED_WALL_ART = [
  // Abstract (5)
  { id: 'wa-abstract-1', name: 'Blue Gradient', file: 'abstract-blue.png', category: 'abstract' },
  { id: 'wa-abstract-2', name: 'Warm Sunset', file: 'abstract-sunset.png', category: 'abstract' },
  { id: 'wa-abstract-3', name: 'Purple Haze', file: 'abstract-purple.png', category: 'abstract' },
  { id: 'wa-abstract-4', name: 'Ocean Wave', file: 'abstract-ocean.png', category: 'abstract' },
  { id: 'wa-abstract-5', name: 'Forest Green', file: 'abstract-green.png', category: 'abstract' },

  // Nature (5)
  { id: 'wa-nature-1', name: 'Mountain View', file: 'nature-mountain.png', category: 'nature' },
  { id: 'wa-nature-2', name: 'Beach Sunset', file: 'nature-beach.png', category: 'nature' },
  { id: 'wa-nature-3', name: 'Green Leaves', file: 'nature-leaves.png', category: 'nature' },
  { id: 'wa-nature-4', name: 'Cloudy Sky', file: 'nature-sky.png', category: 'nature' },
  { id: 'wa-nature-5', name: 'Autumn Trees', file: 'nature-autumn.png', category: 'nature' },

  // Patterns (5)
  { id: 'wa-pattern-1', name: 'Geometric', file: 'pattern-geometric.png', category: 'patterns' },
  { id: 'wa-pattern-2', name: 'Hexagons', file: 'pattern-hexagon.png', category: 'patterns' },
  { id: 'wa-pattern-3', name: 'Waves', file: 'pattern-waves.png', category: 'patterns' },
  { id: 'wa-pattern-4', name: 'Dots', file: 'pattern-dots.png', category: 'patterns' },
  { id: 'wa-pattern-5', name: 'Lines', file: 'pattern-lines.png', category: 'patterns' },

  // Solid Colors (5)
  { id: 'wa-solid-1', name: 'Navy Blue', file: 'solid-navy.png', category: 'solid' },
  { id: 'wa-solid-2', name: 'Forest Green', file: 'solid-green.png', category: 'solid' },
  { id: 'wa-solid-3', name: 'Warm Gray', file: 'solid-gray.png', category: 'solid' },
  { id: 'wa-solid-4', name: 'Soft White', file: 'solid-white.png', category: 'solid' },
  { id: 'wa-solid-5', name: 'Deep Purple', file: 'solid-purple.png', category: 'solid' },

  // Office (5)
  { id: 'wa-office-1', name: 'Bookshelf', file: 'office-bookshelf.png', category: 'office' },
  { id: 'wa-office-2', name: 'Plant Wall', file: 'office-plants.png', category: 'office' },
  { id: 'wa-office-3', name: 'Brick Wall', file: 'office-brick.png', category: 'office' },
  { id: 'wa-office-4', name: 'Wood Panel', file: 'office-wood.png', category: 'office' },
  { id: 'wa-office-5', name: 'Modern Art', file: 'office-art.png', category: 'office' },

  // Seasonal (5)
  { id: 'wa-seasonal-1', name: 'Winter Snow', file: 'seasonal-winter.png', category: 'seasonal' },
  { id: 'wa-seasonal-2', name: 'Spring Flowers', file: 'seasonal-spring.png', category: 'seasonal' },
  { id: 'wa-seasonal-3', name: 'Summer Beach', file: 'seasonal-summer.png', category: 'seasonal' },
  { id: 'wa-seasonal-4', name: 'Fall Leaves', file: 'seasonal-fall.png', category: 'seasonal' },
  { id: 'wa-seasonal-5', name: 'Holiday Lights', file: 'seasonal-holiday.png', category: 'seasonal' }
];

/**
 * Create a bundled wall art object with full URL
 * @param {Object} art - Art definition from BUNDLED_WALL_ART
 * @param {string} extensionUrl - Base URL for extension assets
 * @returns {Object} Wall art object ready for use
 */
export function createBundledWallArtItem(art, extensionUrl) {
  return {
    id: art.id,
    name: art.name,
    src: `${extensionUrl}assets/wall-art/${art.file}`,
    category: art.category,
    isBundled: true
  };
}

/**
 * Get all bundled wall art items with full URLs
 * @param {string} extensionUrl - Base URL for extension assets
 * @returns {Array} Array of wall art items
 */
export function getAllBundledWallArt(extensionUrl) {
  return BUNDLED_WALL_ART.map(art => createBundledWallArtItem(art, extensionUrl));
}

/**
 * Get bundled wall art items by category
 * @param {string} category - Category ID
 * @param {string} extensionUrl - Base URL for extension assets
 * @returns {Array} Array of wall art items in the category
 */
export function getBundledWallArtByCategory(category, extensionUrl) {
  return BUNDLED_WALL_ART
    .filter(art => art.category === category)
    .map(art => createBundledWallArtItem(art, extensionUrl));
}
