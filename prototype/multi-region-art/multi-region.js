/* global fetch */
/**
 * Multi-Region Wall Art Prototype
 *
 * Features:
 * - Multiple perspective-transformed art regions
 * - Person occlusion (art appears behind user)
 * - Drag to move region, Shift+drag to pan art
 * - Corner dragging for perspective adjustment
 * - Zoom controls (+/- buttons and scroll wheel)
 * - Art picker with upload, gallery, URL tabs
 * - localStorage persistence
 */

// ============================================
// State
// ============================================
const state = {
  isRunning: false,
  animationId: null,

  // Regions
  regions: [],
  selectedRegionId: null,

  // Drag state
  dragging: null, // 'corner-topLeft', 'pan-art', 'move-region', etc.
  dragStartPoint: null,
  dragStartRegion: null, // Copy of region at drag start

  // Animation state for smooth corner movement
  cornerAnimation: {
    active: false,
    regionId: null,
    targetCorners: null,
    lerpFactor: 0.25  // 0-1, higher = faster (0.25 = smooth, 0.5 = snappy)
  },

  // Animation state for smooth zoom/pan transitions
  transformAnimation: {
    active: false,
    regionId: null,
    targetZoom: null,
    targetPanX: null,
    targetPanY: null,
    lerpFactor: 0.2  // Slightly faster for zoom/pan feedback
  },

  // Models
  segmenter: null,
  segmentationEnabled: true,
  segmentationReady: false,

  // Art sources cache (regionId -> Image)
  artSources: new Map(),

  // Canvas dimensions
  videoWidth: 640,
  videoHeight: 480,

  // Renderer state
  renderer: {
    mode: 'auto',           // 'auto' | 'webgl' | 'canvas2d'
    webglSupported: false,
    useWebGL: false         // Actual rendering mode after auto-detection
  }
};

