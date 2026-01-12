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
    await injectScript('lib/gif-decoder.js');
    await injectScript('inject.js');

    // Send initial overlays from chrome.storage to the injected script
    setTimeout(() => {
      chrome.storage.local.get(['overlays'], (result) => {
        const overlays = result.overlays || [];
        console.log('[Meet Overlay] Sending initial overlays:', overlays.length);
        window.postMessage({ type: 'MEET_OVERLAY_UPDATE', overlays }, '*');
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
});

console.log('[Meet Overlay] Content script initialized');
