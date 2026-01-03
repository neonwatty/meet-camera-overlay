(function() {
  'use strict';

  // Avoid double injection
  if (window.__meetOverlayInjected) return;
  window.__meetOverlayInjected = true;

  console.log('[Meet Overlay] Initializing...');

  // Store original getUserMedia
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  // Overlay state
  let overlays = [];
  let overlayImages = new Map(); // id -> HTMLImageElement or AnimatedImage
  let isProcessing = false;
  let activeProcessor = null;

  // Check if AnimatedImage class is available (from gif-decoder.js)
  const hasGifSupport = typeof window.AnimatedImage !== 'undefined';

  // Load saved overlays from storage
  function loadOverlays() {
    try {
      const saved = localStorage.getItem('meetOverlays');
      if (saved) {
        overlays = JSON.parse(saved);
        overlays.forEach(loadOverlayImage);
      }
    } catch (e) {
      console.error('[Meet Overlay] Failed to load overlays:', e);
    }
  }

  // Save overlays to storage
  function saveOverlays() {
    try {
      localStorage.setItem('meetOverlays', JSON.stringify(overlays));
    } catch (e) {
      console.error('[Meet Overlay] Failed to save overlays:', e);
    }
  }

  // Load an image for an overlay
  async function loadOverlayImage(overlay) {
    if (!overlay.src) return;

    // Check if it's an animated GIF
    if (hasGifSupport && window.isAnimatedGif(overlay.src)) {
      try {
        console.log('[Meet Overlay] Loading animated GIF:', overlay.id);
        const animatedImage = await window.decodeGifFromDataUrl(overlay.src);
        overlayImages.set(overlay.id, animatedImage);
        console.log('[Meet Overlay] Loaded animated GIF with', animatedImage.frames.length, 'frames');
      } catch (e) {
        console.error('[Meet Overlay] Failed to decode GIF:', e);
        // Fallback to static image
        loadStaticImage(overlay);
      }
      return;
    }

    loadStaticImage(overlay);
  }

  // Load a static image
  function loadStaticImage(overlay) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      overlayImages.set(overlay.id, img);
      console.log('[Meet Overlay] Loaded image for overlay:', overlay.id);
    };
    img.onerror = () => {
      console.error('[Meet Overlay] Failed to load image:', overlay.src);
      overlayImages.delete(overlay.id);
    };
    img.src = overlay.src;
  }

  // Video processor class
  class VideoProcessor {
    constructor(originalStream) {
      this.originalStream = originalStream;
      this.videoTrack = originalStream.getVideoTracks()[0];
      this.running = false;
      this.video = null;
      this.canvas = null;
      this.ctx = null;
      this.outputStream = null;
    }

    async start() {
      if (!this.videoTrack) {
        return this.originalStream;
      }

      const settings = this.videoTrack.getSettings();
      const width = settings.width || 1280;
      const height = settings.height || 720;

      // Create hidden video element
      this.video = document.createElement('video');
      this.video.srcObject = new MediaStream([this.videoTrack]);
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;

      await this.video.play();

      // Create canvas
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d');

      // Start render loop
      this.running = true;
      requestAnimationFrame((ts) => this.render(ts));

      // Capture canvas as stream
      const canvasStream = this.canvas.captureStream(30);
      const processedVideoTrack = canvasStream.getVideoTracks()[0];

      // Combine with audio tracks
      const audioTracks = this.originalStream.getAudioTracks();
      this.outputStream = new MediaStream([processedVideoTrack, ...audioTracks]);

      // Cleanup when track ends
      processedVideoTrack.addEventListener('ended', () => this.stop());
      this.videoTrack.addEventListener('ended', () => this.stop());

      isProcessing = true;
      console.log('[Meet Overlay] Video processing started');

      return this.outputStream;
    }

    render(timestamp) {
      if (!this.running) return;

      if (this.video.readyState >= 2) {
        // Draw original video frame
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        // Draw overlays (mirror since Meet mirrors self-view)
        overlays.forEach(overlay => {
          // Check if overlay should be rendered (effects only when active)
          if (overlay.type === 'effect' && !overlay.active) return;

          const imgOrAnim = overlayImages.get(overlay.id);
          if (!imgOrAnim) return;

          // Check if this is an AnimatedImage or regular Image
          const isAnimated = imgOrAnim instanceof window.AnimatedImage;

          // Get the drawable image (current frame for animated, the image itself for static)
          let drawableImg;
          let imgWidth, imgHeight;

          if (isAnimated) {
            // Update animation frame
            imgOrAnim.update(timestamp);
            drawableImg = imgOrAnim.currentFrame;
            imgWidth = imgOrAnim.width;
            imgHeight = imgOrAnim.height;
          } else {
            // Static image
            if (!imgOrAnim.complete || !imgOrAnim.naturalWidth) return;
            drawableImg = imgOrAnim;
            imgWidth = imgOrAnim.naturalWidth;
            imgHeight = imgOrAnim.naturalHeight;
          }

          if (!drawableImg) return;

          // Calculate the target box size from overlay percentages
          const boxW = (overlay.width / 100) * this.canvas.width;
          const boxH = (overlay.height / 100) * this.canvas.height;

          // Preserve image aspect ratio (fit within box)
          const imgAspect = imgWidth / imgHeight;
          const boxAspect = boxW / boxH;

          let w, h;
          if (imgAspect > boxAspect) {
            // Image is wider than box - fit to width
            w = boxW;
            h = boxW / imgAspect;
          } else {
            // Image is taller than box - fit to height
            h = boxH;
            w = boxH * imgAspect;
          }

          // Mirror the x-position so it appears where user intended after Meet mirrors
          const x = this.canvas.width - ((overlay.x / 100) * this.canvas.width) - w;
          const y = (overlay.y / 100) * this.canvas.height;

          // Flip the image horizontally so it appears correct after Meet's mirror
          // Apply opacity (default to 1 if not set)
          const opacity = overlay.opacity !== undefined ? overlay.opacity : 1;
          this.ctx.save();
          this.ctx.globalAlpha = opacity;
          this.ctx.translate(x + w / 2, y + h / 2);
          this.ctx.scale(-1, 1);
          this.ctx.drawImage(drawableImg, -w / 2, -h / 2, w, h);
          this.ctx.restore();
        });
      }

      requestAnimationFrame((ts) => this.render(ts));
    }

    stop() {
      this.running = false;
      isProcessing = false;

      if (this.video) {
        this.video.srcObject = null;
        this.video = null;
      }

      console.log('[Meet Overlay] Video processing stopped');
    }
  }

  // Override getUserMedia
  navigator.mediaDevices.getUserMedia = async function(constraints) {
    const stream = await originalGetUserMedia(constraints);

    // Only process video streams
    if (constraints && constraints.video) {
      console.log('[Meet Overlay] Intercepted getUserMedia with video');

      // Stop previous processor if any
      if (activeProcessor) {
        activeProcessor.stop();
      }

      activeProcessor = new VideoProcessor(stream);
      return activeProcessor.start();
    }

    return stream;
  };

  // Listen for overlay updates from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'MEET_OVERLAY_UPDATE') {
      console.log('[Meet Overlay] Received overlay update:', event.data.overlays);
      overlays = event.data.overlays;

      // Load any new images
      overlays.forEach(overlay => {
        if (!overlayImages.has(overlay.id)) {
          loadOverlayImage(overlay);
        }
      });

      // Remove images for deleted overlays
      for (const id of overlayImages.keys()) {
        if (!overlays.find(o => o.id === id)) {
          overlayImages.delete(id);
        }
      }

      saveOverlays();
    }

    if (event.data.type === 'MEET_OVERLAY_PING') {
      window.postMessage({ type: 'MEET_OVERLAY_PONG', processing: isProcessing }, '*');
    }

    if (event.data.type === 'MEET_OVERLAY_TOGGLE_EFFECT') {
      const { id, active } = event.data;
      console.log('[Meet Overlay] Toggling effect:', id, 'active:', active);

      const overlay = overlays.find(o => o.id === id);
      if (overlay && overlay.type === 'effect') {
        overlay.active = active;

        // Reset animation when activating
        if (active) {
          const img = overlayImages.get(id);
          if (img && img instanceof window.AnimatedImage) {
            img.reset();
          }
        }
        // Note: Don't call saveOverlays() here - popup.js already saved to storage
        // and sent UPDATE_OVERLAYS to all tabs. Calling save here causes race conditions
        // between multiple Meet tabs.
      }
    }
  });

  // Initial load
  loadOverlays();

  console.log('[Meet Overlay] Ready');
})();