// Elements
const elements = {
  webcam: document.getElementById('webcam'),
  canvas: document.getElementById('canvas'),
  addRegionBtn: document.getElementById('add-region-btn'),
  sidebarAddBtn: document.getElementById('sidebar-add-btn'),
  typeSelector: document.getElementById('type-selector'),
  toggleSegmentation: document.getElementById('toggle-segmentation'),
  toggleRenderer: document.getElementById('toggle-renderer'),
  resetBtn: document.getElementById('reset-btn'),
  regionList: document.getElementById('region-list'),
  infoPanel: document.getElementById('info-panel'),
  infoSelected: document.getElementById('info-selected'),
  infoZoom: document.getElementById('info-zoom'),
  infoPan: document.getElementById('info-pan'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  errorMessage: document.getElementById('error-message'),
  // Welcome modal elements
  welcomeOverlay: document.getElementById('welcome-overlay'),
  welcomeStep1: document.getElementById('welcome-step-1'),
  welcomeStepVideocalls: document.getElementById('welcome-step-videocalls'),
  welcomeStepStreaming: document.getElementById('welcome-step-streaming'),
  welcomeSkip: document.getElementById('welcome-skip'),
  welcomeSkipVideocalls: document.getElementById('welcome-skip-videocalls'),
  welcomeSkipStreaming: document.getElementById('welcome-skip-streaming'),
  backFromVideocalls: document.getElementById('back-from-videocalls'),
  backFromStreaming: document.getElementById('back-from-streaming'),
  hintTooltip: document.getElementById('hint-tooltip'),
  // Modal elements
  artPickerModal: document.getElementById('art-picker-modal'),
  closeModal: document.getElementById('close-modal'),
  cancelArt: document.getElementById('cancel-art'),
  applyArt: document.getElementById('apply-art'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  uploadPreview: document.getElementById('upload-preview'),
  previewImage: document.getElementById('preview-image'),
  clearPreview: document.getElementById('clear-preview'),
  galleryGrid: document.getElementById('gallery-grid'),
  urlInput: document.getElementById('url-input'),
  loadUrl: document.getElementById('load-url'),
  urlPreview: document.getElementById('url-preview'),
  urlPreviewImage: document.getElementById('url-preview-image'),
  urlError: document.getElementById('url-error'),
  // Color picker elements
  colorPicker: document.getElementById('color-picker'),
  colorHex: document.getElementById('color-hex'),
  gradientToggle: document.getElementById('gradient-toggle'),
  gradientControls: document.getElementById('gradient-controls'),
  gradientStart: document.getElementById('gradient-start'),
  gradientEnd: document.getElementById('gradient-end'),
  gradientDirection: document.getElementById('gradient-direction'),
  colorPreview: document.getElementById('color-preview'),
  recentColors: document.getElementById('recent-colors')
};

const ctx = elements.canvas.getContext('2d');

// Art picker state
const artPickerState = {
  targetRegionId: null,
  selectedSource: null,
  uploadedImage: null
};

// ============================================
// GIF Support
// ============================================

/**
 * Check if a source is a GIF (data URL or file URL)
 */
function isAnimatedGif(src) {
  if (!src) return false;
  if (src.startsWith('data:image/gif')) return true;
  if (src.toLowerCase().endsWith('.gif')) return true;
  return false;
}

/**
 * Decode a GIF from a data URL and return an AnimatedImage
 */
async function decodeGifFromDataUrl(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return decodeGifFromArrayBuffer(bytes.buffer);
}

/**
 * Decode a GIF from a URL (fetches the file first)
 */
async function decodeGifFromUrl(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return decodeGifFromArrayBuffer(arrayBuffer);
}

/**
 * Decode a GIF from an ArrayBuffer
 */
function decodeGifFromArrayBuffer(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  let pos = 0;

  const readByte = () => data[pos++] || 0;
  const readUint16 = () => {
    const val = data[pos] | (data[pos + 1] << 8);
    pos += 2;
    return val;
  };
  const readString = (len) => {
    let str = '';
    for (let i = 0; i < len; i++) str += String.fromCharCode(readByte());
    return str;
  };
  const readColorTable = (size) => {
    const table = [];
    for (let i = 0; i < size; i++) {
      table.push([readByte(), readByte(), readByte()]);
    }
    return table;
  };
  const readSubBlocks = () => {
    const result = [];
    let blockSize;
    while ((blockSize = readByte()) !== 0) {
      for (let i = 0; i < blockSize; i++) result.push(readByte());
    }
    return new Uint8Array(result);
  };
  const skipSubBlocks = () => {
    let blockSize;
    while ((blockSize = readByte()) !== 0) pos += blockSize;
  };

  // GIF Header
  const header = readString(6);
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    throw new Error('Invalid GIF header');
  }

  // Logical Screen Descriptor
  const width = readUint16();
  const height = readUint16();
  const packed = readByte();
  readByte(); // background color index
  readByte(); // pixel aspect ratio

  const hasGlobalColorTable = (packed & 0x80) !== 0;
  const globalColorTableSize = 2 << (packed & 0x07);
  let globalColorTable = null;

  if (hasGlobalColorTable) {
    globalColorTable = readColorTable(globalColorTableSize);
  }

  // Parse blocks
  const frames = [];
  let delayTime = 100;
  let transparentIndex = -1;
  let disposalMethod = 0;

  // LZW Decompression
  const decompressLZW = (compData, minCodeSize, pixelCount) => {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    let maxCode = 1 << codeSize;

    const codeTable = [];
    for (let i = 0; i < clearCode; i++) codeTable[i] = [i];
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
        if (bytePos < compData.length && (compData[bytePos] >> bitOffset) & 1) {
          code |= 1 << i;
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
        for (let i = 0; i < clearCode; i++) codeTable[i] = [i];
        prevCode = -1;
        continue;
      }
      if (code === eoiCode) break;

      let entry;
      if (code < codeTable.length && codeTable[code]) {
        entry = codeTable[code];
      } else if (code === nextCode && prevCode >= 0) {
        entry = [...codeTable[prevCode], codeTable[prevCode][0]];
      } else break;

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
  };

  while (pos < data.length) {
    const blockType = readByte();

    if (blockType === 0x21) {
      const extType = readByte();
      if (extType === 0xF9) {
        readByte(); // block size
        const gcPacked = readByte();
        disposalMethod = (gcPacked & 0x1C) >> 2;
        const hasTransparency = (gcPacked & 0x01) !== 0;
        delayTime = readUint16() * 10;
        if (delayTime === 0) delayTime = 100;
        transparentIndex = hasTransparency ? readByte() : -1;
        if (!hasTransparency) readByte();
        readByte(); // terminator
      } else {
        skipSubBlocks();
      }
    } else if (blockType === 0x2C) {
      // Image Descriptor
      const left = readUint16();
      const top = readUint16();
      const frameWidth = readUint16();
      const frameHeight = readUint16();
      const imgPacked = readByte();

      const hasLocalColorTable = (imgPacked & 0x80) !== 0;
      const localColorTableSize = hasLocalColorTable ? 2 << (imgPacked & 0x07) : 0;
      let colorTable = globalColorTable;
      if (hasLocalColorTable) {
        colorTable = readColorTable(localColorTableSize);
      }

      const lzwMinCodeSize = readByte();
      const compressedData = readSubBlocks();
      const pixels = decompressLZW(compressedData, lzwMinCodeSize, frameWidth * frameHeight);

      const imageData = new ImageData(frameWidth, frameHeight);
      for (let i = 0; i < pixels.length; i++) {
        const colorIndex = pixels[i];
        const offset = i * 4;
        if (colorIndex === transparentIndex) {
          imageData.data[offset + 3] = 0;
        } else if (colorTable && colorIndex < colorTable.length) {
          const color = colorTable[colorIndex];
          imageData.data[offset] = color[0];
          imageData.data[offset + 1] = color[1];
          imageData.data[offset + 2] = color[2];
          imageData.data[offset + 3] = 255;
        }
      }

      frames.push({ imageData, left, top, width: frameWidth, height: frameHeight, delay: delayTime, disposalMethod });
      delayTime = 100;
      transparentIndex = -1;
      disposalMethod = 0;
    } else if (blockType === 0x3B) {
      break;
    } else {
      break;
    }
  }

  return createAnimatedImage({ width, height, frames });
}

/**
 * Create an AnimatedImage object from decoded GIF data
 */
function createAnimatedImage(gifData) {
  const { width, height, frames } = gifData;

  // Pre-render frames to canvases
  const frameCanvases = [];
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const compositeCtx = compositeCanvas.getContext('2d');

  for (const frame of frames) {
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext('2d');

    frameCtx.drawImage(compositeCanvas, 0, 0);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frame.width;
    tempCanvas.height = frame.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(frame.imageData, 0, 0);

    frameCtx.drawImage(tempCanvas, frame.left, frame.top);
    frameCanvases.push(frameCanvas);

    if (frame.disposalMethod === 0 || frame.disposalMethod === 1) {
      compositeCtx.drawImage(tempCanvas, frame.left, frame.top);
    } else if (frame.disposalMethod === 2) {
      compositeCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
    }
  }

  return {
    width,
    height,
    frames,
    frameCanvases,
    frameIndex: 0,
    lastFrameTime: 0,
    playing: true,
    isAnimated: frames.length > 1,

    get currentFrame() {
      return this.frameCanvases[this.frameIndex];
    },

    update(timestamp) {
      if (!this.playing || this.frames.length <= 1) return;
      if (!this.lastFrameTime) this.lastFrameTime = timestamp;

      const elapsed = timestamp - this.lastFrameTime;
      const currentDelay = this.frames[this.frameIndex].delay;

      if (elapsed >= currentDelay) {
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        this.lastFrameTime = timestamp;
      }
    },

    reset() {
      this.frameIndex = 0;
      this.lastFrameTime = 0;
    }
  };
}

// Gallery images
const GALLERY_IMAGES = [
  // Animated GIFs
  { id: 'anim-blue', name: 'Blue Aura', category: 'animated', src: '../../assets/effects/blue-aura.gif', isGif: true },
  { id: 'anim-gold', name: 'Gold Aura', category: 'animated', src: '../../assets/effects/gold-aura.gif', isGif: true },
  { id: 'anim-green', name: 'Green Aura', category: 'animated', src: '../../assets/effects/green-aura.gif', isGif: true },
  { id: 'anim-pink', name: 'Pink Aura', category: 'animated', src: '../../assets/effects/pink-aura.gif', isGif: true },
  { id: 'anim-purple', name: 'Purple Aura', category: 'animated', src: '../../assets/effects/purple-aura.gif', isGif: true },
  { id: 'anim-red', name: 'Red Aura', category: 'animated', src: '../../assets/effects/red-aura.gif', isGif: true },
  { id: 'anim-silver', name: 'Silver Aura', category: 'animated', src: '../../assets/effects/silver-aura.gif', isGif: true },

  // Abstract art
  { id: 'abstract-blue', name: 'Blue Abstract', category: 'abstract', src: '../../assets/wall-art/abstract-blue.png' },
  { id: 'abstract-green', name: 'Green Abstract', category: 'abstract', src: '../../assets/wall-art/abstract-green.png' },
  { id: 'abstract-ocean', name: 'Ocean Abstract', category: 'abstract', src: '../../assets/wall-art/abstract-ocean.png' },
  { id: 'abstract-purple', name: 'Purple Abstract', category: 'abstract', src: '../../assets/wall-art/abstract-purple.png' },
  { id: 'abstract-sunset', name: 'Sunset Abstract', category: 'abstract', src: '../../assets/wall-art/abstract-sunset.png' },

  // Nature scenes
  { id: 'nature-autumn', name: 'Autumn', category: 'nature', src: '../../assets/wall-art/nature-autumn.png' },
  { id: 'nature-beach', name: 'Beach', category: 'nature', src: '../../assets/wall-art/nature-beach.png' },
  { id: 'nature-leaves', name: 'Leaves', category: 'nature', src: '../../assets/wall-art/nature-leaves.png' },
  { id: 'nature-mountain', name: 'Mountain', category: 'nature', src: '../../assets/wall-art/nature-mountain.png' },
  { id: 'nature-sky', name: 'Sky', category: 'nature', src: '../../assets/wall-art/nature-sky.png' },

  // Patterns
  { id: 'pattern-dots', name: 'Dots', category: 'patterns', src: '../../assets/wall-art/pattern-dots.png' },
  { id: 'pattern-geometric', name: 'Geometric', category: 'patterns', src: '../../assets/wall-art/pattern-geometric.png' },
  { id: 'pattern-hexagon', name: 'Hexagon', category: 'patterns', src: '../../assets/wall-art/pattern-hexagon.png' },
  { id: 'pattern-lines', name: 'Lines', category: 'patterns', src: '../../assets/wall-art/pattern-lines.png' },
  { id: 'pattern-waves', name: 'Waves', category: 'patterns', src: '../../assets/wall-art/pattern-waves.png' }

  // Note: Solid colors removed - use the Color tab instead for solid colors and gradients
];

// ============================================
// WebGL Renderer
// ============================================

// Vertex shader - transforms vertices using homography matrix
const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;

  uniform mat3 u_matrix;

  varying vec2 v_texCoord;

  void main() {
    // Apply homography matrix (projective transform)
    vec3 pos = u_matrix * vec3(a_position, 1.0);
    // Perspective divide
    gl_Position = vec4(pos.xy / pos.z, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Fragment shader - samples texture with alpha support
const FRAGMENT_SHADER_SRC = `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform float u_alpha;

  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    gl_FragColor = vec4(color.rgb, color.a * u_alpha);
  }
`;

/**
 * WebGL-based renderer for perspective-transformed quads.
 * Provides true projective transforms using homography matrices.
 */
class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (!this.gl) {
      throw new Error('WebGL not supported');
    }

    this.program = null;
    this.textures = new Map();
    this.locations = {};
    this.buffers = {};

    this.init();
  }

  get name() {
    return 'WebGL';
  }

  init() {
    const gl = this.gl;

    // Create shader program
    this.program = this.createShaderProgram();
    gl.useProgram(this.program);

    // Get attribute and uniform locations
    this.locations = {
      a_position: gl.getAttribLocation(this.program, 'a_position'),
      a_texCoord: gl.getAttribLocation(this.program, 'a_texCoord'),
      u_matrix: gl.getUniformLocation(this.program, 'u_matrix'),
      u_texture: gl.getUniformLocation(this.program, 'u_texture'),
      u_alpha: gl.getUniformLocation(this.program, 'u_alpha')
    };

    // Setup vertex buffers
    this.setupBuffers();

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    console.log('WebGLRenderer initialized successfully');
  }

  createShaderProgram() {
    const gl = this.gl;

    const vertShader = this.compileShader(VERTEX_SHADER_SRC, gl.VERTEX_SHADER);
    const fragShader = this.compileShader(FRAGMENT_SHADER_SRC, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('Shader program link failed: ' + error);
    }

    // Clean up individual shaders (they're now part of the program)
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    return program;
  }

  compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      const shaderType = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      throw new Error(`${shaderType} shader compile failed: ${error}`);
    }

    return shader;
  }

  setupBuffers() {
    const gl = this.gl;

    // Create position buffer (unit square: 0,0 to 1,1)
    // We'll transform this to the target quad using the homography
    const positions = new Float32Array([
      0, 0,  // bottom-left
      1, 0,  // bottom-right
      0, 1,  // top-left
      1, 1   // top-right
    ]);

    this.buffers.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create texture coordinate buffer (same as positions for unit square)
    const texCoords = new Float32Array([
      0, 1,  // bottom-left (flipped Y for WebGL)
      1, 1,  // bottom-right
      0, 0,  // top-left
      1, 0   // top-right
    ]);

    this.buffers.texCoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  }

  /**
   * Clear the canvas
   */
  clear() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Resize the WebGL viewport to match canvas size
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Load or update a texture from an image source
   * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
   * @param {string} id - Unique texture identifier
   * @returns {WebGLTexture}
   */
  loadTexture(image, id) {
    const gl = this.gl;

    // Reuse existing texture or create new one
    let texture = this.textures.get(id);
    if (!texture) {
      texture = gl.createTexture();
      this.textures.set(id, texture);
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Upload image to texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Set texture parameters for non-power-of-2 images
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  /**
   * Delete a texture to free GPU memory
   * @param {string} id - Texture identifier
   */
  deleteTexture(id) {
    const texture = this.textures.get(id);
    if (texture) {
      this.gl.deleteTexture(texture);
      this.textures.delete(id);
    }
  }

  /**
   * Get a texture by ID
   * @param {string} id - Texture identifier
   * @returns {WebGLTexture|undefined}
   */
  getTexture(id) {
    return this.textures.get(id);
  }

  /**
   * Check if WebGL context is valid
   * @returns {boolean}
   */
  isContextValid() {
    return !this.gl.isContextLost();
  }

  /**
   * Convert region corners from percentage (0-100) to WebGL clip space (-1 to 1)
   * @param {Object} regionCorners - Corners with x,y in 0-100 range
   * @returns {Object} Corners in WebGL clip space
   */
  regionToGLCoords(regionCorners) {
    const toGL = (corner) => ({
      x: (corner.x / 100) * 2 - 1,      // 0-100% → -1 to 1
      y: 1 - (corner.y / 100) * 2       // 0-100% → 1 to -1 (flip Y for WebGL)
    });

    return {
      topLeft: toGL(regionCorners.topLeft),
      topRight: toGL(regionCorners.topRight),
      bottomLeft: toGL(regionCorners.bottomLeft),
      bottomRight: toGL(regionCorners.bottomRight)
    };
  }

  /**
   * Compute 3x3 homography matrix that maps unit square to quadrilateral.
   * Uses Direct Linear Transform (DLT) algorithm.
   *
   * Maps: (0,0) → bottomLeft, (1,0) → bottomRight,
   *       (0,1) → topLeft, (1,1) → topRight
   *
   * @param {Object} corners - Quad corners in GL coordinates
   * @returns {Float32Array} 3x3 matrix in column-major order for WebGL
   */
  computeHomography(corners) {
    // Extract corner coordinates
    // Note: Our unit square has (0,0) at bottom-left, (1,1) at top-right
    const x0 = corners.bottomLeft.x, y0 = corners.bottomLeft.y;   // (0,0)
    const x1 = corners.bottomRight.x, y1 = corners.bottomRight.y; // (1,0)
    const x2 = corners.topRight.x, y2 = corners.topRight.y;       // (1,1)
    const x3 = corners.topLeft.x, y3 = corners.topLeft.y;         // (0,1)

    // Compute the homography using the standard algorithm
    // See: https://math.stackexchange.com/questions/494238/
    //
    // The homography H maps (u,v) to (x,y) where:
    // [x']   [a b c] [u]
    // [y'] = [d e f] [v]
    // [w']   [g h 1] [1]
    // and (x,y) = (x'/w', y'/w')

    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dx3 = x0 - x1 + x2 - x3;

    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const dy3 = y0 - y1 + y2 - y3;

    // Check if it's a simple affine transform (parallelogram)
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-10) {
      // Degenerate case - return identity matrix
      return new Float32Array([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
      ]);
    }

    // Compute perspective parameters g and h
    const g = (dx3 * dy2 - dx2 * dy3) / det;
    const h = (dx1 * dy3 - dx3 * dy1) / det;

    // Compute affine parameters
    const a = x1 - x0 + g * x1;
    const b = x3 - x0 + h * x3;
    const c = x0;

    const d = y1 - y0 + g * y1;
    const e = y3 - y0 + h * y3;
    const f = y0;

    // Return 3x3 matrix in column-major order (WebGL convention)
    // Matrix:  [a d g]
    //          [b e h]
    //          [c f 1]
    return new Float32Array([
      a, d, g,
      b, e, h,
      c, f, 1
    ]);
  }

  /**
   * Compute homography with zoom and pan applied to texture coordinates.
   * This modifies which part of the texture is visible.
   *
   * @param {Object} corners - Quad corners in GL coordinates
   * @param {Object} transform - {zoom, panX, panY}
   * @returns {Float32Array} 3x3 matrix in column-major order
   */
  computeHomographyWithTransform(corners, _transform) {
    // Note: zoom/pan from transform are handled in updateTexCoords, not in the homography
    // The transform parameter is kept for API consistency

    // Compute and return the basic homography
    return this.computeHomography(corners);
  }

  /**
   * Draw a textured quad with perspective transform.
   *
   * @param {Object} regionCorners - Quad corners in % coordinates (0-100)
   * @param {WebGLTexture|string} textureOrId - Texture object or texture ID
   * @param {Object} transform - {zoom, panX, panY}
   * @param {number} alpha - Opacity (0-1)
   */
  drawQuad(regionCorners, textureOrId, transform = { zoom: 1, panX: 0, panY: 0 }, alpha = 1.0) {
    const gl = this.gl;

    // Get texture
    const texture = typeof textureOrId === 'string'
      ? this.textures.get(textureOrId)
      : textureOrId;

    if (!texture) {
      console.warn('WebGLRenderer.drawQuad: texture not found');
      return;
    }

    gl.useProgram(this.program);

    // Convert region coordinates to WebGL clip space
    const glCorners = this.regionToGLCoords(regionCorners);

    // Compute homography matrix
    const matrix = this.computeHomography(glCorners);

    // Update texture coordinates for zoom/pan
    this.updateTexCoords(transform);

    // Bind position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.enableVertexAttribArray(this.locations.a_position);
    gl.vertexAttribPointer(this.locations.a_position, 2, gl.FLOAT, false, 0, 0);

    // Bind texture coordinate buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.enableVertexAttribArray(this.locations.a_texCoord);
    gl.vertexAttribPointer(this.locations.a_texCoord, 2, gl.FLOAT, false, 0, 0);

    // Set uniforms
    gl.uniformMatrix3fv(this.locations.u_matrix, false, matrix);
    gl.uniform1f(this.locations.u_alpha, alpha);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.locations.u_texture, 0);

    // Draw quad as triangle strip
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Update texture coordinates buffer for zoom/pan.
   *
   * @param {Object} transform - {zoom, panX, panY}
   */
  updateTexCoords(transform) {
    const gl = this.gl;
    const { zoom = 1, panX = 0, panY = 0 } = transform;

    // Calculate visible region of texture
    // zoom=1 shows full texture, zoom=2 shows half (centered), etc.
    const visibleSize = 1 / zoom;

    // Pan is in pixels, convert to normalized texture coords
    // Assume texture is roughly 1000px, scale accordingly
    const panScale = 0.001;
    const offsetX = (1 - visibleSize) / 2 + panX * panScale;
    const offsetY = (1 - visibleSize) / 2 + panY * panScale;

    // Clamp offsets to valid range
    const minOffset = 0;
    const maxOffset = 1 - visibleSize;
    const clampedX = Math.max(minOffset, Math.min(maxOffset, offsetX));
    const clampedY = Math.max(minOffset, Math.min(maxOffset, offsetY));

    // Texture coordinates (note: Y is flipped for WebGL)
    const u0 = clampedX;
    const u1 = clampedX + visibleSize;
    const v0 = 1 - clampedY - visibleSize;  // Flip Y
    const v1 = 1 - clampedY;

    const texCoords = new Float32Array([
      u0, v1,  // bottom-left
      u1, v1,  // bottom-right
      u0, v0,  // top-left
      u1, v0   // top-right
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW);
  }

  /**
   * Read pixels from the WebGL canvas.
   * Used for compositing with person mask.
   *
   * @returns {Uint8Array} RGBA pixel data
   */
  readPixels() {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const pixels = new Uint8Array(width * height * 4);

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL reads pixels bottom-to-top, need to flip vertically
    const flipped = new Uint8Array(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * rowSize;
      const dstRow = y * rowSize;
      flipped.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
    }

    return flipped;
  }

  /**
   * Get canvas as ImageData for compositing.
   *
   * @returns {ImageData}
   */
  getImageData() {
    const pixels = this.readPixels();
    return new ImageData(
      new Uint8ClampedArray(pixels.buffer),
      this.canvas.width,
      this.canvas.height
    );
  }

  /**
   * Dispose of all WebGL resources
   */
  dispose() {
    const gl = this.gl;

    // Delete all textures
    for (const texture of this.textures.values()) {
      gl.deleteTexture(texture);
    }
    this.textures.clear();

    // Delete buffers
    if (this.buffers.position) gl.deleteBuffer(this.buffers.position);
    if (this.buffers.texCoord) gl.deleteBuffer(this.buffers.texCoord);

    // Delete program
    if (this.program) gl.deleteProgram(this.program);
  }
}

// WebGL renderer instance (initialized later if supported)
let webglRenderer = null;
let glCanvas = null;  // Off-screen canvas for WebGL rendering

/**
 * Initialize WebGL renderer if supported.
 * Creates an off-screen canvas for WebGL rendering.
 */
function initWebGLRenderer() {
  try {
    // Create off-screen canvas for WebGL
    glCanvas = document.createElement('canvas');
    glCanvas.width = state.videoWidth;
    glCanvas.height = state.videoHeight;

    // Try to create WebGL renderer
    webglRenderer = new WebGLRenderer(glCanvas);
    state.renderer.webglSupported = true;
    state.renderer.useWebGL = (state.renderer.mode === 'auto' || state.renderer.mode === 'webgl');

    console.log('WebGL renderer initialized, mode:', state.renderer.useWebGL ? 'WebGL' : 'Canvas2D');
  } catch (e) {
    console.warn('WebGL not available, falling back to Canvas2D:', e.message);
    state.renderer.webglSupported = false;
    state.renderer.useWebGL = false;
    webglRenderer = null;
    glCanvas = null;
  }
}

/**
 * Set renderer mode.
 * @param {'auto' | 'webgl' | 'canvas2d'} mode
 */
function setRendererMode(mode) {
  state.renderer.mode = mode;

  if (mode === 'canvas2d') {
    state.renderer.useWebGL = false;
  } else if (mode === 'webgl' && state.renderer.webglSupported) {
    state.renderer.useWebGL = true;
  } else {
    // Auto mode - use WebGL if available
    state.renderer.useWebGL = state.renderer.webglSupported;
  }

  console.log('Renderer mode set to:', state.renderer.useWebGL ? 'WebGL' : 'Canvas2D');
  updateRendererStatus();
}

/**
 * Cycle through renderer modes: auto -> webgl -> canvas2d -> auto
 */
function cycleRendererMode() {
  const modes = ['auto', 'webgl', 'canvas2d'];
  const currentIndex = modes.indexOf(state.renderer.mode);
  const nextIndex = (currentIndex + 1) % modes.length;
  setRendererMode(modes[nextIndex]);
}

/**
 * Update renderer toggle button UI to reflect current state.
 */
function updateRendererStatus() {
  const btn = elements.toggleRenderer;
  if (!btn) return;

  const statusEl = btn.querySelector('.status');

  // Remove all state classes
  btn.classList.remove('webgl', 'canvas2d');

  // Get display text and class
  let displayText;
  let stateClass;

  if (state.renderer.mode === 'auto') {
    displayText = state.renderer.useWebGL ? 'Auto (WebGL)' : 'Auto (2D)';
    stateClass = state.renderer.useWebGL ? 'webgl' : 'canvas2d';
  } else if (state.renderer.mode === 'webgl') {
    displayText = state.renderer.webglSupported ? 'WebGL' : 'WebGL (N/A)';
    stateClass = state.renderer.webglSupported ? 'webgl' : 'canvas2d';
  } else {
    displayText = 'Canvas 2D';
    stateClass = 'canvas2d';
  }

  statusEl.textContent = displayText;
  btn.classList.add(stateClass);
}

// ============================================
// Initialization
// ============================================
// ============================================
// Welcome Modal (First-time UX)
// ============================================
const WELCOME_SHOWN_KEY = 'wallart_welcome_shown';

// Demo art sources for each demo type
const DEMO_ART = {
  animated: {
    src: '../../assets/effects/purple-aura.gif',
    name: 'Purple Aura',
    contentType: 'gif',
    isAnimated: true
  },
  professional: {
    src: '../../assets/wall-art/office-plants.png',
    name: 'Office Plants',
    contentType: 'image',
    isAnimated: false
  },
  sponsor: {
    // Create a simple sponsor banner as data URL
    src: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
        <rect fill="#1a1a1a" width="400" height="200"/>
        <rect fill="#e85d04" x="10" y="10" width="380" height="180" rx="8"/>
        <text x="200" y="90" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold">YOUR SPONSOR</text>
        <text x="200" y="130" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="16" opacity="0.8">yourbrand.com</text>
      </svg>
    `),
    name: 'Sponsor Banner',
    contentType: 'image',
    isAnimated: false
  }
};

function isFirstTimeUser() {
  return !localStorage.getItem(WELCOME_SHOWN_KEY);
}

function markWelcomeShown() {
  localStorage.setItem(WELCOME_SHOWN_KEY, 'true');
}

function showWelcomeModal() {
  elements.welcomeOverlay.classList.remove('hidden');

  // Helper to show a specific step
  const showStep = (stepElement) => {
    elements.welcomeStep1.classList.add('hidden');
    elements.welcomeStepVideocalls.classList.add('hidden');
    elements.welcomeStepStreaming.classList.add('hidden');
    stepElement.classList.remove('hidden');
  };

  // Step 1: Use case selection
  const usecaseCards = elements.welcomeStep1.querySelectorAll('.usecase-card');
  usecaseCards.forEach(card => {
    card.addEventListener('click', () => {
      const usecase = card.dataset.usecase;
      if (usecase === 'videocalls') {
        showStep(elements.welcomeStepVideocalls);
      } else if (usecase === 'streaming') {
        showStep(elements.welcomeStepStreaming);
      }
    });
  });

  // Back buttons
  elements.backFromVideocalls.addEventListener('click', () => {
    showStep(elements.welcomeStep1);
  });
  elements.backFromStreaming.addEventListener('click', () => {
    showStep(elements.welcomeStep1);
  });

  // Set up demo card click handlers (for both step 2 variants)
  const demoCards = elements.welcomeOverlay.querySelectorAll('.demo-card');
  demoCards.forEach(card => {
    card.addEventListener('click', () => {
      const demoType = card.dataset.demo;
      handleDemoSelection(demoType);
    });
  });

  // Skip buttons (all three)
  elements.welcomeSkip.addEventListener('click', () => {
    hideWelcomeModal();
  });
  elements.welcomeSkipVideocalls.addEventListener('click', () => {
    hideWelcomeModal();
  });
  elements.welcomeSkipStreaming.addEventListener('click', () => {
    hideWelcomeModal();
  });
}

function hideWelcomeModal() {
  elements.welcomeOverlay.classList.add('hidden');
  markWelcomeShown();
}

async function handleDemoSelection(demoType) {
  hideWelcomeModal();

  // Create a behind-center region
  const region = createBehindCenterRegion();
  state.regions.push(region);
  state.selectedRegionId = region.id;

  // Assign the demo art
  const demoArt = DEMO_ART[demoType];
  region.art = {
    src: demoArt.src,
    name: demoArt.name,
    contentType: demoArt.contentType,
    isAnimated: demoArt.isAnimated
  };

  // Load the art source
  if (demoArt.isAnimated) {
    try {
      let animatedImage;
      if (demoArt.src.startsWith('data:')) {
        animatedImage = await decodeGifFromDataUrl(demoArt.src);
      } else {
        animatedImage = await decodeGifFromUrl(demoArt.src);
      }
      state.artSources.set(region.id, animatedImage);

      if (webglRenderer && animatedImage.currentFrame) {
        webglRenderer.loadTexture(animatedImage.currentFrame, region.id);
      }
    } catch (e) {
      console.error('Failed to decode GIF:', e);
      loadStaticImage(region, demoArt.src);
    }
  } else {
    loadStaticImage(region, demoArt.src);
  }

  updateRegionList();
  saveToStorage();

  // Show hint tooltip after a short delay
  setTimeout(showHintTooltip, 800);
}

function createBehindCenterRegion() {
  // Create a large region positioned behind-center
  // This positioning showcases person occlusion well
  const id = `region-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  return {
    id,
    name: `Region ${state.regions.length + 1}`,
    type: 'trapezoid',  // Wall frame type to showcase person occlusion
    region: {
      topLeft: { x: 15, y: 8 },
      topRight: { x: 85, y: 8 },
      bottomLeft: { x: 15, y: 75 },
      bottomRight: { x: 85, y: 75 }
    },
    art: null,
    transform: { zoom: 1.0, panX: 0, panY: 0 },
    active: true,
    zIndex: state.regions.length
  };
}

function showHintTooltip() {
  elements.hintTooltip.classList.remove('hidden');

  // Auto-hide after 8 seconds or on user interaction
  const hideTooltip = () => {
    elements.hintTooltip.classList.add('fade-out');
    setTimeout(() => {
      elements.hintTooltip.classList.add('hidden');
      elements.hintTooltip.classList.remove('fade-out');
    }, 300);
  };

  // Hide on any canvas interaction
  const hideOnInteraction = () => {
    hideTooltip();
    elements.canvas.removeEventListener('mousedown', hideOnInteraction);
    elements.canvas.removeEventListener('touchstart', hideOnInteraction);
  };

  elements.canvas.addEventListener('mousedown', hideOnInteraction);
  elements.canvas.addEventListener('touchstart', hideOnInteraction);

  // Auto-hide after 8 seconds
  setTimeout(hideTooltip, 8000);
}

async function init() {
  showLoading('Starting camera...');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });

    elements.webcam.srcObject = stream;
    await elements.webcam.play();

    state.videoWidth = elements.webcam.videoWidth;
    state.videoHeight = elements.webcam.videoHeight;
    elements.canvas.width = state.videoWidth;
    elements.canvas.height = state.videoHeight;

    // Initialize WebGL renderer
    initWebGLRenderer();

    loadFromStorage();

    updateSegmentationStatus('loading');
    loadSegmentationModel().catch(err => {
      console.error('Failed to load segmentation:', err);
      updateSegmentationStatus('error');
    });

    setupEventListeners();

    state.isRunning = true;
    hideLoading();
    renderLoop();

    // Show welcome modal for first-time users (after camera is ready)
    if (isFirstTimeUser() && state.regions.length === 0) {
      setTimeout(showWelcomeModal, 500);
    }

  } catch (error) {
    console.error('Init error:', error);
    hideLoading();
    showError('Camera access denied. Please allow camera access and reload.');
  }
}

