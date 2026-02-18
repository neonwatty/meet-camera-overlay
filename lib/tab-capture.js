/**
 * TabCapture — wraps navigator.mediaDevices.getDisplayMedia()
 * to capture a browser tab as a live video stream.
 * Classic script for page-context injection + ES module export for testing.
 */

class TabCapture {
  constructor() {
    this.stream = null;
    this.video = null;
    this.active = false;
    this.tabName = '';
    this._onEndedCallback = null;
  }

  /**
   * Start capturing a browser tab via getDisplayMedia.
   * @returns {Promise<HTMLVideoElement>} the video element playing the captured stream
   */
  async start() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    this.stream = stream;
    this.active = true;

    const track = stream.getVideoTracks()[0];
    this.tabName = this._parseTabName(track.label);

    track.addEventListener('ended', () => {
      this.active = false;
      if (this._onEndedCallback) {
        this._onEndedCallback();
      }
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    this.video = video;
    return video;
  }

  /** Stop capturing and release all resources. */
  stop() {
    this.active = false;
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.video = null;
    this.stream = null;
  }

  /**
   * Register a callback for when the capture track ends (user stops sharing).
   * @param {Function} callback
   */
  onEnded(callback) {
    this._onEndedCallback = callback;
  }

  /**
   * Check if the captured tab is a Google Meet tab.
   * @returns {boolean}
   */
  isMeetTab() {
    return this.tabName.toLowerCase().includes('meet.google.com');
  }

  /**
   * Parse the tab name from a MediaStreamTrack label.
   * Chrome labels tab captures as "Tab: <title>".
   * @param {string|null|undefined} label
   * @returns {string}
   */
  _parseTabName(label) {
    if (!label) return 'Unknown Tab';
    if (label.startsWith('Tab: ')) return label.slice(5);
    return label;
  }
}

// Dual export: window global for page context, ES module export for testing
if (typeof window !== 'undefined') {
  window.TabCapture = TabCapture;
}

export { TabCapture };
