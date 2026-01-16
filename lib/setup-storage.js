/**
 * Setup Storage Module
 *
 * Persist and load setup wizard data using chrome.storage.local.
 * Stores reference frame as base64 data URL for efficient retrieval.
 */

const STORAGE_KEY = 'wallArtSetupData';

/**
 * @typedef {Object} BenchmarkResults
 * @property {number} avgSegmentationTime - Average segmentation time in ms
 * @property {number} avgRenderTime - Average render time in ms
 * @property {number} estimatedFps - Estimated achievable FPS
 * @property {'quality' | 'balanced' | 'performance'} recommendedPreset
 * @property {boolean} isUnderpowered - True if device struggles
 * @property {string|null} warning - Warning message for underpowered devices
 */

/**
 * @typedef {Object} PersistedSetupData
 * @property {string} referenceFrameDataUrl - Base64 encoded reference frame
 * @property {number} width - Frame width
 * @property {number} height - Frame height
 * @property {number} capturedAt - Timestamp of capture
 * @property {Object<string, string>} wallColors - Pre-computed colors per region
 * @property {BenchmarkResults} benchmark - Benchmark results
 * @property {string} selectedPreset - User's chosen preset
 */

/**
 * Convert a Blob to a data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Load an image from a data URL.
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Save setup data to storage.
 * @param {Object} data - Setup data to save
 * @param {ImageData} data.medianFrame - Reference frame ImageData
 * @param {number} data.width - Frame width
 * @param {number} data.height - Frame height
 * @param {number} data.capturedAt - Timestamp
 * @param {Object<string, string>} data.wallColors - Pre-computed wall colors
 * @param {BenchmarkResults} data.benchmark - Benchmark results
 * @param {string} data.selectedPreset - User's chosen preset
 * @returns {Promise<void>}
 */
export async function saveSetupData(data) {
  // Convert ImageData to data URL for storage
  const canvas = new OffscreenCanvas(data.width, data.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(data.medianFrame, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await blobToDataUrl(blob);

  const storageData = {
    referenceFrameDataUrl: dataUrl,
    width: data.width,
    height: data.height,
    capturedAt: data.capturedAt,
    wallColors: data.wallColors || {},
    benchmark: data.benchmark,
    selectedPreset: data.selectedPreset
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: storageData });
  console.log('[SetupStorage] Setup data saved');
}

/**
 * Load setup data from storage.
 * @returns {Promise<Object|null>} Setup data with medianFrame as ImageData, or null
 */
export async function loadSetupData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  /** @type {PersistedSetupData | undefined} */
  const data = /** @type {PersistedSetupData | undefined} */ (result[STORAGE_KEY]);

  if (!data) return null;

  try {
    // Convert data URL back to ImageData
    const img = await loadImageFromDataUrl(data.referenceFrameDataUrl);
    const canvas = new OffscreenCanvas(data.width, data.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const medianFrame = ctx.getImageData(0, 0, data.width, data.height);

    return {
      medianFrame,
      width: data.width,
      height: data.height,
      capturedAt: data.capturedAt,
      wallColors: data.wallColors || {},
      benchmark: data.benchmark,
      selectedPreset: data.selectedPreset
    };
  } catch (error) {
    console.error('[SetupStorage] Failed to load setup data:', error);
    return null;
  }
}

/**
 * Check if setup data exists.
 * @returns {Promise<boolean>}
 */
export async function hasSetupData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return !!result[STORAGE_KEY];
}

/**
 * Clear setup data (for recalibration).
 * @returns {Promise<void>}
 */
export async function clearSetupData() {
  await chrome.storage.local.remove(STORAGE_KEY);
  console.log('[SetupStorage] Setup data cleared');
}

/**
 * Get setup metadata without loading the full reference frame image.
 * @returns {Promise<Object|null>} Metadata or null
 */
export async function getSetupMetadata() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  /** @type {PersistedSetupData | undefined} */
  const data = /** @type {PersistedSetupData | undefined} */ (result[STORAGE_KEY]);

  if (!data) return null;

  return {
    capturedAt: data.capturedAt,
    width: data.width,
    height: data.height,
    selectedPreset: data.selectedPreset,
    benchmark: data.benchmark,
    wallColors: data.wallColors
  };
}