// ============================================
// MediaPipe Segmentation
// ============================================
async function loadSegmentationModel() {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm');
  const { ImageSegmenter, FilesetResolver } = vision;

  const wasmFileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  state.segmenter = await ImageSegmenter.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false
  });

  state.segmentationReady = true;
  updateSegmentationStatus('active');
}

function updateSegmentationStatus(status) {
  const btn = elements.toggleSegmentation;
  const statusEl = btn.querySelector('.status');

  btn.classList.remove('active', 'loading', 'disabled');

  switch (status) {
    case 'loading':
      btn.classList.add('loading');
      statusEl.textContent = 'Loading...';
      break;
    case 'active':
      btn.classList.add('active');
      statusEl.textContent = 'Active';
      break;
    case 'disabled':
      btn.classList.add('disabled');
      statusEl.textContent = 'Off';
      break;
    case 'error':
      btn.classList.add('disabled');
      statusEl.textContent = 'Error';
      break;
  }
}

// ============================================
// Region Types
// ============================================
const REGION_TYPES = {
  FREE: 'free',           // Free-form quadrilateral - all corners move independently
  TRAPEZOID: 'trapezoid'  // Vertical edges mode - left/right edges stay vertical (parallel)
};

// ============================================
// Region Management
// ============================================
function createRegion(type = REGION_TYPES.FREE) {
  const id = `region-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const regionCount = state.regions.length;

  const offset = (regionCount * 5) % 20;
  const region = {
    id,
    name: `Region ${regionCount + 1}`,
    type,  // 'free' or 'trapezoid'
    region: {
      topLeft: { x: 30 + offset, y: 30 + offset },
      topRight: { x: 70 + offset, y: 30 + offset },
      bottomLeft: { x: 30 + offset, y: 70 + offset },
      bottomRight: { x: 70 + offset, y: 70 + offset }
    },
    art: null,
    transform: { zoom: 1.0, panX: 0, panY: 0 },
    active: true,
    zIndex: regionCount
  };

  state.regions.push(region);
  selectRegion(id);
  updateRegionList();
  saveToStorage();

  openArtPicker(id);

  return region;
}

function deleteRegion(id) {
  const index = state.regions.findIndex(r => r.id === id);
  if (index === -1) return;

  state.regions.splice(index, 1);
  state.artSources.delete(id);

  if (state.selectedRegionId === id) {
    state.selectedRegionId = state.regions.length > 0 ? state.regions[state.regions.length - 1].id : null;
  }

  updateRegionList();
  saveToStorage();
}

function selectRegion(id) {
  state.selectedRegionId = id;
  updateRegionList();
  updateInfoPanel();
}

function getSelectedRegion() {
  return state.regions.find(r => r.id === state.selectedRegionId) || null;
}

// ============================================
// Render Loop
// ============================================
function renderLoop() {
  if (!state.isRunning) return;

  state.animationId = requestAnimationFrame(renderLoop);

  const timestamp = performance.now();

  // Update corner animations (smooth lerp for dragging)
  updateCornerAnimations();

  // Update zoom/pan animations (smooth transitions)
  updateTransformAnimations();

  // Update GIF animations
  updateGifAnimations(timestamp);

  // Draw video
  ctx.drawImage(elements.webcam, 0, 0);

  // Get person mask if segmentation enabled
  let personMask = null;
  let maskWidth = 0, maskHeight = 0;

  if (state.segmentationEnabled && state.segmentationReady && state.segmenter) {
    try {
      const result = state.segmenter.segmentForVideo(elements.webcam, performance.now());
      if (result.categoryMask) {
        maskWidth = result.categoryMask.width;
        maskHeight = result.categoryMask.height;
        personMask = result.categoryMask.getAsUint8Array();
        result.categoryMask.close();
      }
    } catch {
      // Ignore segmentation errors
    }
  }

  // Check if any regions have art to render
  const hasArtRegions = state.regions.some(r => r.active && r.art && state.artSources.has(r.id));

  if (hasArtRegions) {
    // Choose rendering path based on mode
    if (state.renderer.useWebGL && webglRenderer) {
      // WebGL rendering path
      renderArtWithWebGL(personMask, maskWidth, maskHeight);
    } else {
      // Canvas2D rendering path (original)
      for (const region of state.regions) {
        if (!region.active) continue;
        if (region.art && state.artSources.has(region.id)) {
          renderRegionWithArt(region, personMask, maskWidth, maskHeight);
        }
      }
    }
  }

  // Draw region overlays (handles, outlines)
  for (const region of state.regions) {
    if (!region.active) continue;
    drawRegionOverlay(region, region.id === state.selectedRegionId);
  }
}

/**
 * Toggle play/pause for a GIF region
 */
function toggleGifPlayback(regionId) {
  const source = state.artSources.get(regionId);
  if (source?.isAnimated) {
    source.playing = !source.playing;
    if (source.playing) {
      source.lastFrameTime = 0; // Reset timing
    }
    updateRegionList(); // Update sidebar to show state
  }
}

/**
 * Update all GIF animations
 */
function updateGifAnimations(timestamp) {
  for (const region of state.regions) {
    if (!region.active || !region.art?.isAnimated) continue;

    const source = state.artSources.get(region.id);
    if (source && source.isAnimated && source.update) {
      const prevFrame = source.frameIndex;
      source.update(timestamp);

      // If frame changed and using WebGL, update the texture
      if (prevFrame !== source.frameIndex && webglRenderer && state.renderer.useWebGL) {
        webglRenderer.loadTexture(source.currentFrame, region.id);
      }
    }
  }
}

/**
 * Get the drawable source for a region (handles GIF current frame)
 */
function getDrawableSource(region) {
  const source = state.artSources.get(region.id);
  if (!source) return null;

  // If it's an animated GIF, return the current frame
  if (source.isAnimated && source.currentFrame) {
    return source.currentFrame;
  }

  // Regular image
  return source;
}

/**
 * Render all art regions using WebGL and composite with person mask.
 */
function renderArtWithWebGL(personMask, maskWidth, maskHeight) {
  // Render all regions to WebGL canvas
  const artImageData = renderRegionsWebGL();
  if (!artImageData) return;

  // Apply person mask if available
  if (personMask) {
    applyPersonMaskToImageData(artImageData, personMask, maskWidth, maskHeight);
  }

  // Create temp canvas to hold the masked art
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = artImageData.width;
  tempCanvas.height = artImageData.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(artImageData, 0, 0);

  // Composite onto main canvas
  ctx.drawImage(tempCanvas, 0, 0);
}

function renderRegionWithArt(region, personMask, maskWidth, maskHeight) {
  const source = getDrawableSource(region);
  if (!source) return;

  // For regular images, check if loaded
  if (source.complete === false) return;

  const width = elements.canvas.width;
  const height = elements.canvas.height;

  // Convert region % to pixels
  const corners = {
    topLeft: { x: (region.region.topLeft.x / 100) * width, y: (region.region.topLeft.y / 100) * height },
    topRight: { x: (region.region.topRight.x / 100) * width, y: (region.region.topRight.y / 100) * height },
    bottomLeft: { x: (region.region.bottomLeft.x / 100) * width, y: (region.region.bottomLeft.y / 100) * height },
    bottomRight: { x: (region.region.bottomRight.x / 100) * width, y: (region.region.bottomRight.y / 100) * height }
  };

  // Create temp canvas for this region's art
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');

  // Draw perspective-transformed image to temp canvas
  drawPerspectiveImage(tempCtx, source, corners, region.transform, width, height);

  // Apply person mask if available (makes person appear in front of art)
  if (personMask) {
    applyPersonMask(tempCtx, personMask, maskWidth, maskHeight);
  }

  // Composite onto main canvas
  ctx.drawImage(tempCanvas, 0, 0);
}

/**
 * Render all regions using WebGL.
 * Returns an ImageData that can be composited with person mask.
 */
function renderRegionsWebGL() {
  if (!webglRenderer || !glCanvas) return null;

  const width = elements.canvas.width;
  const height = elements.canvas.height;

  // Ensure WebGL canvas matches main canvas size
  if (glCanvas.width !== width || glCanvas.height !== height) {
    webglRenderer.resize(width, height);
  }

  // Clear WebGL canvas
  webglRenderer.clear();

  // Render each region
  for (const region of state.regions) {
    if (!region.active) continue;

    const source = state.artSources.get(region.id);
    // For regular images, check .complete; for AnimatedImage objects, check .isAnimated
    const isReady = source && (source.isAnimated || source.complete !== false);
    if (!isReady) continue;

    // Get the drawable source (current frame for GIFs, image for static)
    const drawableSource = source.isAnimated ? source.currentFrame : source;
    if (!drawableSource) continue;

    // Ensure texture is loaded
    let texture = webglRenderer.getTexture(region.id);
    if (!texture) {
      texture = webglRenderer.loadTexture(drawableSource, region.id);
    }

    // Draw the quad with perspective transform
    webglRenderer.drawQuad(region.region, texture, region.transform, 1.0);
  }

  return webglRenderer.getImageData();
}

/**
 * Apply person mask to WebGL-rendered image data.
 * Makes person pixels transparent so person appears in front of art.
 */
function applyPersonMaskToImageData(imageData, personMask, maskWidth, maskHeight) {
  const width = imageData.width;
  const height = imageData.height;
  const pixels = imageData.data;

  // If mask dimensions match, apply directly
  if (maskWidth === width && maskHeight === height) {
    for (let i = 0; i < personMask.length; i++) {
      if (personMask[i] === 0) {  // Person pixel
        pixels[i * 4 + 3] = 0;     // Make transparent
      }
    }
    return;
  }

  // Need to scale mask - create scaled version
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskWidth;
  maskCanvas.height = maskHeight;
  const maskCtx = maskCanvas.getContext('2d');

  // Draw mask to canvas (white = person)
  const maskImageData = maskCtx.createImageData(maskWidth, maskHeight);
  for (let i = 0; i < personMask.length; i++) {
    const isPerson = personMask[i] === 0;
    maskImageData.data[i * 4] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 1] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 2] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  // Scale mask to canvas size
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = width;
  scaledCanvas.height = height;
  const scaledCtx = scaledCanvas.getContext('2d');
  scaledCtx.drawImage(maskCanvas, 0, 0, width, height);
  const scaledMask = scaledCtx.getImageData(0, 0, width, height);

  // Apply scaled mask
  for (let i = 0; i < width * height; i++) {
    if (scaledMask.data[i * 4] > 128) {  // Person pixel
      pixels[i * 4 + 3] = 0;              // Make transparent
    }
  }
}

/**
 * Draw image into a quadrilateral region.
 * Simple approach: draw image stretched to bounding box, clipped to quad.
 * This doesn't have true perspective but tests basic rendering.
 */
function drawPerspectiveImage(ctx, source, corners, transform, _canvasWidth, _canvasHeight) {
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const { zoom = 1, panX = 0, panY = 0 } = transform;

  const srcWidth = source.naturalWidth || source.width;
  const srcHeight = source.naturalHeight || source.height;

  if (!srcWidth || !srcHeight) return;

  // Calculate source region based on zoom and pan
  const visibleWidth = srcWidth / zoom;
  const visibleHeight = srcHeight / zoom;
  const srcX = Math.max(0, Math.min(srcWidth - visibleWidth, (srcWidth - visibleWidth) / 2 + panX));
  const srcY = Math.max(0, Math.min(srcHeight - visibleHeight, (srcHeight - visibleHeight) / 2 + panY));

  // Use triangular mesh for perspective transformation
  // More subdivisions = smoother perspective approximation
  const gridSize = 8; // 8x8 grid of quads = good balance of quality vs performance

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Calculate UV coordinates for this cell
      const u0 = col / gridSize;
      const v0 = row / gridSize;
      const u1 = (col + 1) / gridSize;
      const v1 = (row + 1) / gridSize;

      // Get destination corners for this cell using bilinear interpolation
      const dstTL = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u0, v0);
      const dstTR = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u1, v0);
      const dstBL = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u0, v1);
      const dstBR = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u1, v1);

      // Calculate source coordinates (with zoom/pan applied)
      const sx0 = srcX + u0 * visibleWidth;
      const sy0 = srcY + v0 * visibleHeight;
      const sx1 = srcX + u1 * visibleWidth;
      const sy1 = srcY + v1 * visibleHeight;

      // Draw two triangles for this cell
      // Triangle 1: TL, TR, BL
      drawTexturedTriangle(ctx, source,
        sx0, sy0, sx1, sy0, sx0, sy1,
        dstTL, dstTR, dstBL
      );

      // Triangle 2: TR, BR, BL
      drawTexturedTriangle(ctx, source,
        sx1, sy0, sx1, sy1, sx0, sy1,
        dstTR, dstBR, dstBL
      );
    }
  }
}

/**
 * Bilinear interpolation for a point within a quadrilateral
 */
function bilinearPoint(tl, tr, bl, br, u, v) {
  const top = {
    x: tl.x + (tr.x - tl.x) * u,
    y: tl.y + (tr.y - tl.y) * u
  };
  const bottom = {
    x: bl.x + (br.x - bl.x) * u,
    y: bl.y + (br.y - bl.y) * u
  };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v
  };
}

/**
 * Draw a textured triangle using affine transform.
 * Maps source triangle to destination triangle using texture mapping.
 *
 * Source triangle: (sx0,sy0), (sx1,sy1), (sx2,sy2) - coordinates in source image
 * Dest triangle: p0, p1, p2 - coordinates on canvas
 */
function drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy1, sx2, sy2, p0, p1, p2) {
  // Skip degenerate triangles
  const destArea = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y));
  if (destArea < 1) return;

  ctx.save();

  // Clip to destination triangle
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();

  // We need to find a transform that maps source triangle to dest triangle.
  // The source image pixel at (sx, sy) should appear at canvas position that
  // corresponds to the same barycentric coordinates in the dest triangle.
  //
  // Using the standard texture mapping approach:
  // We compute transform T such that: T * [sx; sy; 1] = [dx; dy; 1]
  // for each corresponding pair of source/dest points.

  // Determinant of source triangle matrix
  const srcDet = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(srcDet) < 0.001) {
    ctx.restore();
    return;
  }

  // Compute the affine transform coefficients
  // Transform maps: (sx0,sy0)->p0, (sx1,sy1)->p1, (sx2,sy2)->p2
  //
  // The transform is: [dx]   [a c e] [sx]
  //                   [dy] = [b d f] [sy]
  //                   [1 ]   [0 0 1] [1 ]
  //
  // Solving the system of equations:
  const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y;
  const dx2 = p2.x - p0.x, dy2 = p2.y - p0.y;
  const dsx1 = sx1 - sx0, dsy1 = sy1 - sy0;
  const dsx2 = sx2 - sx0, dsy2 = sy2 - sy0;

  const invDet = 1 / srcDet;

  // Inverse of source triangle edge matrix
  const m11 = dsy2 * invDet, m12 = -dsx2 * invDet;
  const m21 = -dsy1 * invDet, m22 = dsx1 * invDet;

  // Transform coefficients
  const a = dx1 * m11 + dx2 * m21;
  const c = dx1 * m12 + dx2 * m22;
  const b = dy1 * m11 + dy2 * m21;
  const d = dy1 * m12 + dy2 * m22;
  const e = p0.x - a * sx0 - c * sy0;
  const f = p0.y - b * sx0 - d * sy0;

  // Apply the transform and draw
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(source, 0, 0);

  ctx.restore();
}



function applyPersonMask(ctx, mask, mWidth, mHeight) {

  const canvas = ctx.canvas;
  const cWidth = canvas.width;
  const cHeight = canvas.height;

  // If mask dimensions match canvas, work directly (faster)
  if (mWidth === cWidth && mHeight === cHeight) {
    const imageData = ctx.getImageData(0, 0, cWidth, cHeight);
    const pixels = imageData.data;

    // MediaPipe: 0 = person, 255 = background
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) {
        pixels[i * 4 + 3] = 0; // Person = transparent
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return;
  }

  // Need to scale mask - use canvas scaling for smooth interpolation
  // Step 1: Create mask canvas at original mask dimensions
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mWidth;
  maskCanvas.height = mHeight;
  const maskCtx = maskCanvas.getContext('2d');

  const maskImageData = maskCtx.createImageData(mWidth, mHeight);
  for (let i = 0; i < mask.length; i++) {
    // MediaPipe: 0 = person, 255 = background
    // We draw white (255) where person is, black (0) where background is
    const isPerson = mask[i] === 0;
    maskImageData.data[i * 4] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 1] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 2] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  // Step 2: Scale mask to canvas size using smooth interpolation
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = cWidth;
  scaledCanvas.height = cHeight;
  const scaledCtx = scaledCanvas.getContext('2d');
  scaledCtx.drawImage(maskCanvas, 0, 0, cWidth, cHeight);
  const scaledMask = scaledCtx.getImageData(0, 0, cWidth, cHeight);

  // Step 3: Apply scaled mask to artwork
  const imageData = ctx.getImageData(0, 0, cWidth, cHeight);
  const pixels = imageData.data;

  for (let i = 0; i < cWidth * cHeight; i++) {
    // Scaled mask: white (255) = person, make transparent
    if (scaledMask.data[i * 4] > 128) {
      pixels[i * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawRegionOverlay(region, isSelected) {
  const width = elements.canvas.width;
  const height = elements.canvas.height;

  const corners = {
    topLeft: { x: (region.region.topLeft.x / 100) * width, y: (region.region.topLeft.y / 100) * height },
    topRight: { x: (region.region.topRight.x / 100) * width, y: (region.region.topRight.y / 100) * height },
    bottomLeft: { x: (region.region.bottomLeft.x / 100) * width, y: (region.region.bottomLeft.y / 100) * height },
    bottomRight: { x: (region.region.bottomRight.x / 100) * width, y: (region.region.bottomRight.y / 100) * height }
  };

  // Draw outline - different style for trapezoid regions
  const isTrapezoid = region.type === REGION_TYPES.TRAPEZOID;
  ctx.strokeStyle = isSelected ? (isTrapezoid ? '#00d4ff' : '#e94560') : 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = isSelected ? 3 : 1;
  ctx.setLineDash(isSelected ? [] : [5, 5]);

  ctx.beginPath();
  ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
  ctx.lineTo(corners.topRight.x, corners.topRight.y);
  ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
  ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw vertical guide lines for trapezoid when being dragged
  if (isTrapezoid && isSelected && state.dragging && state.dragging.startsWith('corner-')) {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Left edge guide line (extends top to bottom of canvas)
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, 0);
    ctx.lineTo(corners.bottomLeft.x, height);
    ctx.stroke();

    // Right edge guide line
    ctx.beginPath();
    ctx.moveTo(corners.topRight.x, 0);
    ctx.lineTo(corners.bottomRight.x, height);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  // Draw pan indicator when actively panning (shift+drag)
  if (isSelected && state.dragging === 'pan-art') {
    const centerX = (corners.topLeft.x + corners.topRight.x + corners.bottomLeft.x + corners.bottomRight.x) / 4;
    const centerY = (corners.topLeft.y + corners.topRight.y + corners.bottomLeft.y + corners.bottomRight.y) / 4;

    // Semi-transparent overlay on region
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.closePath();
    ctx.fill();

    // Draw move icon (four-way arrow)
    const arrowSize = 25;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Up arrow
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - arrowSize);
    ctx.lineTo(centerX, centerY - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6, centerY - arrowSize + 8);
    ctx.lineTo(centerX, centerY - arrowSize);
    ctx.lineTo(centerX + 6, centerY - arrowSize + 8);
    ctx.stroke();

    // Down arrow
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + arrowSize);
    ctx.lineTo(centerX, centerY + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6, centerY + arrowSize - 8);
    ctx.lineTo(centerX, centerY + arrowSize);
    ctx.lineTo(centerX + 6, centerY + arrowSize - 8);
    ctx.stroke();

    // Left arrow
    ctx.beginPath();
    ctx.moveTo(centerX - arrowSize, centerY);
    ctx.lineTo(centerX - 5, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - arrowSize + 8, centerY - 6);
    ctx.lineTo(centerX - arrowSize, centerY);
    ctx.lineTo(centerX - arrowSize + 8, centerY + 6);
    ctx.stroke();

    // Right arrow
    ctx.beginPath();
    ctx.moveTo(centerX + arrowSize, centerY);
    ctx.lineTo(centerX + 5, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + arrowSize - 8, centerY - 6);
    ctx.lineTo(centerX + arrowSize, centerY);
    ctx.lineTo(centerX + arrowSize - 8, centerY + 6);
    ctx.stroke();

    // "PANNING" label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PANNING', centerX, centerY + arrowSize + 20);

    ctx.lineCap = 'butt';
  }

  // Draw corner handles and zoom controls if selected
  if (isSelected) {
    const handleRadius = 12;
    const cornerColors = {
      topLeft: '#f472b6',
      topRight: '#818cf8',
      bottomLeft: '#34d399',
      bottomRight: '#fbbf24'
    };

    for (const [name, corner] of Object.entries(corners)) {
      // White border
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, handleRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Colored center
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = cornerColors[name];
      ctx.fill();
    }

    // Draw controls in center of region
    const centerX = (corners.topLeft.x + corners.topRight.x + corners.bottomLeft.x + corners.bottomRight.x) / 4;
    const centerY = (corners.topLeft.y + corners.topRight.y + corners.bottomLeft.y + corners.bottomRight.y) / 4;

    // Draw control panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(centerX - 60, centerY - 40, 120, 80, 8);
    ctx.fill();

    // === ZOOM ROW (top) ===
    const zoomY = centerY - 22;

    // Minus button
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX - 35, zoomY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('−', centerX - 35, zoomY);

    // Zoom text
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${region.transform.zoom.toFixed(1)}x`, centerX, zoomY);

    // Plus button
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX + 35, zoomY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('+', centerX + 35, zoomY);

    // === PAN ROW (bottom) - arrow buttons ===
    const panY = centerY + 18;

    // Left arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX - 35, panY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX - 35 + 4, panY - 5);
    ctx.lineTo(centerX - 35 - 4, panY);
    ctx.lineTo(centerX - 35 + 4, panY + 5);
    ctx.closePath();
    ctx.fill();

    // Pan label
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText('PAN', centerX, panY);

    // Right arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX + 35, panY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX + 35 - 4, panY - 5);
    ctx.lineTo(centerX + 35 + 4, panY);
    ctx.lineTo(centerX + 35 - 4, panY + 5);
    ctx.closePath();
    ctx.fill();

    // Up arrow (above PAN label)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX, panY - 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX - 4, panY - 15 + 3);
    ctx.lineTo(centerX, panY - 15 - 4);
    ctx.lineTo(centerX + 4, panY - 15 + 3);
    ctx.closePath();
    ctx.fill();

    // Down arrow (below PAN label)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX, panY + 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(centerX - 4, panY + 15 - 3);
    ctx.lineTo(centerX, panY + 15 + 4);
    ctx.lineTo(centerX + 4, panY + 15 - 3);
    ctx.closePath();
    ctx.fill();

    // Draw instruction text at top
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const topCenterX = (corners.topLeft.x + corners.topRight.x) / 2;
    const topCenterY = (corners.topLeft.y + corners.topRight.y) / 2 - 20;
    ctx.fillText('Drag region | Use arrows to pan art', topCenterX, topCenterY);

    // Draw play/pause button for animated GIFs
    if (region.art?.isAnimated) {
      const source = state.artSources.get(region.id);
      if (source?.isAnimated) {
        const playPauseX = centerX + 55;
        const playPauseY = centerY - 22;
        const isPlaying = source.playing;

        // Button background
        ctx.beginPath();
        ctx.arc(playPauseX, playPauseY, 12, 0, Math.PI * 2);
        ctx.fillStyle = isPlaying ? '#4ade80' : '#fbbf24';
        ctx.fill();

        // Draw play or pause icon
        ctx.fillStyle = '#000';
        if (isPlaying) {
          // Pause icon (two bars)
          ctx.fillRect(playPauseX - 4, playPauseY - 5, 3, 10);
          ctx.fillRect(playPauseX + 1, playPauseY - 5, 3, 10);
        } else {
          // Play icon (triangle)
          ctx.beginPath();
          ctx.moveTo(playPauseX - 3, playPauseY - 5);
          ctx.lineTo(playPauseX - 3, playPauseY + 5);
          ctx.lineTo(playPauseX + 5, playPauseY);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw mini-map when zoomed/panned (shows viewport position)
    const hasTransform = region.transform.zoom > 1 || region.transform.panX !== 0 || region.transform.panY !== 0;
    const source = state.artSources.get(region.id);

    if (hasTransform && source && region.art) {
      // Mini-map position (bottom-right of region)
      const mapWidth = 60;
      const mapHeight = 45;
      const mapX = corners.bottomRight.x - mapWidth - 10;
      const mapY = corners.bottomRight.y - mapHeight - 10;

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.beginPath();
      ctx.roundRect(mapX - 4, mapY - 4, mapWidth + 8, mapHeight + 8, 6);
      ctx.fill();

      // Draw art thumbnail
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapWidth, mapHeight, 4);
      ctx.clip();

      // Get the drawable source (handles GIF current frame)
      const drawSource = source.isAnimated ? source.currentFrame : source;
      if (drawSource && drawSource.width) {
        ctx.drawImage(drawSource, mapX, mapY, mapWidth, mapHeight);
      } else if (region.art.contentType === 'color') {
        // For color fills, draw the color
        ctx.fillStyle = region.art.src.includes('gradient') ? '#888' : region.art.src;
        ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
      }
      ctx.restore();

      // Calculate viewport rectangle based on zoom/pan
      const zoom = region.transform.zoom;
      const viewWidth = mapWidth / zoom;
      const viewHeight = mapHeight / zoom;

      // Pan offsets normalized to mini-map scale
      // Pan is in pixels relative to art, convert to mini-map coordinates
      const artWidth = drawSource?.width || 640;
      const artHeight = drawSource?.height || 480;
      const panOffsetX = (region.transform.panX / artWidth) * mapWidth;
      const panOffsetY = (region.transform.panY / artHeight) * mapHeight;

      // Center of visible area
      const viewX = mapX + (mapWidth - viewWidth) / 2 + panOffsetX;
      const viewY = mapY + (mapHeight - viewHeight) / 2 + panOffsetY;

      // Draw viewport rectangle
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.rect(
        Math.max(mapX, Math.min(mapX + mapWidth - viewWidth, viewX)),
        Math.max(mapY, Math.min(mapY + mapHeight - viewHeight, viewY)),
        viewWidth,
        viewHeight
      );
      ctx.stroke();

      // Draw border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapWidth, mapHeight, 4);
      ctx.stroke();
    }
  }
}

