// Content script - runs in isolated world
// Injects our script into the page context so we can intercept getUserMedia

console.log('[Meet Overlay] Content script loading...');

// Inject the script into page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => {
  console.log('[Meet Overlay] Inject script loaded');
  script.remove();

  // Send initial overlays from chrome.storage to the injected script
  setTimeout(() => {
    chrome.storage.local.get(['overlays'], (result) => {
      const overlays = result.overlays || [];
      console.log('[Meet Overlay] Sending initial overlays:', overlays.length);
      window.postMessage({ type: 'MEET_OVERLAY_UPDATE', overlays }, '*');
    });
  }, 500);
};
script.onerror = (e) => {
  console.error('[Meet Overlay] Failed to load inject script:', e);
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from popup and forward to page context
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Meet Overlay] Received message from popup:', message.type);

  if (message.type === 'UPDATE_OVERLAYS') {
    window.postMessage({ type: 'MEET_OVERLAY_UPDATE', overlays: message.overlays }, '*');
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
