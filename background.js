/**
 * Background Service Worker
 *
 * Handles extension installation and loads bundled effects.
 */

import { BUNDLED_EFFECTS, createBundledEffect } from './lib/bundled-effects.js';

// Run on extension install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set first-use flag for tutorial
    await chrome.storage.local.set({ showTutorial: true });
    console.log('[Meet Camera Overlay] First-use flag set');

    await loadBundledEffects();
    console.log('[Meet Camera Overlay] Bundled effects loaded on install');
  }
});

/**
 * Load bundled effects into storage on first install
 */
async function loadBundledEffects() {
  const result = await chrome.storage.local.get(['overlays']);
  const overlays = result.overlays || [];

  // Check if bundled effects already exist
  const hasBundled = overlays.some(o => o.category === 'bundled');
  if (hasBundled) {
    console.log('[Meet Camera Overlay] Bundled effects already exist, skipping');
    return;
  }

  // Create bundled effects with extension URLs
  const extensionUrl = chrome.runtime.getURL('');
  const bundledOverlays = BUNDLED_EFFECTS.map(effect =>
    createBundledEffect(effect, extensionUrl)
  );

  // Save to storage
  await chrome.storage.local.set({
    overlays: [...overlays, ...bundledOverlays]
  });

  console.log(`[Meet Camera Overlay] Added ${bundledOverlays.length} bundled effects`);
}
