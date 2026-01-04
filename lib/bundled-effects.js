/**
 * Bundled Effects Definitions
 *
 * Pre-made aura effects that are loaded on first extension install.
 */

export const BUNDLED_EFFECTS = [
  { id: 'bundled-blue-aura', name: 'Blue Aura', file: 'blue-aura.gif' },
  { id: 'bundled-gold-aura', name: 'Gold Aura', file: 'gold-aura.gif' },
  { id: 'bundled-green-aura', name: 'Green Aura', file: 'green-aura.gif' },
  { id: 'bundled-pink-aura', name: 'Pink Aura', file: 'pink-aura.gif' },
  { id: 'bundled-purple-aura', name: 'Purple Aura', file: 'purple-aura.gif' },
  { id: 'bundled-red-aura', name: 'Red Aura', file: 'red-aura.gif' },
  { id: 'bundled-silver-aura', name: 'Silver Aura', file: 'silver-aura.gif' }
];

/**
 * Create a bundled effect overlay object
 * @param {Object} effect - Effect definition from BUNDLED_EFFECTS
 * @param {string} extensionUrl - Base URL from chrome.runtime.getURL('')
 * @returns {Object} Complete overlay object ready for storage
 */
export function createBundledEffect(effect, extensionUrl) {
  return {
    id: effect.id,
    src: `${extensionUrl}assets/effects/${effect.file}`,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    type: 'effect',
    active: false,
    name: effect.name,
    category: 'bundled',
    layer: 'background',
    zIndex: 0,
    createdAt: Date.now()
  };
}