// ============================================
// Type Selector
// ============================================
function toggleTypeSelector() {
  elements.typeSelector.classList.toggle('hidden');
}

function hideTypeSelector() {
  elements.typeSelector.classList.add('hidden');
}

// ============================================
// Input Handling
// ============================================
function setupEventListeners() {
  // Add region buttons - show type selector
  elements.addRegionBtn.addEventListener('click', toggleTypeSelector);
  elements.sidebarAddBtn.addEventListener('click', toggleTypeSelector);

  // Type selector options
  elements.typeSelector.querySelectorAll('.type-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      hideTypeSelector();
      createRegion(type);
    });
  });

  // Close type selector when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.typeSelector.classList.contains('hidden') &&
        !elements.typeSelector.contains(e.target) &&
        !elements.addRegionBtn.contains(e.target) &&
        !elements.sidebarAddBtn.contains(e.target)) {
      hideTypeSelector();
    }
  });

  // Toggle segmentation
  elements.toggleSegmentation.addEventListener('click', () => {
    state.segmentationEnabled = !state.segmentationEnabled;
    updateSegmentationStatus(state.segmentationEnabled && state.segmentationReady ? 'active' : 'disabled');
  });

  // Toggle renderer
  elements.toggleRenderer.addEventListener('click', cycleRendererMode);
  updateRendererStatus();

  // Reset button - clears localStorage and reloads
  elements.resetBtn.addEventListener('click', () => {
    if (confirm('Reset to welcome screen? This will clear all regions.')) {
      localStorage.removeItem(WELCOME_SHOWN_KEY);
      localStorage.removeItem('multiRegionArt');
      location.reload();
    }
  });

  // Canvas mouse handlers
  const canvas = elements.canvas;

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);
  canvas.addEventListener('dblclick', handleDoubleClick);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const selected = getSelectedRegion();

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected && document.activeElement === document.body) {
        e.preventDefault();
        deleteRegion(selected.id);
      }
    } else if (e.key === 'Escape') {
      selectRegion(null);
      closeArtPicker();
    } else if (e.key === '+' || e.key === '=') {
      if (selected) {
        animateZoomTo(selected.id, selected.transform.zoom + 0.1);
        saveToStorage();
      }
    } else if (e.key === '-' || e.key === '_') {
      if (selected) {
        animateZoomTo(selected.id, selected.transform.zoom - 0.1);
        saveToStorage();
      }
    }
  });

  // Art picker modal
  elements.closeModal.addEventListener('click', closeArtPicker);
  elements.cancelArt.addEventListener('click', closeArtPicker);
  elements.applyArt.addEventListener('click', applySelectedArt);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

      // If switching to color tab, update selection
      if (tab.dataset.tab === 'color') {
        updateColorSelection();
      }
    });
  });

  // Upload drop zone
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
  });
  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
  });
  elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    }
  });

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  });

  elements.clearPreview.addEventListener('click', () => {
    artPickerState.uploadedImage = null;
    artPickerState.selectedSource = null;
    elements.uploadPreview.classList.add('hidden');
    updateApplyButton();
  });

  // Gallery
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery(btn.dataset.category);
    });
  });
  renderGallery('all');

  // URL input
  elements.loadUrl.addEventListener('click', loadImageFromUrl);
  elements.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadImageFromUrl();
  });

  // Color picker
  setupColorPicker();
}

