/* global fetch */
/**
 * AnimatedImage class and GIF utility functions.
 * Handles playback of decoded animated GIFs and provides
 * convenience functions for detecting and decoding GIFs.
 */

/**
 * AnimatedImage class - handles playback of animated GIFs
 */
class AnimatedImage {
  constructor(gifData) {
    this.width = gifData.width;
    this.height = gifData.height;
    this.frames = gifData.frames;
    this.frameIndex = 0;
    this.lastFrameTime = 0;
    this.playing = true;

    // Pre-render frames to canvases for faster drawing
    this.frameCanvases = [];
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = this.width;
    this.compositeCanvas.height = this.height;
    this.compositeCtx = this.compositeCanvas.getContext('2d');

    this.renderFrames();
  }

  renderFrames() {
    // Render each frame considering disposal methods
    this.compositeCtx.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];

      // Create a canvas for this frame
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = this.width;
      frameCanvas.height = this.height;
      const frameCtx = frameCanvas.getContext('2d');

      // Copy current composite state
      frameCtx.drawImage(this.compositeCanvas, 0, 0);

      // Draw this frame's image data
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = frame.width;
      tempCanvas.height = frame.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(frame.imageData, 0, 0);

      frameCtx.drawImage(tempCanvas, frame.left, frame.top);

      this.frameCanvases.push(frameCanvas);

      // Update composite based on disposal method
      if (frame.disposalMethod === 0 || frame.disposalMethod === 1) {
        // No disposal or do not dispose - keep frame
        this.compositeCtx.drawImage(tempCanvas, frame.left, frame.top);
      } else if (frame.disposalMethod === 2) {
        // Restore to background (clear the frame area)
        this.compositeCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
      }
      // disposalMethod 3 (restore to previous) is complex, treat as 1
    }
  }

  get currentFrame() {
    return this.frameCanvases[this.frameIndex];
  }

  get isAnimated() {
    return this.frames.length > 1;
  }

  update(timestamp) {
    if (!this.playing || this.frames.length <= 1) return;

    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
    }

    const elapsed = timestamp - this.lastFrameTime;
    const currentDelay = this.frames[this.frameIndex].delay;

    if (elapsed >= currentDelay) {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.lastFrameTime = timestamp;
    }
  }

  reset() {
    this.frameIndex = 0;
    this.lastFrameTime = 0;
  }
}

/**
 * Check if a source is a GIF (data URL or file URL)
 */
function isAnimatedGif(src) {
  if (!src) return false;
  if (src.startsWith('data:image/gif')) return true;
  if (src.endsWith('.gif')) return true;
  return false;
}

/**
 * Decode a GIF from a data URL
 */
async function decodeGifFromDataUrl(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const decoder = new window.GifDecoder(bytes.buffer);
  const gifData = decoder.decode();

  return new AnimatedImage(gifData);
}

/**
 * Decode a GIF from a URL (fetches the file first)
 */
async function decodeGifFromUrl(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  const decoder = new window.GifDecoder(arrayBuffer);
  const gifData = decoder.decode();

  return new AnimatedImage(gifData);
}

// Export for use in inject.js
if (typeof window !== 'undefined') {
  window.AnimatedImage = AnimatedImage;
  window.isAnimatedGif = isAnimatedGif;
  window.decodeGifFromDataUrl = decodeGifFromDataUrl;
  window.decodeGifFromUrl = decodeGifFromUrl;
}
