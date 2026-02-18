import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks for browser APIs ---

let endedListeners;
let mockTrack;
let mockStream;
let mockVideo;

function resetMocks() {
  endedListeners = [];
  mockTrack = {
    label: 'Tab: meet.google.com - My Meeting',
    addEventListener: vi.fn((event, cb) => {
      if (event === 'ended') endedListeners.push(cb);
    }),
    stop: vi.fn(),
  };
  mockStream = {
    getVideoTracks: vi.fn(() => [mockTrack]),
    getTracks: vi.fn(() => [mockTrack]),
  };
  mockVideo = {
    srcObject: null,
    autoplay: false,
    muted: false,
    playsInline: false,
    play: vi.fn(() => Promise.resolve()),
  };
}

resetMocks();

// Install mocks on globalThis before dynamic import
const mockGetDisplayMedia = vi.fn(() => Promise.resolve(mockStream));

if (!globalThis.navigator) {
  globalThis.navigator = { mediaDevices: { getDisplayMedia: mockGetDisplayMedia } };
} else if (!globalThis.navigator.mediaDevices) {
  globalThis.navigator.mediaDevices = { getDisplayMedia: mockGetDisplayMedia };
} else {
  globalThis.navigator.mediaDevices.getDisplayMedia = mockGetDisplayMedia;
}

globalThis.document = globalThis.document || {};
globalThis.document.createElement = vi.fn((tag) => {
  if (tag === 'video') return mockVideo;
  return {};
});

globalThis.window = globalThis.window || {};

const { TabCapture } = await import('../../lib/tab-capture.js');

describe('TabCapture', () => {
  beforeEach(() => {
    resetMocks();
    globalThis.navigator.mediaDevices.getDisplayMedia = vi.fn(
      () => Promise.resolve(mockStream)
    );
    globalThis.document.createElement = vi.fn((tag) => {
      if (tag === 'video') return mockVideo;
      return {};
    });
  });

  describe('constructor', () => {
    it('is exported and constructable', () => {
      expect(TabCapture).toBeDefined();
      expect(typeof TabCapture).toBe('function');
      const tc = new TabCapture();
      expect(tc).toBeInstanceOf(TabCapture);
    });

    it('initializes with default state', () => {
      const tc = new TabCapture();
      expect(tc.stream).toBe(null);
      expect(tc.video).toBe(null);
      expect(tc.active).toBe(false);
      expect(tc.tabName).toBe('');
      expect(tc._onEndedCallback).toBe(null);
    });
  });

  describe('start()', () => {
    it('calls getDisplayMedia with correct constraints', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(globalThis.navigator.mediaDevices.getDisplayMedia)
        .toHaveBeenCalledWith({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 30, max: 30 },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
    });

    it('returns a video element with correct properties', async () => {
      const tc = new TabCapture();
      const video = await tc.start();
      expect(video).toBe(mockVideo);
      expect(video.srcObject).toBe(mockStream);
      expect(video.autoplay).toBe(true);
      expect(video.muted).toBe(true);
      expect(video.playsInline).toBe(true);
      expect(video.play).toHaveBeenCalled();
    });

    it('sets active to true after starting', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(tc.active).toBe(true);
    });

    it('stores the stream and video', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(tc.stream).toBe(mockStream);
      expect(tc.video).toBe(mockVideo);
    });

    it('parses tab name from track label', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(tc.tabName).toBe('meet.google.com - My Meeting');
    });

    it('registers ended listener on the video track', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(mockTrack.addEventListener)
        .toHaveBeenCalledWith('ended', expect.any(Function));
    });
  });

  describe('stop()', () => {
    it('sets active to false', async () => {
      const tc = new TabCapture();
      await tc.start();
      tc.stop();
      expect(tc.active).toBe(false);
    });

    it('stops all tracks on the stream', async () => {
      const tc = new TabCapture();
      await tc.start();
      tc.stop();
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('clears video srcObject and nullifies references', async () => {
      const tc = new TabCapture();
      await tc.start();
      tc.stop();
      expect(mockVideo.srcObject).toBe(null);
      expect(tc.video).toBe(null);
      expect(tc.stream).toBe(null);
    });
  });

  describe('isMeetTab()', () => {
    it('returns true for meet.google.com labels', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(tc.isMeetTab()).toBe(true);
    });

    it('returns false for non-Meet labels', () => {
      const tc = new TabCapture();
      tc.tabName = 'youtube.com - Video';
      expect(tc.isMeetTab()).toBe(false);
    });

    it('is case insensitive', () => {
      const tc = new TabCapture();
      tc.tabName = 'Meet.Google.Com - Call';
      expect(tc.isMeetTab()).toBe(true);
    });

    it('returns false when tabName is empty', () => {
      const tc = new TabCapture();
      expect(tc.isMeetTab()).toBe(false);
    });
  });

  describe('onEnded()', () => {
    it('stores the callback', () => {
      const tc = new TabCapture();
      const cb = vi.fn();
      tc.onEnded(cb);
      expect(tc._onEndedCallback).toBe(cb);
    });

    it('callback is called when the track ends', async () => {
      const tc = new TabCapture();
      const cb = vi.fn();
      tc.onEnded(cb);
      await tc.start();
      // Simulate track ended
      endedListeners[0]();
      expect(cb).toHaveBeenCalled();
    });

    it('sets active to false when track ends', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(tc.active).toBe(true);
      // Simulate track ended
      endedListeners[0]();
      expect(tc.active).toBe(false);
    });

    it('does not throw if no callback is set when track ends', async () => {
      const tc = new TabCapture();
      await tc.start();
      expect(() => endedListeners[0]()).not.toThrow();
    });
  });

  describe('_parseTabName()', () => {
    it('strips "Tab: " prefix', () => {
      const tc = new TabCapture();
      expect(tc._parseTabName('Tab: example.com')).toBe('example.com');
    });

    it('returns full label if no prefix', () => {
      const tc = new TabCapture();
      expect(tc._parseTabName('example.com')).toBe('example.com');
    });

    it('returns "Unknown Tab" for empty label', () => {
      const tc = new TabCapture();
      expect(tc._parseTabName('')).toBe('Unknown Tab');
    });

    it('returns "Unknown Tab" for undefined label', () => {
      const tc = new TabCapture();
      expect(tc._parseTabName(undefined)).toBe('Unknown Tab');
    });

    it('returns "Unknown Tab" for null label', () => {
      const tc = new TabCapture();
      expect(tc._parseTabName(null)).toBe('Unknown Tab');
    });
  });

  describe('exports', () => {
    it('exports TabCapture class', () => {
      expect(TabCapture).toBeDefined();
      expect(typeof TabCapture).toBe('function');
    });

    it('assigns to window.TabCapture', () => {
      expect(globalThis.window.TabCapture).toBe(TabCapture);
    });
  });
});