function handleMouseDown(e) {
  const point = getCanvasPoint(e);
  const pixelPoint = getCanvasPixelPoint(e);
  const selected = getSelectedRegion();

  // Check if clicking on control buttons (zoom/pan) for selected region
  if (selected) {
    const action = checkControlButtonClick(pixelPoint, selected);
    if (action) {
      const panStep = 30; // Pixels to pan per click

      if (action === 'zoom-in') {
        animateZoomTo(selected.id, selected.transform.zoom + 0.2);
      } else if (action === 'zoom-out') {
        animateZoomTo(selected.id, selected.transform.zoom - 0.2);
      } else if (action === 'pan-left') {
        animatePanTo(selected.id, selected.transform.panX - panStep, null);
      } else if (action === 'pan-right') {
        animatePanTo(selected.id, selected.transform.panX + panStep, null);
      } else if (action === 'pan-up') {
        animatePanTo(selected.id, null, selected.transform.panY - panStep);
      } else if (action === 'pan-down') {
        animatePanTo(selected.id, null, selected.transform.panY + panStep);
      } else if (action === 'toggle-gif') {
        toggleGifPlayback(selected.id);
        return; // Don't need to save transform
      }
      updateRegionList();
      saveToStorage();
      return;
    }

    // Check corners first (highest priority)
    const corner = findCornerAtPoint(point, selected);
    if (corner) {
      state.dragging = `corner-${corner}`;
      state.dragStartPoint = point;
      elements.canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
  }

  // Check if clicking inside any region
  for (let i = state.regions.length - 1; i >= 0; i--) {
    const region = state.regions[i];
    if (isPointInRegion(point, region)) {
      selectRegion(region.id);

      if (e.shiftKey) {
        // Shift+drag = pan art inside region
        state.dragging = 'pan-art';
        state.dragStartPoint = point;
        state.dragStartRegion = {
          panX: region.transform.panX,
          panY: region.transform.panY
        };
        elements.canvas.style.cursor = 'move';
      } else {
        // Regular drag = move entire region
        state.dragging = 'move-region';
        state.dragStartPoint = point;
        state.dragStartRegion = JSON.parse(JSON.stringify(region.region));
        elements.canvas.style.cursor = 'move';
      }
      e.preventDefault();
      return;
    }
  }

  // Clicked outside all regions
  selectRegion(null);
}

function handleMouseMove(e) {
  const point = getCanvasPoint(e);
  const selected = getSelectedRegion();

  if (!state.dragging) {
    updateCursor(point, e.shiftKey);
    return;
  }

  if (!selected) return;

  if (state.dragging.startsWith('corner-')) {
    const cornerName = state.dragging.replace('corner-', '');
    moveCorner(selected, cornerName, point);
  } else if (state.dragging === 'move-region' && state.dragStartRegion) {
    // Move entire region
    const dx = point.x - state.dragStartPoint.x;
    const dy = point.y - state.dragStartPoint.y;

    selected.region.topLeft.x = clamp(state.dragStartRegion.topLeft.x + dx, 0, 100);
    selected.region.topLeft.y = clamp(state.dragStartRegion.topLeft.y + dy, 0, 100);
    selected.region.topRight.x = clamp(state.dragStartRegion.topRight.x + dx, 0, 100);
    selected.region.topRight.y = clamp(state.dragStartRegion.topRight.y + dy, 0, 100);
    selected.region.bottomLeft.x = clamp(state.dragStartRegion.bottomLeft.x + dx, 0, 100);
    selected.region.bottomLeft.y = clamp(state.dragStartRegion.bottomLeft.y + dy, 0, 100);
    selected.region.bottomRight.x = clamp(state.dragStartRegion.bottomRight.x + dx, 0, 100);
    selected.region.bottomRight.y = clamp(state.dragStartRegion.bottomRight.y + dy, 0, 100);
  } else if (state.dragging === 'pan-art' && state.dragStartRegion) {
    // Pan art inside region
    const dx = point.x - state.dragStartPoint.x;
    const dy = point.y - state.dragStartPoint.y;

    // Scale pan amount by zoom level and canvas size
    const panScale = 5;
    selected.transform.panX = state.dragStartRegion.panX - dx * panScale;
    selected.transform.panY = state.dragStartRegion.panY - dy * panScale;
    updateInfoPanel();
  }
}

function handleMouseUp() {
  if (state.dragging) {
    // Finalize corner animation - snap to target positions
    const anim = state.cornerAnimation;
    if (anim.active && anim.targetCorners) {
      const region = state.regions.find(r => r.id === anim.regionId);
      if (region) {
        // Snap to exact target positions
        for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
          if (anim.targetCorners[key]) {
            region.region[key].x = anim.targetCorners[key].x;
            region.region[key].y = anim.targetCorners[key].y;
          }
        }
      }
      // Reset animation state
      anim.active = false;
      anim.regionId = null;
      anim.targetCorners = null;
    }

    state.dragging = null;
    state.dragStartPoint = null;
    state.dragStartRegion = null;
    elements.canvas.style.cursor = 'default';
    saveToStorage();
  }
}

