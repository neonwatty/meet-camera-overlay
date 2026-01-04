/* global fetch */
/**
 * Minimal GIF Frame Decoder
 * Extracts frames from animated GIFs for canvas rendering.
 * Based on public domain GIF parsing algorithms.
 */

class GifDecoder {
  constructor(arrayBuffer) {
    this.data = new Uint8Array(arrayBuffer);
    this.pos = 0;
    this.frames = [];
    this.width = 0;
    this.height = 0;
    this.globalColorTable = null;
    this.globalColorTableSize = 0;
  }

  decode() {
    // GIF Header
    const header = this.readString(6);
    if (header !== 'GIF87a' && header !== 'GIF89a') {
      throw new Error('Invalid GIF header');
    }

    // Logical Screen Descriptor
    this.width = this.readUint16();
    this.height = this.readUint16();
    const packed = this.readByte();
    this.readByte(); // background color index
    this.readByte(); // pixel aspect ratio

    const hasGlobalColorTable = (packed & 0x80) !== 0;
    this.globalColorTableSize = 2 << (packed & 0x07);

    if (hasGlobalColorTable) {
      this.globalColorTable = this.readColorTable(this.globalColorTableSize);
    }

    // Parse blocks
    let delayTime = 100; // default 100ms
    let transparentIndex = -1;
    let disposalMethod = 0;

    while (this.pos < this.data.length) {
      const blockType = this.readByte();

      if (blockType === 0x21) {
        // Extension
        const extType = this.readByte();

        if (extType === 0xF9) {
          // Graphics Control Extension
          this.readByte(); // block size (always 4)
          const gcPacked = this.readByte();
          disposalMethod = (gcPacked & 0x1C) >> 2;
          const hasTransparency = (gcPacked & 0x01) !== 0;
          delayTime = this.readUint16() * 10; // convert to ms
          if (delayTime === 0) delayTime = 100; // default for 0
          transparentIndex = hasTransparency ? this.readByte() : -1;
          if (!hasTransparency) this.readByte();
          this.readByte(); // block terminator
        } else {
          // Skip other extensions
          this.skipSubBlocks();
        }
      } else if (blockType === 0x2C) {
        // Image Descriptor
        const frame = this.readImageDescriptor(delayTime, transparentIndex, disposalMethod);
        this.frames.push(frame);
        // Reset for next frame
        delayTime = 100;
        transparentIndex = -1;
        disposalMethod = 0;
      } else if (blockType === 0x3B) {
        // Trailer - end of GIF
        break;
      } else {
        // Unknown block, try to skip
        break;
      }
    }

    return {
      width: this.width,
      height: this.height,
      frames: this.frames
    };
  }

  readImageDescriptor(delayTime, transparentIndex, disposalMethod) {
    const left = this.readUint16();
    const top = this.readUint16();
    const width = this.readUint16();
    const height = this.readUint16();
    const packed = this.readByte();

    const hasLocalColorTable = (packed & 0x80) !== 0;
    const interlaced = (packed & 0x40) !== 0;
    const localColorTableSize = hasLocalColorTable ? 2 << (packed & 0x07) : 0;

    let colorTable = this.globalColorTable;
    if (hasLocalColorTable) {
      colorTable = this.readColorTable(localColorTableSize);
    }

    // LZW Minimum Code Size
    const lzwMinCodeSize = this.readByte();

    // Read compressed data
    const compressedData = this.readSubBlocks();

    // Decompress
    const pixels = this.decompressLZW(compressedData, lzwMinCodeSize, width * height);

    // Create ImageData
    const imageData = new ImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < pixels.length; i++) {
      const colorIndex = pixels[i];
      const offset = i * 4;

      if (colorIndex === transparentIndex) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
      } else if (colorTable && colorIndex < colorTable.length) {
        const color = colorTable[colorIndex];
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }

    // Handle interlacing
    if (interlaced) {
      this.deinterlace(imageData, width, height);
    }

