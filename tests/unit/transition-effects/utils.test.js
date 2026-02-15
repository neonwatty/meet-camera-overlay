import { describe, it, expect, vi } from 'vitest';
import { createCanvas } from 'canvas';

// Mock OffscreenCanvas before importing utils
vi.stubGlobal('OffscreenCanvas', class {
  constructor(w, h) {
    this._canvas = createCanvas(w, h);
    this.width = w;
    this.height = h;
  }
  getContext(type) {
    return this._canvas.getContext(type);
  }
});

const {
  easeOutCubic,
  extractContour,
  renderMaskOverlay,
  sobelEdgeDetect,
} = await import(
  '../../../prototype/multi-region-art/effects/utils.js'
);

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0.1; t <= 1; t += 0.1) {
      const val = easeOutCubic(t);
      expect(val).toBeGreaterThan(prev);
      prev = val;
    }
  });

  it('decelerates (values are above linear)', () => {
    // easeOutCubic should be above the linear line
    // for values between 0 and 1
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('extractContour', () => {
  function makeMask(w, h, personRect) {
    // 255 = background, 0 = person
    const mask = new Uint8Array(w * h).fill(255);
    for (let y = personRect.y; y < personRect.y + personRect.h; y++) {
      for (let x = personRect.x; x < personRect.x + personRect.w; x++) {
        if (y >= 0 && y < h && x >= 0 && x < w) {
          mask[y * w + x] = 0;
        }
      }
    }
    return mask;
  }

  it('returns empty array for mask with no person pixels', () => {
    const mask = new Uint8Array(10 * 10).fill(255);
    const result = extractContour(mask, 10, 10, 100, 100);
    expect(result).toEqual([]);
  });

  it('returns empty array when person region is too small', () => {
    // Only 3 rows of person pixels — below the minimum of 5
    const mask = new Uint8Array(10 * 10).fill(255);
    for (let y = 0; y < 3; y++) {
      mask[y * 10 + 5] = 0;
    }
    const result = extractContour(mask, 10, 10, 100, 100);
    expect(result).toEqual([]);
  });

  it('returns contour points for a solid person rectangle', () => {
    const mask = makeMask(20, 20, { x: 5, y: 2, w: 10, h: 16 });
    const result = extractContour(mask, 20, 20, 200, 200);

    expect(result.length).toBeGreaterThan(0);

    // All points should be within canvas bounds
    for (const p of result) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    }
  });

  it('scales contour coordinates to canvas dimensions', () => {
    const mask = makeMask(10, 10, { x: 0, y: 0, w: 10, h: 10 });
    const result = extractContour(mask, 10, 10, 640, 480);

    expect(result.length).toBeGreaterThan(0);

    // Points should be scaled to canvas coords, not mask coords
    const maxX = Math.max(...result.map((p) => p.x));
    const maxY = Math.max(...result.map((p) => p.y));
    expect(maxX).toBeGreaterThan(10);
    expect(maxY).toBeGreaterThan(10);
  });
});

describe('renderMaskOverlay', () => {
  it('returns a canvas-like object with correct dimensions', () => {
    const mask = new Uint8Array(4 * 4).fill(255);
    mask[5] = 0; // one person pixel
    const result = renderMaskOverlay(mask, 4, 4, 100, 100);

    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('renders green pixels where mask is person (0)', () => {
    // All person
    const mask = new Uint8Array(2 * 2).fill(0);
    const result = renderMaskOverlay(mask, 2, 2, 2, 2);
    const ctx = result._canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, 2, 2);

    // Check first pixel is green (0, 255, 65, 255)
    expect(imgData.data[0]).toBe(0);
    expect(imgData.data[1]).toBe(255);
    expect(imgData.data[2]).toBe(65);
    expect(imgData.data[3]).toBe(255);
  });

  it('leaves background pixels transparent', () => {
    // All background
    const mask = new Uint8Array(2 * 2).fill(255);
    const result = renderMaskOverlay(mask, 2, 2, 2, 2);
    const ctx = result._canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, 2, 2);

    // All pixels should be transparent (alpha 0)
    for (let i = 0; i < imgData.data.length; i += 4) {
      expect(imgData.data[i + 3]).toBe(0);
    }
  });
});

describe('sobelEdgeDetect', () => {
  it('returns a canvas-like object with correct dimensions', () => {
    const src = createCanvas(10, 10);
    const ctx = src.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 10, 10);

    const result = sobelEdgeDetect(src, 10, 10);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('detects edges in a high-contrast image', () => {
    const src = createCanvas(20, 20);
    const ctx = src.getContext('2d');
    // Left half black, right half white
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 10, 20);
    ctx.fillStyle = 'white';
    ctx.fillRect(10, 0, 10, 20);

    const result = sobelEdgeDetect(src, 20, 20);
    const outCtx = result._canvas.getContext('2d');
    const imgData = outCtx.getImageData(0, 0, 20, 20);

    // Edge should appear near x=10 — green channel should be
    // non-zero along the boundary
    let maxGreen = 0;
    for (let y = 2; y < 18; y++) {
      const idx = (y * 20 + 10) * 4;
      maxGreen = Math.max(maxGreen, imgData.data[idx + 1]);
    }
    expect(maxGreen).toBeGreaterThan(0);
  });

  it('produces minimal output for a uniform image', () => {
    const src = createCanvas(10, 10);
    const ctx = src.getContext('2d');
    ctx.fillStyle = 'gray';
    ctx.fillRect(0, 0, 10, 10);

    const result = sobelEdgeDetect(src, 10, 10);
    const outCtx = result._canvas.getContext('2d');
    const imgData = outCtx.getImageData(0, 0, 10, 10);

    // Interior pixels should have near-zero green
    let totalGreen = 0;
    for (let y = 2; y < 8; y++) {
      for (let x = 2; x < 8; x++) {
        totalGreen += imgData.data[(y * 10 + x) * 4 + 1];
      }
    }
    expect(totalGreen).toBe(0);
  });
});