function handleDoubleClick(e) {
  const point = getCanvasPoint(e);
  const selected = getSelectedRegion();

  if (selected && isPointInRegion(point, selected)) {
    // Check if not on a corner
    const corner = findCornerAtPoint(point, selected);
    if (!corner) {
      // Animate reset zoom/pan to defaults
      const anim = state.transformAnimation;
      anim.active = true;
      anim.regionId = selected.id;
      anim.targetZoom = 1.0;
      anim.targetPanX = 0;
      anim.targetPanY = 0;
      updateRegionList();
      saveToStorage();
    }
  }
}

function handleWheel(e) {
  const point = getCanvasPoint(e);
  const selected = getSelectedRegion();

  if (selected && isPointInRegion(point, selected)) {
    e.preventDefault();

    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    animateZoomTo(selected.id, selected.transform.zoom + zoomDelta);
    updateRegionList();
    saveToStorage();
  }
}

function checkControlButtonClick(pixelPoint, region) {
  const width = elements.canvas.width;
  const height = elements.canvas.height;

  const corners = {
    topLeft: { x: (region.region.topLeft.x / 100) * width, y: (region.region.topLeft.y / 100) * height },
    topRight: { x: (region.region.topRight.x / 100) * width, y: (region.region.topRight.y / 100) * height },
    bottomLeft: { x: (region.region.bottomLeft.x / 100) * width, y: (region.region.bottomLeft.y / 100) * height },
    bottomRight: { x: (region.region.bottomRight.x / 100) * width, y: (region.region.bottomRight.y / 100) * height }
  };

  const centerX = (corners.topLeft.x + corners.topRight.x + corners.bottomLeft.x + corners.bottomRight.x) / 4;
  const centerY = (corners.topLeft.y + corners.topRight.y + corners.bottomLeft.y + corners.bottomRight.y) / 4;

  const buttonRadius = 15;
  const smallRadius = 12;

  // Zoom buttons (top row)
  const zoomY = centerY - 22;
  const distToZoomMinus = Math.sqrt(Math.pow(pixelPoint.x - (centerX - 35), 2) + Math.pow(pixelPoint.y - zoomY, 2));
  const distToZoomPlus = Math.sqrt(Math.pow(pixelPoint.x - (centerX + 35), 2) + Math.pow(pixelPoint.y - zoomY, 2));

  if (distToZoomMinus < buttonRadius) return 'zoom-out';
  if (distToZoomPlus < buttonRadius) return 'zoom-in';

  // Pan buttons (bottom section)
  const panY = centerY + 18;
  const distToPanLeft = Math.sqrt(Math.pow(pixelPoint.x - (centerX - 35), 2) + Math.pow(pixelPoint.y - panY, 2));
  const distToPanRight = Math.sqrt(Math.pow(pixelPoint.x - (centerX + 35), 2) + Math.pow(pixelPoint.y - panY, 2));
  const distToPanUp = Math.sqrt(Math.pow(pixelPoint.x - centerX, 2) + Math.pow(pixelPoint.y - (panY - 15), 2));
  const distToPanDown = Math.sqrt(Math.pow(pixelPoint.x - centerX, 2) + Math.pow(pixelPoint.y - (panY + 15), 2));

  if (distToPanLeft < buttonRadius) return 'pan-left';
  if (distToPanRight < buttonRadius) return 'pan-right';
  if (distToPanUp < smallRadius) return 'pan-up';
  if (distToPanDown < smallRadius) return 'pan-down';

  // Check play/pause button for GIFs
  if (region.art?.isAnimated) {
    const playPauseX = centerX + 55;
    const playPauseY = centerY - 22;
    const distToPlayPause = Math.sqrt(
      Math.pow(pixelPoint.x - playPauseX, 2) + Math.pow(pixelPoint.y - playPauseY, 2)
    );
    if (distToPlayPause < buttonRadius) return 'toggle-gif';
  }

  return null;
}

