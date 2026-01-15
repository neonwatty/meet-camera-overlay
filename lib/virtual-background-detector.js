/* global MutationObserver, Node */
/**
 * Virtual Background Detector Module
 *
 * Detects when Google Meet's native virtual background feature is enabled.
 * When detected, wall art should be disabled with an explanation since
 * Meet's virtual background replaces the entire background, making wall art
 * ineffective.
 *
 * Detection strategies:
 * 1. DOM observation for virtual background UI elements
 * 2. Settings panel state monitoring
 * 3. Video element attribute changes
 */

/**
 * @typedef {Object} VirtualBackgroundStatus
 * @property {boolean} enabled - Whether virtual background is detected as enabled
 * @property {'blur' | 'image' | 'none'} type - Type of virtual background
 * @property {string|null} reason - Human-readable reason for the status
 */

/**
 * Known selectors and attributes for Meet's virtual background feature.
 * These may change as Meet updates its UI.
 */
const DETECTION_SELECTORS = {
  // Settings panel that contains background options
  settingsPanel: '[data-panel-id="settings"]',

  // Background effects button/toggle (multiple possible selectors)
  backgroundToggle: [
    '[aria-label*="background"]',
    '[aria-label*="Background"]',
    '[data-tooltip*="background"]',
    '[data-tooltip*="Background"]'
  ],

  // Active background effect indicators
  activeBlur: [
    '[aria-pressed="true"][aria-label*="blur"]',
    '[aria-pressed="true"][aria-label*="Blur"]',
    '[data-is-active="true"][data-effect-type="blur"]'
  ],

  activeBackground: [
    '[aria-pressed="true"][aria-label*="background"]',
    '[aria-selected="true"][role="option"]',
    '[data-is-active="true"][data-effect-type="background"]'
  ],

  // Video element that may have processing attributes
  videoElement: 'video[data-self-video="true"]',

  // Effect preview indicators
  effectPreview: '[data-effect-preview]'
};

/**
 * Class attributes that indicate virtual background is active
 */
const ACTIVE_CLASS_PATTERNS = [
  /background.*active/i,
  /blur.*enabled/i,
  /effect.*applied/i,
  /virtual.*bg/i
];

/**
 * VirtualBackgroundDetector class
 * Monitors the DOM for changes that indicate virtual background status.
 */
export class VirtualBackgroundDetector {
  /**
   * @param {Object} options
   * @param {function(VirtualBackgroundStatus): void} [options.onStatusChange] - Callback when status changes
   * @param {number} [options.pollInterval=2000] - Polling interval in ms for fallback detection
   */
  constructor(options = {}) {
    this.onStatusChange = options.onStatusChange || null;
    this.pollInterval = options.pollInterval || 2000;

    /** @type {VirtualBackgroundStatus} */
    this.currentStatus = {
      enabled: false,
      type: 'none',
      reason: null
    };

    this.observer = null;
    this.pollTimer = null;
    this.isRunning = false;
  }

  /**
   * Start monitoring for virtual background status.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial check
    this.checkStatus();

    // Set up MutationObserver for DOM changes
    this.setupObserver();

    // Set up polling as fallback (in case observer misses something)
    this.pollTimer = setInterval(() => this.checkStatus(), this.pollInterval);

    console.log('[VirtualBackgroundDetector] Started monitoring');
  }

  /**
   * Stop monitoring.
   */
  stop() {
    this.isRunning = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    console.log('[VirtualBackgroundDetector] Stopped monitoring');
  }

