/**
 * Chrome API mocks for dev environment.
 * Provides in-memory storage and no-op messaging.
 */

class MockStorage {
  constructor() {
    this.data = {};
    this.listeners = [];
  }

  get(keys) {
    return new Promise(resolve => {
      if (typeof keys === 'string') {
        resolve(keys in this.data ? { [keys]: this.data[keys] } : {});
      } else if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(k => {
          if (k in this.data) result[k] = this.data[k];
        });
        resolve(result);
      } else if (keys === null || keys === undefined) {
        resolve({ ...this.data });
      } else {
        // Object with defaults
        const result = {};
        Object.keys(keys).forEach(k => {
          result[k] = k in this.data ? this.data[k] : keys[k];
        });
        resolve(result);
      }
    });
  }

  set(items) {
    return new Promise(resolve => {
      const changes = {};
      Object.entries(items).forEach(([key, newValue]) => {
        const oldValue = this.data[key];
        this.data[key] = newValue;
        changes[key] = { oldValue, newValue };
      });
      this.listeners.forEach(cb => {
        try {
          cb(changes, 'local');
        } catch (e) {
          console.error('[Chrome Mock] Storage listener error:', e);
        }
      });
      resolve();
    });
  }

  remove(keys) {
    return new Promise(resolve => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(k => delete this.data[k]);
      resolve();
    });
  }

  clear() {
    return new Promise(resolve => {
      this.data = {};
      resolve();
    });
  }

  onChanged = {
    addListener: (cb) => {
      this.listeners.push(cb);
    },
    removeListener: (cb) => {
      const idx = this.listeners.indexOf(cb);
      if (idx !== -1) this.listeners.splice(idx, 1);
    }
  };
}

// Create storage instances
const localStorage = new MockStorage();
const syncStorage = new MockStorage();

// Message handlers for mock content script communication
const messageListeners = [];

// Install Chrome mock
window.chrome = {
  storage: {
    local: localStorage,
    sync: syncStorage,
    onChanged: {
      addListener: (cb) => {
        localStorage.onChanged.addListener(cb);
      },
      removeListener: (cb) => {
        localStorage.onChanged.removeListener(cb);
      }
    }
  },
  runtime: {
    getURL: (path) => {
      // Return relative path from dev environment
      return `/${path}`;
    },
    sendMessage: async (message) => {
      console.log('[Chrome Mock] runtime.sendMessage:', message);
      // Dispatch to mock content script handlers
      window.dispatchEvent(new CustomEvent('mock-chrome-message', { detail: message }));
      return { success: true };
    },
    onMessage: {
      addListener: (cb) => {
        messageListeners.push(cb);
      },
      removeListener: (cb) => {
        const idx = messageListeners.indexOf(cb);
        if (idx !== -1) messageListeners.splice(idx, 1);
      }
    },
    lastError: null,
    id: 'mock-extension-id'
  },
  tabs: {
    query: async () => {
      // Return empty array - no real tabs in dev environment
      return [];
    },
    sendMessage: async (tabId, message) => {
      console.log('[Chrome Mock] tabs.sendMessage:', tabId, message);
      // Forward to our mock content script via custom event
      window.dispatchEvent(new CustomEvent('mock-content-message', { detail: message }));
      return { success: true };
    }
  }
};

// Helper to simulate message from popup to content script
export function simulatePopupMessage(message) {
  window.dispatchEvent(new CustomEvent('mock-content-message', { detail: message }));
}

// Helper to get mock storage for debugging
export function getMockStorage() {
  return localStorage.data;
}

// Helper to reset mock state
export function resetMockState() {
  localStorage.data = {};
  syncStorage.data = {};
}

console.log('[Chrome Mock] Chrome API mocks installed');
