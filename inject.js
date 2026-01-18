(function() {
  'use strict';

  // Avoid double injection
  if (window.__meetOverlayInjected) return;
  window.__meetOverlayInjected = true;

  console.log('[Meet Overlay] Initializing...');

  // Store original getUserMedia
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  // Constants for layer ordering
  const LAYER_BACKGROUND = 'background';
  const LAYER_FOREGROUND = 'foreground';

  // Overlay type constants
  const _TYPE_STANDARD = 'standard';  
  const TYPE_EFFECT = 'effect';
  const TYPE_TEXT_BANNER = 'textBanner';
  const TYPE_TIMER = 'timer';

  // Text position constants
  const TEXT_POSITION_LOWER_THIRD = 'lower-third';
  const TEXT_POSITION_TOP = 'top';
  const TEXT_POSITION_CENTER = 'center';

  // Overlay state
  let overlays = [];
  const overlayImages = new Map(); // id -> HTMLImageElement or AnimatedImage
  let isProcessing = false;
  let activeProcessor = null;

  // Wall art state
  let wallArtOverlays = [];
  const wallArtImages = new Map(); // id -> HTMLImageElement, HTMLCanvasElement, or AnimatedImage
  let wallArtSegmenter = null;
  const wallArtSettings = {
    segmentationEnabled: false,
    segmentationPreset: 'balanced',
    featherRadius: 2
  };

  // Check if AnimatedImage class is available (from gif-decoder.js)
  const hasGifSupport = typeof window.AnimatedImage !== 'undefined';

  // Sort overlays by layer and zIndex for correct rendering order
  function sortOverlaysByLayer(overlays) {
    return [...overlays].sort((a, b) => {
      // Background = 0, Foreground = 1
      const aLayerOrder = a.layer === LAYER_BACKGROUND ? 0 : 1;
      const bLayerOrder = b.layer === LAYER_BACKGROUND ? 0 : 1;

      // First sort by layer
      if (aLayerOrder !== bLayerOrder) {
        return aLayerOrder - bLayerOrder;
      }

      // Within same layer, sort by zIndex
      const aZIndex = a.zIndex || 0;
      const bZIndex = b.zIndex || 0;
      return aZIndex - bZIndex;
    });
  }

  // Migrate an overlay to include new fields if missing
  function migrateOverlay(overlay) {
    if (!overlay) return overlay;
    const migrated = { ...overlay };
    if (!migrated.layer) {
      migrated.layer = migrated.type === TYPE_EFFECT ? LAYER_BACKGROUND : LAYER_FOREGROUND;
    }
    if (migrated.zIndex === undefined) {
      if (migrated.type === TYPE_TIMER) {
        migrated.zIndex = 11;
      } else if (migrated.type === TYPE_TEXT_BANNER) {
        migrated.zIndex = 10;
      } else {
        migrated.zIndex = 0;
      }
    }
    // Timer-specific migration
    if (migrated.type === TYPE_TIMER && !migrated.timerState) {
      migrated.timerState = { running: false, startTime: null, pausedAt: null, elapsed: 0 };
    }
    return migrated;
  }

  // Draw a rounded rectangle path
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Format seconds into time string
  function formatTime(totalSeconds, format = 'mm:ss') {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (format === 'hh:mm:ss') {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else if (format === 'minimal') {
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // Render a text banner overlay
  function renderTextBanner(ctx, banner, canvasWidth, canvasHeight) {
    if (!banner || !banner.text) return;

    const style = banner.style || {};
    const {
      fontFamily = 'Arial, sans-serif',
      fontSize = 24,
      textColor = '#ffffff',
      backgroundColor = '#000000',
      backgroundOpacity = 0.7,
      padding = 12,
      borderRadius = 8
    } = style;

    const displayText = Array.isArray(banner.text) ? banner.text[0] : banner.text;
    if (!displayText) return;

    const scaleFactor = canvasHeight / 720;
    const scaledFontSize = Math.round(fontSize * scaleFactor);
    const scaledPadding = Math.round(padding * scaleFactor);
    const scaledBorderRadius = Math.round(borderRadius * scaleFactor);

    ctx.save();
    ctx.font = `${scaledFontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';

    const lines = displayText.split('\n');
    const lineHeight = scaledFontSize * 1.3;

    let maxLineWidth = 0;
    lines.forEach(line => {
      const metrics = ctx.measureText(line);
      maxLineWidth = Math.max(maxLineWidth, metrics.width);
    });

    const textHeight = lines.length * lineHeight;
    const boxWidth = maxLineWidth + scaledPadding * 2;
    const boxHeight = textHeight + scaledPadding * 2;

    let x, y;
    const position = banner.textPosition || TEXT_POSITION_LOWER_THIRD;

    if (position === TEXT_POSITION_LOWER_THIRD) {
      x = (canvasWidth - boxWidth) / 2;
      y = canvasHeight * 0.7 - boxHeight / 2;
    } else if (position === TEXT_POSITION_TOP) {
      x = (canvasWidth - boxWidth) / 2;
      y = canvasHeight * 0.1;
    } else if (position === TEXT_POSITION_CENTER) {
      x = (canvasWidth - boxWidth) / 2;
      y = (canvasHeight - boxHeight) / 2;
    } else {
      x = (banner.x / 100) * canvasWidth - boxWidth / 2;
      y = (banner.y / 100) * canvasHeight - boxHeight / 2;
    }

    // Mirror x position for Meet self-view
    x = canvasWidth - x - boxWidth;

    const opacity = banner.opacity !== undefined ? banner.opacity : 1;
    ctx.globalAlpha = opacity;

    ctx.fillStyle = backgroundColor;
    ctx.globalAlpha = opacity * backgroundOpacity;
    drawRoundedRect(ctx, x, y, boxWidth, boxHeight, scaledBorderRadius);
    ctx.fill();

    ctx.globalAlpha = opacity;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';

    const textX = x + boxWidth / 2;
    const textStartY = y + scaledPadding + lineHeight / 2;

    lines.forEach((line, index) => {
      ctx.fillText(line, textX, textStartY + index * lineHeight);
    });

    ctx.restore();
  }

  // Render a timer overlay
  function renderTimer(ctx, timer, canvasWidth, canvasHeight, timestamp) {
    if (!timer) return;

    const style = timer.style || {};
    const {
      fontSize = 32,
      textColor = '#ffffff',
      backgroundColor = '#000000',
      backgroundOpacity = 0.7
    } = style;

    const timerState = timer.timerState || { running: false, elapsed: 0 };
    const mode = timer.timerMode || 'countdown';
    const duration = timer.duration || 300;
    const format = timer.format || 'mm:ss';

    // Update elapsed time if running
    let currentElapsed = timerState.elapsed;
    if (timerState.running && timerState.startTime) {
      currentElapsed = (timestamp - timerState.startTime) / 1000;
    }

    let displaySeconds;
    if (mode === 'clock') {
      const now = new Date();
      displaySeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    } else if (mode === 'countup') {
      displaySeconds = currentElapsed;
    } else {
      displaySeconds = Math.max(0, duration - currentElapsed);
    }

    const timeString = formatTime(displaySeconds, format);

    const scaleFactor = canvasHeight / 720;
    const scaledFontSize = Math.round(fontSize * scaleFactor);
    const scaledPadding = Math.round(10 * scaleFactor);
    const scaledBorderRadius = Math.round(6 * scaleFactor);

    ctx.save();
    ctx.font = `bold ${scaledFontSize}px 'Courier New', monospace`;
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(timeString);
    const boxWidth = metrics.width + scaledPadding * 2;
    const boxHeight = scaledFontSize + scaledPadding * 2;

    let x = (timer.x / 100) * canvasWidth;
    const y = (timer.y / 100) * canvasHeight;

    if (timer.x > 50) {
      x = x - boxWidth;
    }

    // Mirror x position for Meet self-view
    x = canvasWidth - x - boxWidth;

    const opacity = timer.opacity !== undefined ? timer.opacity : 1;
    ctx.globalAlpha = opacity;

    const isAlert = mode === 'countdown' && displaySeconds <= 10 && displaySeconds > 0;

    ctx.fillStyle = isAlert ? '#cc0000' : backgroundColor;
    ctx.globalAlpha = opacity * backgroundOpacity;
    drawRoundedRect(ctx, x, y, boxWidth, boxHeight, scaledBorderRadius);
    ctx.fill();

    ctx.globalAlpha = opacity;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText(timeString, x + boxWidth / 2, y + boxHeight / 2);

    ctx.restore();
  }

  // Load saved overlays from storage
  function loadOverlays() {
    try {
      const saved = localStorage.getItem('meetOverlays');
      if (saved) {
        const rawOverlays = JSON.parse(saved);
        overlays = rawOverlays.map(migrateOverlay);
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
        let animatedImage;

        // Check if it's a data URL or a file URL
        if (overlay.src.startsWith('data:')) {
          animatedImage = await window.decodeGifFromDataUrl(overlay.src);
        } else {
          // For file URLs (like chrome-extension://), fetch and decode
          animatedImage = await window.decodeGifFromUrl(overlay.src);
        }

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

  // Load an image for a wall art overlay
  async function loadWallArtImage(wallArt) {
    if (!wallArt.art || !wallArt.art.src) return;

    const src = wallArt.art.src;
    const contentType = wallArt.art.contentType || 'image';

    // Check if it's an animated GIF
    if (hasGifSupport && (contentType === 'gif' || window.isAnimatedGif(src))) {
      try {
        console.log('[Meet Overlay] Loading wall art GIF:', wallArt.id);
        let animatedImage;

        if (src.startsWith('data:')) {
          animatedImage = await window.decodeGifFromDataUrl(src);
        } else {
          animatedImage = await window.decodeGifFromUrl(src);
        }

        wallArtImages.set(wallArt.id, animatedImage);
        console.log('[Meet Overlay] Loaded wall art GIF with', animatedImage.frames.length, 'frames');
      } catch (e) {
        console.error('[Meet Overlay] Failed to decode wall art GIF:', e);
        loadWallArtStaticImage(wallArt);
      }
      return;
    }

    // Check if it's a video
    if (contentType === 'video' && window.WallArtRenderer && window.WallArtRenderer.createVideoLoop) {
      try {
        console.log('[Meet Overlay] Loading wall art video:', wallArt.id);
        const video = await window.WallArtRenderer.createVideoLoop(src);
        wallArtImages.set(wallArt.id, video);
        console.log('[Meet Overlay] Loaded wall art video');
      } catch (e) {
        console.error('[Meet Overlay] Failed to load wall art video:', e);
      }
      return;
    }

    // Load as static image
    loadWallArtStaticImage(wallArt);
  }

  // Load a static image for wall art
  function loadWallArtStaticImage(wallArt) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      wallArtImages.set(wallArt.id, img);
      console.log('[Meet Overlay] Loaded wall art image:', wallArt.id);
    };
    img.onerror = () => {
      console.error('[Meet Overlay] Failed to load wall art image:', wallArt.art.src);
      wallArtImages.delete(wallArt.id);
    };
    img.src = wallArt.art.src;
  }

  // Get or create segmenter lazily
  async function getSegmenter() {
    if (!window.WallSegmentation) {
      console.warn('[Meet Overlay] Wall segmentation library not loaded');
      return null;
    }

    if (wallArtSegmenter && wallArtSegmenter.isReady) {
      return wallArtSegmenter;
    }

    if (!wallArtSegmenter) {
      console.log('[Meet Overlay] Creating wall art segmenter...');
      wallArtSegmenter = new window.WallSegmentation.WallArtSegmenter({
        preset: wallArtSettings.segmentationPreset,
        onInitialized: () => {
          console.log('[Meet Overlay] Wall art segmenter initialized');
        },
        onError: (error) => {
          console.error('[Meet Overlay] Wall art segmenter error:', error);
        }
      });
    }

    // Start initialization if not already in progress
    if (!wallArtSegmenter.isInitializing && !wallArtSegmenter.isReady) {
      await wallArtSegmenter.initialize();
    }

    return wallArtSegmenter.isReady ? wallArtSegmenter : null;
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

    async render(timestamp) {
      if (!this.running) return;

      if (this.video.readyState >= 2) {
        // Draw original video frame
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        // Render wall art (before regular overlays, as wall art is background layer)
        await this.renderWallArt(timestamp);

        // Sort overlays by layer and zIndex, then draw
        const sortedOverlays = sortOverlaysByLayer(overlays);
        sortedOverlays.forEach(overlay => {
          // Check if overlay should be rendered
          // Effects, text banners, and timers only render when active
          if ((overlay.type === TYPE_EFFECT || overlay.type === TYPE_TEXT_BANNER || overlay.type === TYPE_TIMER) && !overlay.active) {
            return;
          }

          // Handle text banners
          if (overlay.type === TYPE_TEXT_BANNER) {
            renderTextBanner(this.ctx, overlay, this.canvas.width, this.canvas.height);
            return;
          }

          // Handle timers
          if (overlay.type === TYPE_TIMER) {
            renderTimer(this.ctx, overlay, this.canvas.width, this.canvas.height, timestamp);
            return;
          }

          // Handle image-based overlays (standard and effect)
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

    // Render wall art overlays
    async renderWallArt(timestamp) {
      // Check if we have any active wall art
      const activeWallArt = wallArtOverlays.filter(wa => wa.active);
      if (activeWallArt.length === 0) return;

      // Check if wall art renderer is available
      if (!window.WallPaintRenderer || !window.WallArtRenderer) {
        return;
      }

      // Get person mask if segmentation is enabled
      let personMask = null;
      if (wallArtSettings.segmentationEnabled) {
        try {
          const segmenter = await getSegmenter();
          if (segmenter) {
            const result = await segmenter.segment(this.video);
            personMask = result.mask;
          }
        } catch (e) {
          // Segmentation failed, continue without mask
          console.warn('[Meet Overlay] Segmentation failed:', e);
        }
      }

      const renderOptions = {
        personMask,
        featherRadius: wallArtSettings.featherRadius,
        timestamp
      };

      // Render paint layers first
      window.WallPaintRenderer.renderAllWallPaint(this.ctx, wallArtOverlays, renderOptions);

      // Render art layers
      window.WallArtRenderer.renderAllWallArt(this.ctx, wallArtOverlays, wallArtImages, renderOptions);
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
      // Migrate overlays to ensure they have layer/zIndex fields
      overlays = event.data.overlays.map(migrateOverlay);

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
      if (overlay && overlay.type === TYPE_EFFECT) {
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

    // Toggle text banner visibility
    if (event.data.type === 'MEET_OVERLAY_TOGGLE_TEXT_BANNER') {
      const { id, active } = event.data;
      console.log('[Meet Overlay] Toggling text banner:', id, 'active:', active);

      const overlay = overlays.find(o => o.id === id);
      if (overlay && overlay.type === TYPE_TEXT_BANNER) {
        overlay.active = active;
      }
    }

    // Update text banner text
    if (event.data.type === 'MEET_OVERLAY_UPDATE_TEXT') {
      const { id, text } = event.data;
      console.log('[Meet Overlay] Updating text banner text:', id);

      const overlay = overlays.find(o => o.id === id);
      if (overlay && overlay.type === TYPE_TEXT_BANNER) {
        overlay.text = text;
      }
    }

    // Toggle timer visibility
    if (event.data.type === 'MEET_OVERLAY_TOGGLE_TIMER') {
      const { id, active } = event.data;
      console.log('[Meet Overlay] Toggling timer:', id, 'active:', active);

      const overlay = overlays.find(o => o.id === id);
      if (overlay && overlay.type === TYPE_TIMER) {
        overlay.active = active;
      }
    }

    // Timer control (start, pause, reset)
    if (event.data.type === 'MEET_OVERLAY_TIMER_CONTROL') {
      const { id, action } = event.data;
      console.log('[Meet Overlay] Timer control:', id, 'action:', action);

      const overlay = overlays.find(o => o.id === id);
      if (overlay && overlay.type === TYPE_TIMER) {
        if (!overlay.timerState) {
          overlay.timerState = { running: false, startTime: null, pausedAt: null, elapsed: 0 };
        }

        const now = performance.now();

        if (action === 'start') {
          if (!overlay.timerState.running) {
            // Resume from paused state or start fresh
            if (overlay.timerState.pausedAt) {
              // Calculate how much time had elapsed before pause
              overlay.timerState.startTime = now - (overlay.timerState.elapsed * 1000);
            } else {
              overlay.timerState.startTime = now;
            }
            overlay.timerState.running = true;
            overlay.timerState.pausedAt = null;
            console.log('[Meet Overlay] Timer started');
          }
        } else if (action === 'pause') {
          if (overlay.timerState.running) {
            overlay.timerState.elapsed = (now - overlay.timerState.startTime) / 1000;
            overlay.timerState.running = false;
            overlay.timerState.pausedAt = now;
            console.log('[Meet Overlay] Timer paused at', overlay.timerState.elapsed, 'seconds');
          }
        } else if (action === 'reset') {
          overlay.timerState = { running: false, startTime: null, pausedAt: null, elapsed: 0 };
          console.log('[Meet Overlay] Timer reset');
        }
      }
    }

    // Wall art update
    if (event.data.type === 'MEET_OVERLAY_UPDATE_WALL_ART') {
      console.log('[Meet Overlay] Received wall art update:', event.data.wallArtOverlays?.length || 0, 'overlays');
      wallArtOverlays = event.data.wallArtOverlays || [];

      // Load any new art images
      wallArtOverlays.forEach(wallArt => {
        if (wallArt.art && wallArt.art.src && !wallArtImages.has(wallArt.id)) {
          loadWallArtImage(wallArt);
        }
      });

      // Remove images for deleted wall art overlays
      for (const id of wallArtImages.keys()) {
        if (!wallArtOverlays.find(wa => wa.id === id)) {
          wallArtImages.delete(id);
        }
      }
    }

    // Toggle wall art visibility
    if (event.data.type === 'MEET_OVERLAY_TOGGLE_WALL_ART') {
      const { id, active } = event.data;
      console.log('[Meet Overlay] Toggling wall art:', id, 'active:', active);

      const wallArt = wallArtOverlays.find(wa => wa.id === id);
      if (wallArt) {
        wallArt.active = active;

        // Reset animation when activating if it's a GIF
        if (active) {
          const img = wallArtImages.get(id);
          if (img && img instanceof window.AnimatedImage) {
            img.reset();
          }
        }
      }
    }

    // Update wall art segmentation settings
    if (event.data.type === 'MEET_OVERLAY_UPDATE_WALL_ART_SETTINGS') {
      const settings = event.data.settings;
      console.log('[Meet Overlay] Updating wall art settings:', settings);

      if (settings) {
        if (settings.segmentationEnabled !== undefined) {
          wallArtSettings.segmentationEnabled = settings.segmentationEnabled;
        }
        if (settings.segmentationPreset !== undefined) {
          wallArtSettings.segmentationPreset = settings.segmentationPreset;
          // Update segmenter preset if it exists
          if (wallArtSegmenter) {
            wallArtSegmenter.setPreset(settings.segmentationPreset);
          }
        }
        if (settings.featherRadius !== undefined) {
          wallArtSettings.featherRadius = settings.featherRadius;
        }
      }
    }

    // ==================== SETUP WIZARD MESSAGE HANDLERS ====================

    // Capture a single video frame for the wizard
    if (event.data.type === 'MEET_OVERLAY_WIZARD_CAPTURE_FRAME') {
      console.log('[Meet Overlay] Wizard: Capturing frame...');

      try {
        // Get the current video frame from the active processor
        if (activeProcessor && activeProcessor.video && activeProcessor.video.readyState >= 2) {
          const video = activeProcessor.video;
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = video.videoWidth || 640;
          tempCanvas.height = video.videoHeight || 480;
          const tempCtx = tempCanvas.getContext('2d');

          // Draw current video frame
          tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

          // Convert to data URL (JPEG for smaller size)
          const frameDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);

          window.postMessage({
            type: 'MEET_OVERLAY_WIZARD_FRAME_CAPTURED',
            success: true,
            frameDataUrl,
            width: tempCanvas.width,
            height: tempCanvas.height
          }, '*');

          console.log('[Meet Overlay] Wizard: Frame captured successfully');
        } else {
          throw new Error('Video not ready or no active processor');
        }
      } catch (error) {
        console.error('[Meet Overlay] Wizard: Frame capture failed:', error);
        window.postMessage({
          type: 'MEET_OVERLAY_WIZARD_FRAME_CAPTURED',
          success: false,
          error: error.message
        }, '*');
      }
    }

    // Run performance benchmark for the wizard
    if (event.data.type === 'MEET_OVERLAY_WIZARD_RUN_BENCHMARK') {
      console.log('[Meet Overlay] Wizard: Running benchmark...');

      (async () => {
        try {
          // Ensure we have an active video processor
          if (!activeProcessor || !activeProcessor.video || activeProcessor.video.readyState < 2) {
            throw new Error('Video not ready or no active processor');
          }

          const video = activeProcessor.video;
          const iterations = 10;
          const timings = [];

          // Initialize segmenter if not already done
          const segmenter = await getSegmenter();
          if (!segmenter) {
            throw new Error('Segmenter not available');
          }

          // Run benchmark iterations
          for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();
            await segmenter.segment(video);
            const endTime = performance.now();
            timings.push(endTime - startTime);
          }

          // Calculate statistics
          const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
          const minTime = Math.min(...timings);
          const maxTime = Math.max(...timings);

          // Determine recommended preset based on average time
          let recommendedPreset = 'balanced';
          if (avgTime < 20) {
            recommendedPreset = 'quality'; // Fast machine, can use quality
          } else if (avgTime > 50) {
            recommendedPreset = 'performance'; // Slow machine, use performance
          }

          const result = {
            success: true,
            iterations,
            avgTime: Math.round(avgTime * 10) / 10,
            minTime: Math.round(minTime * 10) / 10,
            maxTime: Math.round(maxTime * 10) / 10,
            recommendedPreset,
            fps: Math.round(1000 / avgTime)
          };

          console.log('[Meet Overlay] Wizard: Benchmark complete:', result);

          window.postMessage({
            type: 'MEET_OVERLAY_WIZARD_BENCHMARK_COMPLETE',
            ...result
          }, '*');

        } catch (error) {
          console.error('[Meet Overlay] Wizard: Benchmark failed:', error);
          window.postMessage({
            type: 'MEET_OVERLAY_WIZARD_BENCHMARK_COMPLETE',
            success: false,
            error: error.message,
            // Provide defaults on failure
            recommendedPreset: 'balanced'
          }, '*');
        }
      })();
    }

    // Region editor show
    if (event.data.type === 'MEET_OVERLAY_REGION_EDITOR_SHOW') {
      const { region, wallArtId } = event.data;
      console.log('[Meet Overlay] Showing region editor for wall art:', wallArtId);

      if (window.WallRegionEditor) {
        window.WallRegionEditor.show(region, {
          onUpdate: (updatedRegion) => {
            window.postMessage({
              type: 'MEET_OVERLAY_REGION_EDITOR_UPDATE',
              region: updatedRegion,
              wallArtId
            }, '*');
          },
          onSave: (savedRegion) => {
            window.postMessage({
              type: 'MEET_OVERLAY_REGION_EDITOR_SAVE',
              region: savedRegion,
              wallArtId
            }, '*');
          },
          onCancel: () => {
            window.postMessage({
              type: 'MEET_OVERLAY_REGION_EDITOR_CANCEL',
              wallArtId
            }, '*');
          }
        });
      } else {
        console.error('[Meet Overlay] WallRegionEditor not loaded');
      }
    }

    // Region editor hide
    if (event.data.type === 'MEET_OVERLAY_REGION_EDITOR_HIDE') {
      console.log('[Meet Overlay] Hiding region editor');
      if (window.WallRegionEditor) {
        window.WallRegionEditor.hide();
      }
    }
  });

  // Initial load
  loadOverlays();

  console.log('[Meet Overlay] Ready');
})();