  /**
   * Set up MutationObserver to watch for relevant DOM changes.
   */
  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Check if any mutation is relevant to virtual background
      const isRelevant = mutations.some(mutation => {
        // Check for attribute changes on buttons/toggles
        if (mutation.type === 'attributes') {
          const target = /** @type {Element} */ (mutation.target);
          const ariaLabel = target.getAttribute('aria-label') || '';
          const ariaPressed = target.getAttribute('aria-pressed');

          if (ariaLabel.toLowerCase().includes('background') ||
              ariaLabel.toLowerCase().includes('blur')) {
            return true;
          }

          if (ariaPressed !== null) {
            return true;
          }
        }

        // Check for added nodes that might be background-related UI
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = /** @type {Element} */ (node);
              const html = element.outerHTML || '';
              if (html.toLowerCase().includes('background') ||
                  html.toLowerCase().includes('blur')) {
                return true;
              }
            }
          }
        }

        return false;
      });

      if (isRelevant) {
        // Debounce the check slightly
        setTimeout(() => this.checkStatus(), 100);
      }
    });

    // Observe the entire document for changes
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-pressed', 'aria-selected', 'data-is-active', 'class']
    });
  }

  /**
   * Check current virtual background status.
   * @returns {VirtualBackgroundStatus}
   */
  checkStatus() {
    const newStatus = this.detectStatus();

    // Check if status changed
    if (newStatus.enabled !== this.currentStatus.enabled ||
        newStatus.type !== this.currentStatus.type) {

      const previousStatus = { ...this.currentStatus };
      this.currentStatus = newStatus;

      console.log('[VirtualBackgroundDetector] Status changed:',
        previousStatus, '->', newStatus);

      if (this.onStatusChange) {
        this.onStatusChange(newStatus);
      }
    }

    return this.currentStatus;
  }

  /**
   * Perform actual detection of virtual background status.
   * @returns {VirtualBackgroundStatus}
   */
  detectStatus() {
    // Strategy 1: Check for active blur button
    for (const selector of DETECTION_SELECTORS.activeBlur) {
      const element = document.querySelector(selector);
      if (element) {
        return {
          enabled: true,
          type: 'blur',
          reason: `Blur effect detected via: ${selector}`
        };
      }
    }

    // Strategy 2: Check for active background image
    for (const selector of DETECTION_SELECTORS.activeBackground) {
      const element = document.querySelector(selector);
      if (element) {
        // Check if it's not the "no effect" option
        const label = element.getAttribute('aria-label') || '';
        if (!label.toLowerCase().includes('off') &&
            !label.toLowerCase().includes('none') &&
            !label.toLowerCase().includes('no effect')) {
          return {
            enabled: true,
            type: 'image',
            reason: `Background image detected via: ${selector}`
          };
        }
      }
    }

    // Strategy 3: Check for class patterns
    const allElements = document.querySelectorAll('[class]');
    for (const element of allElements) {
      const className = element.className;
      if (typeof className === 'string') {
        for (const pattern of ACTIVE_CLASS_PATTERNS) {
          if (pattern.test(className)) {
            // Additional check: make sure it's actually indicating active state
            const ariaPressed = element.getAttribute('aria-pressed');
            if (ariaPressed === 'true') {
              return {
                enabled: true,
                type: 'image',
                reason: `Background detected via class pattern: ${className}`
              };
            }
          }
        }
      }
    }

    // Strategy 4: Check video element for processing attributes
    const videoElement = document.querySelector(DETECTION_SELECTORS.videoElement);
    if (videoElement) {
      const dataAttributes = Array.from(videoElement.attributes)
        .filter(attr => attr.name.startsWith('data-'))
        .map(attr => `${attr.name}="${attr.value}"`);

      // Check for processing-related attributes
      for (const attr of dataAttributes) {
        if (attr.includes('blur') || attr.includes('background') || attr.includes('effect')) {
          return {
            enabled: true,
            type: 'image',
            reason: `Video processing detected: ${attr}`
          };
        }
      }
    }

    // No virtual background detected
    return {
      enabled: false,
      type: 'none',
      reason: null
    };
  }

  /**
   * Get current status without checking.
   * @returns {VirtualBackgroundStatus}
   */
  getStatus() {
    return { ...this.currentStatus };
  }

  /**
   * Force a status check and return the result.
   * @returns {VirtualBackgroundStatus}
   */
  forceCheck() {
    return this.checkStatus();
  }
}

/**
 * Create a singleton detector instance.
 * @param {Object} options - Detector options
 * @returns {VirtualBackgroundDetector}
 */
export function createDetector(options) {
  return new VirtualBackgroundDetector(options);
}

/**
 * Quick check function for one-time detection.
 * @returns {VirtualBackgroundStatus}
 */
export function checkVirtualBackground() {
  const detector = new VirtualBackgroundDetector();
  return detector.detectStatus();
}