function getCanvasPoint(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  return {
    x: ((e.clientX - rect.left) * scaleX / elements.canvas.width) * 100,
    y: ((e.clientY - rect.top) * scaleY / elements.canvas.height) * 100
  };
}

function getCanvasPixelPoint(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function findCornerAtPoint(point, region) {
  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
  const threshold = 4;

  for (const corner of corners) {
    const cx = region.region[corner].x;
    const cy = region.region[corner].y;
    const dist = Math.sqrt(Math.pow(point.x - cx, 2) + Math.pow(point.y - cy, 2));
    if (dist <= threshold) {
      return corner;
    }
  }
  return null;
}

function isPointInRegion(point, region) {
  const polygon = [
    region.region.topLeft,
    region.region.topRight,
    region.region.bottomRight,
    region.region.bottomLeft
  ];

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

function moveCorner(region, cornerName, newPosition) {
  const newX = clamp(newPosition.x, 0, 100);
  const newY = clamp(newPosition.y, 0, 100);

  // Initialize animation state if not active
  const anim = state.cornerAnimation;
  if (!anim.active || anim.regionId !== region.id) {
    anim.active = true;
    anim.regionId = region.id;
    anim.targetCorners = JSON.parse(JSON.stringify(region.region));
  }

  if (region.type === REGION_TYPES.TRAPEZOID) {
    // Trapezoid mode: keep top and bottom edges horizontal
    moveTrapezoidCornerAnimated(anim.targetCorners, cornerName, newX, newY);
  } else {
    // Free mode: corner moves independently
    anim.targetCorners[cornerName] = { x: newX, y: newY };
  }
}

/**
 * Move trapezoid corner in animation target (not directly on region)
 * Vertical edges mode: left and right edges stay vertical (parallel)
 * - topLeft.x === bottomLeft.x (left edge is vertical)
 * - topRight.x === bottomRight.x (right edge is vertical)
 * - Top/bottom edges can be angled but stay parallel to each other
 */
function moveTrapezoidCornerAnimated(corners, cornerName, newX, newY) {
  const minWidth = 10;
  const minHeight = 10;

  // Update the dragged corner's Y position (always independent)
  corners[cornerName].y = newY;

  // Apply X constraint based on which vertical edge the corner belongs to
  if (cornerName === 'topLeft' || cornerName === 'bottomLeft') {
    // Left edge - both corners share the same X
    // Ensure left edge doesn't cross right edge
    const maxX = Math.min(corners.topRight.x, corners.bottomRight.x) - minWidth;
    const constrainedX = clamp(newX, 0, maxX);
    corners.topLeft.x = constrainedX;
    corners.bottomLeft.x = constrainedX;
  } else {
    // Right edge - both corners share the same X
    // Ensure right edge doesn't cross left edge
    const minX = Math.max(corners.topLeft.x, corners.bottomLeft.x) + minWidth;
    const constrainedX = clamp(newX, minX, 100);
    corners.topRight.x = constrainedX;
    corners.bottomRight.x = constrainedX;
  }

  // Validate minimum height on both sides
  if (corners.bottomLeft.y - corners.topLeft.y < minHeight) {
    const midY = (corners.topLeft.y + corners.bottomLeft.y) / 2;
    corners.topLeft.y = midY - minHeight / 2;
    corners.bottomLeft.y = midY + minHeight / 2;
  }
  if (corners.bottomRight.y - corners.topRight.y < minHeight) {
    const midY = (corners.topRight.y + corners.bottomRight.y) / 2;
    corners.topRight.y = midY - minHeight / 2;
    corners.bottomRight.y = midY + minHeight / 2;
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation between two values
 */
function lerp(start, end, t) {
  return start + (end - start) * t;
}

/**
 * Lerp a corner position
 */
function lerpCorner(current, target, t) {
  return {
    x: lerp(current.x, target.x, t),
    y: lerp(current.y, target.y, t)
  };
}

/**
 * Check if two corners are approximately equal
 */
function cornersApproxEqual(a, b, threshold = 0.01) {
  return Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;
}

/**
 * Update corner animations (called in render loop)
 */
function updateCornerAnimations() {
  const anim = state.cornerAnimation;
  if (!anim.active || !anim.regionId || !anim.targetCorners) return;

  const region = state.regions.find(r => r.id === anim.regionId);
  if (!region) {
    anim.active = false;
    return;
  }

  const t = anim.lerpFactor;
  let allDone = true;

  // Lerp each corner toward target
  for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
    const current = region.region[key];
    const target = anim.targetCorners[key];

    if (!cornersApproxEqual(current, target)) {
      region.region[key] = lerpCorner(current, target, t);
      allDone = false;
    } else {
      // Snap to exact target when close enough
      region.region[key] = { ...target };
    }
  }

  // Stop animation when all corners reached target
  if (allDone) {
    anim.active = false;
  }
}

/**
 * Update zoom/pan animations (called in render loop)
 */
function updateTransformAnimations() {
  const anim = state.transformAnimation;
  if (!anim.active || !anim.regionId) return;

  const region = state.regions.find(r => r.id === anim.regionId);
  if (!region) {
    anim.active = false;
    return;
  }

  const t = anim.lerpFactor;
  let allDone = true;
  const threshold = 0.001; // Snap threshold

  // Lerp zoom toward target
  if (anim.targetZoom !== null) {
    const diff = Math.abs(region.transform.zoom - anim.targetZoom);
    if (diff > threshold) {
      region.transform.zoom = lerp(region.transform.zoom, anim.targetZoom, t);
      allDone = false;
    } else {
      region.transform.zoom = anim.targetZoom;
    }
  }

  // Lerp panX toward target
  if (anim.targetPanX !== null) {
    const diff = Math.abs(region.transform.panX - anim.targetPanX);
    if (diff > threshold) {
      region.transform.panX = lerp(region.transform.panX, anim.targetPanX, t);
      allDone = false;
    } else {
      region.transform.panX = anim.targetPanX;
    }
  }

  // Lerp panY toward target
  if (anim.targetPanY !== null) {
    const diff = Math.abs(region.transform.panY - anim.targetPanY);
    if (diff > threshold) {
      region.transform.panY = lerp(region.transform.panY, anim.targetPanY, t);
      allDone = false;
    } else {
      region.transform.panY = anim.targetPanY;
    }
  }

  // Update info panel as values change
  updateInfoPanel();

  // Stop animation when all values reached target
  if (allDone) {
    anim.active = false;
    anim.targetZoom = null;
    anim.targetPanX = null;
    anim.targetPanY = null;
  }
}

/**
 * Set target zoom with animation
 */
function animateZoomTo(regionId, targetZoom) {
  const anim = state.transformAnimation;
  anim.active = true;
  anim.regionId = regionId;
  anim.targetZoom = Math.max(0.25, Math.min(4, targetZoom));
}

/**
 * Set target pan with animation
 */
function animatePanTo(regionId, targetPanX, targetPanY) {
  const anim = state.transformAnimation;
  anim.active = true;
  anim.regionId = regionId;
  if (targetPanX !== null) anim.targetPanX = targetPanX;
  if (targetPanY !== null) anim.targetPanY = targetPanY;
}

function updateCursor(point, shiftKey) {
  const canvas = elements.canvas;
  const selected = getSelectedRegion();

  if (selected) {
    const corner = findCornerAtPoint(point, selected);
    if (corner) {
      canvas.style.cursor = 'grab';
      return;
    }
  }

  for (let i = state.regions.length - 1; i >= 0; i--) {
    if (isPointInRegion(point, state.regions[i])) {
      canvas.style.cursor = shiftKey ? 'move' : 'grab';
      return;
    }
  }

  canvas.style.cursor = 'default';
}

// ============================================
// UI Updates
// ============================================
function updateRegionList() {
  if (state.regions.length === 0) {
    elements.regionList.innerHTML = '<div class="empty-state">Click + to add your first region</div>';
    return;
  }

  elements.regionList.innerHTML = state.regions.map(region => {
    const isSelected = region.id === state.selectedRegionId;
    const hasArt = region.art && region.art.src;
    const isTrapezoid = region.type === REGION_TYPES.TRAPEZOID;
    const typeIcon = isTrapezoid ? '▱' : '◇';
    const typeClass = isTrapezoid ? 'trapezoid' : 'free';

    // Check if this is an animated GIF
    const isAnimatedGif = region.art?.isAnimated;
    const source = state.artSources.get(region.id);
    const isPlaying = source?.playing ?? true;

    return `
      <div class="region-item ${isSelected ? 'selected' : ''} type-${typeClass}" data-id="${region.id}">
        <div class="region-item-header">
          <div class="region-thumbnail">
            ${hasArt ? `<img src="${region.art.src}" alt="${region.art.name}">` : '<span class="placeholder">?</span>'}
            ${isAnimatedGif ? '<span class="gif-badge">GIF</span>' : ''}
          </div>
          <div class="region-info">
            <div class="region-name">
              <span class="region-type-icon" title="${isTrapezoid ? 'Wall Frame' : 'Free Form'}">${typeIcon}</span>
              ${region.name}
            </div>
            <div class="region-meta">${hasArt ? region.art.name : 'No art assigned'}</div>
          </div>
          <div class="region-actions">
            ${isAnimatedGif ? `<button class="region-action-btn gif-toggle ${isPlaying ? 'playing' : 'paused'}" title="${isPlaying ? 'Pause' : 'Play'}" data-id="${region.id}">${isPlaying ? '⏸' : '▶'}</button>` : ''}
            <button class="region-action-btn change-art" title="Change art" data-id="${region.id}">🖼</button>
            <button class="region-action-btn delete" title="Delete" data-id="${region.id}">🗑</button>
          </div>
        </div>
        <div class="region-controls">
          <div class="zoom-control">
            <button class="zoom-btn minus" data-id="${region.id}">−</button>
            <span class="zoom-value">${region.transform.zoom.toFixed(1)}x</span>
            <button class="zoom-btn plus" data-id="${region.id}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  elements.regionList.querySelectorAll('.region-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.region-action-btn') && !e.target.closest('.zoom-btn')) {
        selectRegion(item.dataset.id);
      }
    });
  });

  elements.regionList.querySelectorAll('.change-art').forEach(btn => {
    btn.addEventListener('click', () => openArtPicker(btn.dataset.id));
  });

  elements.regionList.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRegion(btn.dataset.id));
  });

  elements.regionList.querySelectorAll('.gif-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGifPlayback(btn.dataset.id);
    });
  });

  elements.regionList.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const region = state.regions.find(r => r.id === btn.dataset.id);
      if (region) {
        const delta = btn.classList.contains('plus') ? 0.2 : -0.2;
        animateZoomTo(region.id, region.transform.zoom + delta);
        updateRegionList();
        saveToStorage();
      }
      e.stopPropagation();
    });
  });
}

function updateInfoPanel() {
  const selected = getSelectedRegion();

  if (selected) {
    const typeLabel = selected.type === REGION_TYPES.TRAPEZOID ? 'Wall Frame' : 'Free';
    elements.infoSelected.textContent = `${selected.name} (${typeLabel})`;
    elements.infoZoom.textContent = `${selected.transform.zoom.toFixed(2)}x`;
    elements.infoPan.textContent = `(${Math.round(selected.transform.panX)}, ${Math.round(selected.transform.panY)})`;
  } else {
    elements.infoSelected.textContent = 'None';
    elements.infoZoom.textContent = '-';
    elements.infoPan.textContent = '-';
  }
}

// ============================================
// Art Picker
// ============================================
function openArtPicker(regionId) {
  artPickerState.targetRegionId = regionId;
  artPickerState.selectedSource = null;
  artPickerState.uploadedImage = null;

  elements.uploadPreview.classList.add('hidden');
  elements.urlPreview.classList.add('hidden');
  elements.urlError.classList.add('hidden');
  elements.urlInput.value = '';
  elements.fileInput.value = '';

  elements.galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.remove('selected');
  });

  updateApplyButton();
  elements.artPickerModal.classList.remove('hidden');
}

function closeArtPicker() {
  elements.artPickerModal.classList.add('hidden');
  artPickerState.targetRegionId = null;
}

function updateApplyButton() {
  elements.applyArt.disabled = !artPickerState.selectedSource;
}

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    elements.previewImage.src = dataUrl;
    elements.uploadPreview.classList.remove('hidden');

    artPickerState.selectedSource = {
      type: 'upload',
      src: dataUrl,
      name: file.name
    };
    updateApplyButton();
  };
  reader.readAsDataURL(file);
}

function renderGallery(category) {
  const filtered = category === 'all'
    ? GALLERY_IMAGES
    : GALLERY_IMAGES.filter(img => img.category === category);

  elements.galleryGrid.innerHTML = filtered.map(img => {
    if (img.isGif) {
      // GIF item with image thumbnail and badge
      return `
        <div class="gallery-item gallery-gif" data-id="${img.id}" data-name="${img.name}" data-src="${img.src}" data-type="gif">
          <img src="${img.src}" alt="${img.name}" loading="lazy">
          <span class="gallery-gif-badge">GIF</span>
        </div>
      `;
    } else if (img.src) {
      // Image-based item (curated artwork)
      return `
        <div class="gallery-item" data-id="${img.id}" data-name="${img.name}" data-src="${img.src}" data-type="image">
          <img src="${img.src}" alt="${img.name}" loading="lazy">
        </div>
      `;
    } else {
      // Color-based item (fallback)
      return `
        <div class="gallery-item" data-id="${img.id}" data-name="${img.name}" data-type="color" style="background: ${img.color};">
        </div>
      `;
    }
  }).join('');

  elements.galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      elements.galleryGrid.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');

      const itemType = item.dataset.type;

      if (itemType === 'gif' || itemType === 'image') {
        // Image or GIF selected - use the src directly
        artPickerState.selectedSource = {
          type: 'gallery',
          src: item.dataset.src,
          name: item.dataset.name
        };
      } else {
        // Color selected - generate canvas
        const canvas = generatePatternCanvas(item.style.background, 400, 300);
        artPickerState.selectedSource = {
          type: 'gallery',
          src: canvas.toDataURL(),
          name: item.dataset.name
        };
      }
      updateApplyButton();
    });
  });
}

function generatePatternCanvas(background, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (background.includes('gradient')) {
    const matches = background.match(/#[0-9a-fA-F]{6}/g);
    if (matches && matches.length >= 2) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, matches[0]);
      gradient.addColorStop(1, matches[1]);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = '#4a5568';
    }
  } else {
    ctx.fillStyle = background;
  }

  ctx.fillRect(0, 0, width, height);
  return canvas;
}

// ============================================
// Color Picker
// ============================================

const RECENT_COLORS_KEY = 'multiRegionRecentColors';
const MAX_RECENT_COLORS = 12;

// Color picker state
const colorPickerState = {
  isGradient: false,
  solidColor: '#4a90d9',
  gradientStart: '#4a90d9',
  gradientEnd: '#9b59b6',
  gradientDirection: 'to bottom'
};

function setupColorPicker() {
  // Solid color picker
  elements.colorPicker.addEventListener('input', (e) => {
    colorPickerState.solidColor = e.target.value;
    elements.colorHex.value = e.target.value;
    updateColorPreview();
    updateColorSelection();
  });

  // Hex input
  elements.colorHex.addEventListener('input', (e) => {
    let value = e.target.value;
    if (!value.startsWith('#')) value = '#' + value;
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      colorPickerState.solidColor = value;
      elements.colorPicker.value = value;
      updateColorPreview();
      updateColorSelection();
    }
  });

  // Gradient toggle
  elements.gradientToggle.addEventListener('change', (e) => {
    colorPickerState.isGradient = e.target.checked;
    elements.gradientControls.classList.toggle('hidden', !e.target.checked);
    updateColorPreview();
    updateColorSelection();
  });

  // Gradient start color
  elements.gradientStart.addEventListener('input', (e) => {
    colorPickerState.gradientStart = e.target.value;
    updateColorPreview();
    updateColorSelection();
  });

  // Gradient end color
  elements.gradientEnd.addEventListener('input', (e) => {
    colorPickerState.gradientEnd = e.target.value;
    updateColorPreview();
    updateColorSelection();
  });

  // Gradient direction
  elements.gradientDirection.addEventListener('change', (e) => {
    colorPickerState.gradientDirection = e.target.value;
    updateColorPreview();
    updateColorSelection();
  });

  // Load recent colors
  renderRecentColors();

  // Initial preview
  updateColorPreview();
}

function updateColorPreview() {
  if (colorPickerState.isGradient) {
    elements.colorPreview.style.background = `linear-gradient(${colorPickerState.gradientDirection}, ${colorPickerState.gradientStart}, ${colorPickerState.gradientEnd})`;
  } else {
    elements.colorPreview.style.background = colorPickerState.solidColor;
  }
}

function updateColorSelection() {
  // Update art picker state when color tab is active
  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.dataset.tab === 'color') {
    const colorCanvas = generateColorCanvas();
    const colorName = colorPickerState.isGradient
      ? `Gradient (${colorPickerState.gradientStart} → ${colorPickerState.gradientEnd})`
      : colorPickerState.solidColor;

    artPickerState.selectedSource = {
      type: 'color',
      src: colorCanvas.toDataURL(),
      name: colorName,
      colorData: { ...colorPickerState }
    };
    updateApplyButton();
  }
}

/**
 * Generate a canvas filled with the selected color/gradient
 */
function generateColorCanvas(width = 512, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (colorPickerState.isGradient) {
    // Create gradient based on direction
    let gradient;
    switch (colorPickerState.gradientDirection) {
      case 'to bottom':
        gradient = ctx.createLinearGradient(0, 0, 0, height);
        break;
      case 'to right':
        gradient = ctx.createLinearGradient(0, 0, width, 0);
        break;
      case 'to bottom right':
        gradient = ctx.createLinearGradient(0, 0, width, height);
        break;
      case 'to top right':
        gradient = ctx.createLinearGradient(0, height, width, 0);
        break;
      default:
        gradient = ctx.createLinearGradient(0, 0, 0, height);
    }
    gradient.addColorStop(0, colorPickerState.gradientStart);
    gradient.addColorStop(1, colorPickerState.gradientEnd);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = colorPickerState.solidColor;
  }

  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * Load recent colors from storage
 */
function loadRecentColors() {
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save a color to recent colors
 */
function saveRecentColor(colorData) {
  const recent = loadRecentColors();

  // Create a unique key for this color
  const key = colorData.isGradient
    ? `gradient:${colorData.gradientStart}:${colorData.gradientEnd}:${colorData.gradientDirection}`
    : `solid:${colorData.solidColor}`;

  // Remove if already exists
  const index = recent.findIndex(c => {
    const cKey = c.isGradient
      ? `gradient:${c.gradientStart}:${c.gradientEnd}:${c.gradientDirection}`
      : `solid:${c.solidColor}`;
    return cKey === key;
  });
  if (index > -1) recent.splice(index, 1);

  // Add to front
  recent.unshift({ ...colorData });

  // Limit size
  if (recent.length > MAX_RECENT_COLORS) recent.pop();

  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent));
}

/**
 * Render recent colors grid
 */
function renderRecentColors() {
  const colors = loadRecentColors();

  if (colors.length === 0) {
    elements.recentColors.innerHTML = '<span class="recent-colors-empty">No recent colors</span>';
    return;
  }

  elements.recentColors.innerHTML = colors.map((color, index) => {
    const bg = color.isGradient
      ? `linear-gradient(${color.gradientDirection}, ${color.gradientStart}, ${color.gradientEnd})`
      : color.solidColor;
    const title = color.isGradient
      ? `Gradient: ${color.gradientStart} → ${color.gradientEnd}`
      : color.solidColor;

    return `<button class="recent-color-btn" data-index="${index}" style="background: ${bg}" title="${title}"></button>`;
  }).join('');

  // Add click handlers
  elements.recentColors.querySelectorAll('.recent-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const colors = loadRecentColors();
      const color = colors[parseInt(btn.dataset.index)];
      if (color) {
        applyRecentColor(color);
      }
    });
  });
}

/**
 * Apply a recent color to the picker
 */
function applyRecentColor(colorData) {
  colorPickerState.isGradient = colorData.isGradient;
  colorPickerState.solidColor = colorData.solidColor || '#4a90d9';
  colorPickerState.gradientStart = colorData.gradientStart || '#4a90d9';
  colorPickerState.gradientEnd = colorData.gradientEnd || '#9b59b6';
  colorPickerState.gradientDirection = colorData.gradientDirection || 'to bottom';

  // Update UI
  elements.colorPicker.value = colorPickerState.solidColor;
  elements.colorHex.value = colorPickerState.solidColor;
  elements.gradientToggle.checked = colorPickerState.isGradient;
  elements.gradientControls.classList.toggle('hidden', !colorPickerState.isGradient);
  elements.gradientStart.value = colorPickerState.gradientStart;
  elements.gradientEnd.value = colorPickerState.gradientEnd;
  elements.gradientDirection.value = colorPickerState.gradientDirection;

  updateColorPreview();
  updateColorSelection();
}

function loadImageFromUrl() {
  const url = elements.urlInput.value.trim();
  if (!url) return;

  elements.urlError.classList.add('hidden');

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    elements.urlPreviewImage.src = url;
    elements.urlPreview.classList.remove('hidden');

    artPickerState.selectedSource = {
      type: 'url',
      src: url,
      name: url.split('/').pop() || 'URL Image'
    };
    updateApplyButton();
  };

  img.onerror = () => {
    elements.urlError.textContent = 'Failed to load image. Check the URL or CORS policy.';
    elements.urlError.classList.remove('hidden');
  };

  img.src = url;
}

async function applySelectedArt() {
  const region = state.regions.find(r => r.id === artPickerState.targetRegionId);
  if (!region || !artPickerState.selectedSource) return;

  const src = artPickerState.selectedSource.src;
  const isGif = isAnimatedGif(src);
  const isColor = artPickerState.selectedSource.type === 'color';

  region.art = {
    src: src,
    name: artPickerState.selectedSource.name,
    contentType: isGif ? 'gif' : (isColor ? 'color' : 'image'),
    isAnimated: isGif
  };

  // Save to recent colors if it's a color
  if (isColor && artPickerState.selectedSource.colorData) {
    saveRecentColor(artPickerState.selectedSource.colorData);
    renderRecentColors();
  }

  // Close picker immediately for better UX
  updateRegionList();
  saveToStorage();
  closeArtPicker();

  // Load the art source
  if (isGif) {
    try {
      let animatedImage;
      if (src.startsWith('data:')) {
        animatedImage = await decodeGifFromDataUrl(src);
      } else {
        animatedImage = await decodeGifFromUrl(src);
      }
      state.artSources.set(region.id, animatedImage);

      // Update WebGL texture if using WebGL
      if (webglRenderer && animatedImage.currentFrame) {
        webglRenderer.loadTexture(animatedImage.currentFrame, region.id);
      }
    } catch (e) {
      console.error('Failed to decode GIF:', e);
      // Fall back to static image
      loadStaticImage(region, src);
    }
  } else {
    loadStaticImage(region, src);
  }
}

/**
 * Load a static image for a region
 */
function loadStaticImage(region, src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.artSources.set(region.id, img);
    // Update WebGL texture if using WebGL
    if (webglRenderer) {
      webglRenderer.loadTexture(img, region.id);
    }
  };
  img.src = src;
}

// ============================================
// Storage
// ============================================
function saveToStorage() {
  const data = {
    regions: state.regions.map(r => ({
      ...r,
      art: r.art ? { ...r.art } : null
    }))
  };
  localStorage.setItem('multiRegionArt', JSON.stringify(data));
}

function loadFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem('multiRegionArt'));
    if (data && data.regions) {
      state.regions = data.regions;

      for (const region of state.regions) {
        // Backward compatibility: ensure type exists (default to 'free')
        if (!region.type) {
          region.type = REGION_TYPES.FREE;
        }

        if (region.art && region.art.src) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            state.artSources.set(region.id, img);
          };
          img.src = region.art.src;
        }
      }

      updateRegionList();
    }
  } catch (e) {
    console.warn('Failed to load from storage:', e);
  }
}

// ============================================
// Helpers
// ============================================
function showLoading(text) {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove('hidden');
}

// Start app
init();
