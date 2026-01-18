// Content script - runs in isolated world
// Injects our script into the page context so we can intercept getUserMedia

console.log('[Meet Overlay] Content script loading...');

// Inject scripts into page context (gif-decoder first, then inject.js)
function injectScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.onload = () => {
      console.log(`[Meet Overlay] ${src} loaded`);
      script.remove();
      resolve();
    };
    script.onerror = (e) => {
      console.error(`[Meet Overlay] Failed to load ${src}:`, e);
      reject(e);
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

// Load scripts in order
(async () => {
  try {
    // Load wall art libraries first (they define global functions)
    await injectScript('lib/wall-region.js');
    await injectScript('lib/wall-paint-renderer.js');
    await injectScript('lib/wall-art-renderer.js');
    await injectScript('lib/wall-segmentation.js');
    await injectScript('lib/wall-region-editor.js');
    // Load performance monitor
    await injectScript('lib/performance-monitor.js');
    // Then existing scripts
    await injectScript('lib/gif-decoder.js');
    await injectScript('inject.js');

    // Send initial overlays and wall art from chrome.storage to the injected script
    setTimeout(() => {
      chrome.storage.local.get(['overlays', 'wallArtOverlays', 'wallArtSettings'], (result) => {
        const overlays = result.overlays || [];
        const wallArtOverlays = result.wallArtOverlays || [];
        const wallArtSettings = result.wallArtSettings || {
          segmentationEnabled: false,
          segmentationPreset: 'balanced',
          featherRadius: 2
        };
        console.log('[Meet Overlay] Sending initial overlays:', overlays.length);
        console.log('[Meet Overlay] Sending initial wall art:', wallArtOverlays.length);
        window.postMessage({ type: 'MEET_OVERLAY_UPDATE', overlays }, '*');
        window.postMessage({ type: 'MEET_OVERLAY_UPDATE_WALL_ART', wallArtOverlays }, '*');
        window.postMessage({ type: 'MEET_OVERLAY_UPDATE_WALL_ART_SETTINGS', settings: wallArtSettings }, '*');
      });
    }, 500);
  } catch (e) {
    console.error('[Meet Overlay] Failed to inject scripts:', e);
  }
})();

// Listen for messages from popup and forward to page context
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Meet Overlay] Received message from popup:', message.type);

  if (message.type === 'UPDATE_OVERLAYS') {
    window.postMessage({ type: 'MEET_OVERLAY_UPDATE', overlays: message.overlays }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'TOGGLE_EFFECT') {
    window.postMessage({
      type: 'MEET_OVERLAY_TOGGLE_EFFECT',
      id: message.id,
      active: message.active
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'TOGGLE_TEXT_BANNER') {
    window.postMessage({
      type: 'MEET_OVERLAY_TOGGLE_TEXT_BANNER',
      id: message.id,
      active: message.active
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'TOGGLE_TIMER') {
    window.postMessage({
      type: 'MEET_OVERLAY_TOGGLE_TIMER',
      id: message.id,
      active: message.active
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'TIMER_CONTROL') {
    window.postMessage({
      type: 'MEET_OVERLAY_TIMER_CONTROL',
      id: message.id,
      action: message.action
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'UPDATE_TEXT') {
    window.postMessage({
      type: 'MEET_OVERLAY_UPDATE_TEXT',
      id: message.id,
      text: message.text
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'GET_STATUS') {
    // Check if our injected script is running
    window.postMessage({ type: 'MEET_OVERLAY_PING' }, '*');

    const timeout = setTimeout(() => {
      sendResponse({ active: false });
    }, 500);

    const handler = (event) => {
      if (event.data.type === 'MEET_OVERLAY_PONG') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        sendResponse({ active: true, processing: event.data.processing });
      }
    };
    window.addEventListener('message', handler);

    return true; // Keep channel open for async response
  }

  // Wall Art message handlers
  if (message.type === 'UPDATE_WALL_ART') {
    window.postMessage({
      type: 'MEET_OVERLAY_UPDATE_WALL_ART',
      wallArtOverlays: message.wallArtOverlays
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'TOGGLE_WALL_ART') {
    window.postMessage({
      type: 'MEET_OVERLAY_TOGGLE_WALL_ART',
      id: message.id,
      active: message.active
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'UPDATE_WALL_ART_SETTINGS') {
    window.postMessage({
      type: 'MEET_OVERLAY_UPDATE_WALL_ART_SETTINGS',
      settings: message.settings
    }, '*');
    sendResponse({ success: true });
  }

  // ==================== SETUP WIZARD MESSAGE FORWARDING ====================

  // Forward wizard frame capture request and wait for response
  if (message.type === 'WIZARD_CAPTURE_FRAME') {
    console.log('[Meet Overlay] Forwarding frame capture request...');

    // Post message to inject.js
    window.postMessage({ type: 'MEET_OVERLAY_WIZARD_CAPTURE_FRAME' }, '*');

    // Set up one-time listener for response
    const handler = (event) => {
      if (event.source !== window) return;
      if (event.data.type === 'MEET_OVERLAY_WIZARD_FRAME_CAPTURED') {
        window.removeEventListener('message', handler);
        sendResponse(event.data);
      }
    };
    window.addEventListener('message', handler);

    // Timeout after 5 seconds
    setTimeout(() => {
      window.removeEventListener('message', handler);
      sendResponse({ success: false, error: 'Frame capture timed out' });
    }, 5000);

    return true; // Keep channel open for async response
  }

  // Forward wizard benchmark request and wait for response
  if (message.type === 'WIZARD_RUN_BENCHMARK') {
    console.log('[Meet Overlay] Forwarding benchmark request...');

    // Post message to inject.js
    window.postMessage({ type: 'MEET_OVERLAY_WIZARD_RUN_BENCHMARK' }, '*');

    // Set up one-time listener for response
    const handler = (event) => {
      if (event.source !== window) return;
      if (event.data.type === 'MEET_OVERLAY_WIZARD_BENCHMARK_COMPLETE') {
        window.removeEventListener('message', handler);
        sendResponse(event.data);
      }
    };
    window.addEventListener('message', handler);

    // Timeout after 30 seconds (benchmark can take a while)
    setTimeout(() => {
      window.removeEventListener('message', handler);
      sendResponse({ success: false, error: 'Benchmark timed out', recommendedPreset: 'balanced' });
    }, 30000);

    return true; // Keep channel open for async response
  }

  // Region editor message handlers
  if (message.type === 'SHOW_REGION_EDITOR') {
    window.postMessage({
      type: 'MEET_OVERLAY_REGION_EDITOR_SHOW',
      region: message.region,
      wallArtId: message.wallArtId
    }, '*');
    sendResponse({ success: true });
  }

  if (message.type === 'HIDE_REGION_EDITOR') {
    window.postMessage({
      type: 'MEET_OVERLAY_REGION_EDITOR_HIDE'
    }, '*');
    sendResponse({ success: true });
  }
});

// Listen for messages from inject.js and forward to popup
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  // Forward performance metrics to popup
  if (event.data.type === 'MEET_OVERLAY_PERFORMANCE_METRICS') {
    chrome.runtime.sendMessage({
      type: 'PERFORMANCE_METRICS',
      metrics: event.data.metrics
    }).catch(() => {});
  }

  // Forward region editor results back to extension
  if (event.data.type === 'MEET_OVERLAY_REGION_EDITOR_SAVE') {
    chrome.runtime.sendMessage({
      type: 'REGION_EDITOR_SAVE',
      region: event.data.region,
      wallArtId: event.data.wallArtId
    }).catch(() => {});
  }

  if (event.data.type === 'MEET_OVERLAY_REGION_EDITOR_CANCEL') {
    chrome.runtime.sendMessage({
      type: 'REGION_EDITOR_CANCEL',
      wallArtId: event.data.wallArtId
    }).catch(() => {});
  }

  if (event.data.type === 'MEET_OVERLAY_REGION_EDITOR_UPDATE') {
    chrome.runtime.sendMessage({
      type: 'REGION_EDITOR_UPDATE',
      region: event.data.region,
      wallArtId: event.data.wallArtId
    }).catch(() => {});
  }
});

console.log('[Meet Overlay] Content script initialized');
