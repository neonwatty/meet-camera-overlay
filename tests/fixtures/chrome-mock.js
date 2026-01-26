/**
 * Chrome Extension API Mock
 *
 * Provides in-memory mocks of chrome.storage, chrome.runtime, etc.
 * for headless integration testing without loading the real extension.
 */
/* global sessionStorage */

(function() {
  // Use sessionStorage for persistence across page reloads within same test
  // Initialize from sessionStorage if available
  const STORAGE_KEY = '__chrome_mock_local';
  const SYNC_STORAGE_KEY = '__chrome_mock_sync';

  let localStorageData = {};
  let syncStorageData = {};

  // Load from sessionStorage on init
  try {
    const savedLocal = sessionStorage.getItem(STORAGE_KEY);
    const savedSync = sessionStorage.getItem(SYNC_STORAGE_KEY);
    if (savedLocal) localStorageData = JSON.parse(savedLocal);
    if (savedSync) syncStorageData = JSON.parse(savedSync);
  } catch (e) {
    console.warn('[Chrome Mock] Failed to load from sessionStorage:', e);
  }

  // Helper to persist to sessionStorage
  function persistLocal() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(localStorageData));
    } catch (e) {
      console.warn('[Chrome Mock] Failed to persist local storage:', e);
    }
  }

  function persistSync() {
    try {
      sessionStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncStorageData));
    } catch (e) {
      console.warn('[Chrome Mock] Failed to persist sync storage:', e);
    }
  }

  // Storage change listeners
  const storageListeners = [];

  // Message listeners
  const messageListeners = [];

  // Create the chrome mock object
  window.chrome = {
    storage: {
      local: {
        get: (keys, callback) => {
          const result = {};
          if (keys === null || keys === undefined) {
            // Return all data
            Object.assign(result, localStorageData);
          } else if (typeof keys === 'string') {
            if (keys in localStorageData) {
              result[keys] = localStorageData[keys];
            }
          } else if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (key in localStorageData) {
                result[key] = localStorageData[key];
              }
            });
          } else if (typeof keys === 'object') {
            // keys is an object with default values
            Object.keys(keys).forEach(key => {
              result[key] = key in localStorageData ? localStorageData[key] : keys[key];
            });
          }

          if (callback) {
            setTimeout(() => callback(result), 0);
          }
          return Promise.resolve(result);
        },

        set: (items, callback) => {
          const changes = {};
          Object.entries(items).forEach(([key, newValue]) => {
            const oldValue = localStorageData[key];
            localStorageData[key] = newValue;
            changes[key] = { oldValue, newValue };
          });

          // Persist to sessionStorage
          persistLocal();

          // Notify listeners
          storageListeners.forEach(listener => {
            try {
              listener(changes, 'local');
            } catch (e) {
              console.error('Storage listener error:', e);
            }
          });

          if (callback) {
            setTimeout(() => callback(), 0);
          }
          return Promise.resolve();
        },

        remove: (keys, callback) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          const changes = {};
          keysArray.forEach(key => {
            if (key in localStorageData) {
              changes[key] = { oldValue: localStorageData[key] };
              delete localStorageData[key];
            }
          });

          // Persist to sessionStorage
          persistLocal();

          // Notify listeners
          storageListeners.forEach(listener => {
            try {
              listener(changes, 'local');
            } catch (e) {
              console.error('Storage listener error:', e);
            }
          });

          if (callback) {
            setTimeout(() => callback(), 0);
          }
          return Promise.resolve();
        },

        clear: (callback) => {
          const changes = {};
          Object.keys(localStorageData).forEach(key => {
            changes[key] = { oldValue: localStorageData[key] };
            delete localStorageData[key];
          });

          // Persist to sessionStorage
          persistLocal();

          // Notify listeners
          storageListeners.forEach(listener => {
            try {
              listener(changes, 'local');
            } catch (e) {
              console.error('Storage listener error:', e);
            }
          });

          if (callback) {
            setTimeout(() => callback(), 0);
          }
          return Promise.resolve();
        }
      },

      sync: {
        get: (keys, callback) => {
          const result = {};
          if (keys === null || keys === undefined) {
            Object.assign(result, syncStorageData);
          } else if (typeof keys === 'string') {
            if (keys in syncStorageData) {
              result[keys] = syncStorageData[keys];
            }
          } else if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (key in syncStorageData) {
                result[key] = syncStorageData[key];
              }
            });
          } else if (typeof keys === 'object') {
            Object.keys(keys).forEach(key => {
              result[key] = key in syncStorageData ? syncStorageData[key] : keys[key];
            });
          }

          if (callback) {
            setTimeout(() => callback(result), 0);
          }
          return Promise.resolve(result);
        },

        set: (items, callback) => {
          const changes = {};
          Object.entries(items).forEach(([key, newValue]) => {
            const oldValue = syncStorageData[key];
            syncStorageData[key] = newValue;
            changes[key] = { oldValue, newValue };
          });

          persistSync();

          storageListeners.forEach(listener => {
            try {
              listener(changes, 'sync');
            } catch (e) {
              console.error('Storage listener error:', e);
            }
          });

          if (callback) {
            setTimeout(() => callback(), 0);
          }
          return Promise.resolve();
        },

        remove: (keys, callback) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          const changes = {};
          keysArray.forEach(key => {
            if (key in syncStorageData) {
              changes[key] = { oldValue: syncStorageData[key] };
              delete syncStorageData[key];
            }
          });

          persistSync();

          storageListeners.forEach(listener => {
            try {
              listener(changes, 'sync');
            } catch (e) {
              console.error('Storage listener error:', e);
            }
          });

          if (callback) {
            setTimeout(() => callback(), 0);
          }
          return Promise.resolve();
        },

        clear: (callback) => {
          const changes = {};
          Object.keys(syncStorageData).forEach(key => {
            changes[key] = { oldValue: syncStorageData[key] };
            delete syncStorageData[key];
          });

          persistSync();

          storageListeners.forEach(listener => {
            try {
              listener(changes, 'sync');
            } catch (e) {
              console.error('Storage listener error:', e);
            }
          });

          if (callback) {
            setTimeout(() => callback(), 0);
          }
          return Promise.resolve();
        }
      },

      onChanged: {
        addListener: (callback) => {
          storageListeners.push(callback);
        },
        removeListener: (callback) => {
          const index = storageListeners.indexOf(callback);
          if (index > -1) {
            storageListeners.splice(index, 1);
          }
        },
        hasListener: (callback) => {
          return storageListeners.includes(callback);
        }
      }
    },

    runtime: {
      id: 'mock-extension-id',

      getURL: (path) => {
        // In test environment, serve from localhost
        return `http://localhost:8080/extension/${path}`;
      },

      sendMessage: (message, callback) => {
        // Simulate async response
        if (callback) {
          setTimeout(() => callback(undefined), 0);
        }
        return Promise.resolve();
      },

      onMessage: {
        addListener: (callback) => {
          messageListeners.push(callback);
        },
        removeListener: (callback) => {
          const index = messageListeners.indexOf(callback);
          if (index > -1) {
            messageListeners.splice(index, 1);
          }
        },
        hasListener: (callback) => {
          return messageListeners.includes(callback);
        }
      },

      lastError: null
    },

    tabs: {
      query: (queryInfo, callback) => {
        // Filter tabs based on URL pattern
        // If querying for meet.google.com, return empty (no real Meet tabs in test env)
        let tabs = [];
        if (queryInfo && queryInfo.url) {
          const urlPattern = queryInfo.url;
          // Don't return tabs for meet.google.com queries - no real Meet tabs exist
          if (urlPattern.includes('meet.google.com')) {
            tabs = [];
          } else {
            // For other queries, return mock tab
            tabs = [{ id: 1, url: 'http://localhost:8080/mock-meet.html', active: true }];
          }
        } else {
          // No URL filter - return mock active tab
          tabs = [{ id: 1, url: 'http://localhost:8080/mock-meet.html', active: true }];
        }
        if (callback) {
          setTimeout(() => callback(tabs), 0);
        }
        return Promise.resolve(tabs);
      },

      sendMessage: (tabId, message, callback) => {
        // Post message to the page (for testing)
        window.postMessage(message, '*');
        if (callback) {
          setTimeout(() => callback(undefined), 0);
        }
        return Promise.resolve();
      }
    }
  };

  // Helper to reset mock state (useful between tests)
  window.__resetChromeMock = () => {
    Object.keys(localStorageData).forEach(key => delete localStorageData[key]);
    Object.keys(syncStorageData).forEach(key => delete syncStorageData[key]);
    storageListeners.length = 0;
    messageListeners.length = 0;
    // Also clear sessionStorage persistence
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SYNC_STORAGE_KEY);
    } catch (e) {
      console.warn('[Chrome Mock] Failed to clear sessionStorage:', e);
    }
  };

  // Helper to get current storage state (for debugging)
  window.__getChromeMockState = () => ({
    local: { ...localStorageData },
    sync: { ...syncStorageData },
    listenerCount: storageListeners.length
  });

  console.log('[Chrome Mock] Initialized');
})();