    return {
      imageData,
      left,
      top,
      width,
      height,
      delay: delayTime,
      disposalMethod
    };
  }

  decompressLZW(data, minCodeSize, pixelCount) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    let maxCode = 1 << codeSize;

    // Initialize code table
    const codeTable = [];
    for (let i = 0; i < clearCode; i++) {
      codeTable[i] = [i];
    }
    codeTable[clearCode] = [];
    codeTable[eoiCode] = [];

    const pixels = [];
    let bitPos = 0;
    let prevCode = -1;

    const readCode = () => {
      let code = 0;
      for (let i = 0; i < codeSize; i++) {
        const bytePos = Math.floor(bitPos / 8);
        const bitOffset = bitPos % 8;
        if (bytePos < data.length) {
          if ((data[bytePos] >> bitOffset) & 1) {
            code |= 1 << i;
          }
        }
        bitPos++;
      }
      return code;
    };

    while (pixels.length < pixelCount) {
      const code = readCode();

      if (code === clearCode) {
        codeSize = minCodeSize + 1;
        maxCode = 1 << codeSize;
        nextCode = eoiCode + 1;
        codeTable.length = eoiCode + 1;
        for (let i = 0; i < clearCode; i++) {
          codeTable[i] = [i];
        }
        prevCode = -1;
        continue;
      }

      if (code === eoiCode) {
        break;
      }

      let entry;
      if (code < codeTable.length && codeTable[code]) {
        entry = codeTable[code];
      } else if (code === nextCode && prevCode >= 0) {
        entry = [...codeTable[prevCode], codeTable[prevCode][0]];
      } else {
        break; // Invalid code
      }

      pixels.push(...entry);

      if (prevCode >= 0 && nextCode < 4096) {
        codeTable[nextCode] = [...codeTable[prevCode], entry[0]];
        nextCode++;

        if (nextCode >= maxCode && codeSize < 12) {
          codeSize++;
          maxCode = 1 << codeSize;
        }
      }

      prevCode = code;
    }

    return pixels.slice(0, pixelCount);
  }

  deinterlace(imageData, width, height) {
    const pixels = new Uint8ClampedArray(imageData.data);
    const passes = [
      { start: 0, step: 8 },
      { start: 4, step: 8 },
      { start: 2, step: 4 },
      { start: 1, step: 2 }
    ];

    let srcRow = 0;
    for (const pass of passes) {
      for (let y = pass.start; y < height; y += pass.step) {
        const srcOffset = srcRow * width * 4;
        const dstOffset = y * width * 4;
        for (let x = 0; x < width * 4; x++) {
          imageData.data[dstOffset + x] = pixels[srcOffset + x];
        }
        srcRow++;
      }
    }
  }

  readColorTable(size) {
    const table = [];
    for (let i = 0; i < size; i++) {
      table.push([
        this.readByte(),
        this.readByte(),
        this.readByte()
      ]);
    }
    return table;
  }

  readSubBlocks() {
    const data = [];
    let blockSize;
    while ((blockSize = this.readByte()) !== 0) {
      for (let i = 0; i < blockSize; i++) {
        data.push(this.readByte());
      }
    }
    return new Uint8Array(data);
  }

  skipSubBlocks() {
    let blockSize;
    while ((blockSize = this.readByte()) !== 0) {
      this.pos += blockSize;
    }
  }

  readByte() {
    return this.data[this.pos++] || 0;
  }

  readUint16() {
    const val = this.data[this.pos] | (this.data[this.pos + 1] << 8);
    this.pos += 2;
    return val;
  }

  readString(length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(this.readByte());
    }
    return str;
  }
}

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
  // Data URL GIF
  if (src.startsWith('data:image/gif')) return true;
  // File URL ending in .gif
  if (src.endsWith('.gif')) return true;
  return false;
}

/**
 * Decode a GIF from a data URL
 */
async function decodeGifFromDataUrl(dataUrl) {
  // Extract base64 data
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const decoder = new GifDecoder(bytes.buffer);
  const gifData = decoder.decode();

  return new AnimatedImage(gifData);
}

/**
 * Decode a GIF from a URL (fetches the file first)
 */
async function decodeGifFromUrl(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  const decoder = new GifDecoder(arrayBuffer);
  const gifData = decoder.decode();

  return new AnimatedImage(gifData);
}

// Export for use in inject.js
if (typeof window !== 'undefined') {
  window.GifDecoder = GifDecoder;
  window.AnimatedImage = AnimatedImage;
  window.isAnimatedGif = isAnimatedGif;
  window.decodeGifFromDataUrl = decodeGifFromDataUrl;
  window.decodeGifFromUrl = decodeGifFromUrl;
}
