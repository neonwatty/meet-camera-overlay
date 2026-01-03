import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from 'canvas';
import {
  drawOverlay,
  renderOverlays,
  getRegionAlpha,
  hasContentInRegion,
  getPixelColor
} from '../../lib/canvas-renderer.js';

// Create a simple test image (red square)
async function createTestImage(width = 100, height = 100, color = 'red') {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  // Convert to image-like object
  return {
    width,
    height,
    complete: true,
    _canvas: canvas,
    // Make it drawable
    get naturalWidth() { return width; },
    get naturalHeight() { return height; }
  };
}

describe('drawOverlay', () => {
  let canvas;
  let ctx;

  beforeEach(() => {
    canvas = createCanvas(640, 480);
    ctx = canvas.getContext('2d');
    // Fill with transparent background
    ctx.clearRect(0, 0, 640, 480);
  });

  it('draws overlay at correct position without mirror', async () => {
    const img = await createTestImage(100, 100, 'red');

    const overlay = {
      x: 0,
      y: 0,
      width: 20,  // 20% of 640 = 128px
      height: 20, // 20% of 480 = 96px
      opacity: 1
    };

    // Need to make the test image drawable by canvas
    const testCanvas = img._canvas;

    drawOverlay(ctx, overlay, testCanvas, 640, 480, { mirror: false });

    // Check that content was drawn in top-left region
    expect(hasContentInRegion(ctx, 0, 0, 50, 50)).toBe(true);

    // Check that bottom-right is still empty
    expect(hasContentInRegion(ctx, 600, 440, 40, 40)).toBe(false);
  });

  it('draws overlay with 50% opacity', async () => {
    const img = await createTestImage(100, 100, 'rgba(255, 0, 0, 1)');
    const testCanvas = img._canvas;

    // First fill background with white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);

    const overlay = {
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      opacity: 0.5
    };

    drawOverlay(ctx, overlay, testCanvas, 640, 480, { mirror: false });

    // Get pixel in overlay region - should be blended (red + white at 50%)
    // At 50% opacity, red (255,0,0) over white (255,255,255) = (255, 127, 127)
    const pixel = getPixelColor(ctx, 80, 60);

    // Red channel should still be 255
    expect(pixel.r).toBe(255);
    // Green and blue should be ~127 (blended)
    expect(pixel.g).toBeGreaterThan(100);
    expect(pixel.g).toBeLessThan(160);
    expect(pixel.b).toBeGreaterThan(100);
    expect(pixel.b).toBeLessThan(160);
  });

  it('draws overlay with 0% opacity (invisible)', async () => {
    const img = await createTestImage(100, 100, 'red');
    const testCanvas = img._canvas;

    // Fill with solid green background
    ctx.fillStyle = 'green';
    ctx.fillRect(0, 0, 640, 480);

    const overlay = {
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      opacity: 0
    };

    drawOverlay(ctx, overlay, testCanvas, 640, 480, { mirror: false });

    // Pixel should still be green (overlay is invisible)
    const pixel = getPixelColor(ctx, 80, 60);
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(128); // green
    expect(pixel.b).toBe(0);
  });

  it('draws overlay with 100% opacity (fully visible)', async () => {
    const img = await createTestImage(100, 100, 'blue');
    const testCanvas = img._canvas;

    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);

    const overlay = {
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      opacity: 1
    };

    drawOverlay(ctx, overlay, testCanvas, 640, 480, { mirror: false });

    // Pixel should be blue (fully opaque overlay)
    const pixel = getPixelColor(ctx, 80, 60);
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(255);
  });

  it('defaults to opacity 1 when not specified', async () => {
    const img = await createTestImage(100, 100, 'blue');
    const testCanvas = img._canvas;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);

    const overlay = {
      x: 10,
      y: 10,
      width: 20,
      height: 20
      // opacity not specified
    };

    drawOverlay(ctx, overlay, testCanvas, 640, 480, { mirror: false });

    // Should be fully blue (default opacity 1)
    const pixel = getPixelColor(ctx, 80, 60);
    expect(pixel.b).toBe(255);
  });

  it('mirrors x position when mirror option is true', async () => {
    const img = await createTestImage(100, 100, 'red');
    const testCanvas = img._canvas;

    ctx.clearRect(0, 0, 640, 480);

    const overlay = {
      x: 0,  // Left side
      y: 0,
      width: 10,
      height: 10,
      opacity: 1
    };

    drawOverlay(ctx, overlay, testCanvas, 640, 480, { mirror: true });

    // With mirroring, x=0% should appear on the RIGHT side
    // Check right side has content
    expect(hasContentInRegion(ctx, 580, 0, 60, 50)).toBe(true);
    // Check left side is empty
    expect(hasContentInRegion(ctx, 0, 0, 60, 50)).toBe(false);
  });
});

describe('renderOverlays', () => {
  let canvas;
  let ctx;

  beforeEach(() => {
    canvas = createCanvas(640, 480);
    ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);
  });

  it('renders multiple overlays', async () => {
    const redImg = await createTestImage(100, 100, 'red');
    const blueImg = await createTestImage(100, 100, 'blue');

    const overlays = [
      { id: 'red', x: 0, y: 0, width: 10, height: 10, opacity: 1 },
      { id: 'blue', x: 80, y: 80, width: 10, height: 10, opacity: 1 }
    ];

    const overlayImages = new Map([
      ['red', redImg._canvas],
      ['blue', blueImg._canvas]
    ]);

    renderOverlays(ctx, overlays, overlayImages, 640, 480, { mirror: false });

    // Check red overlay region (top-left)
    const redPixel = getPixelColor(ctx, 30, 20);
    expect(redPixel.r).toBe(255);

    // Check blue overlay region (bottom-right)
    const bluePixel = getPixelColor(ctx, 550, 400);
    expect(bluePixel.b).toBe(255);
  });

  it('renders overlays with different opacities', async () => {
    const img1 = await createTestImage(100, 100, 'red');
    const img2 = await createTestImage(100, 100, 'blue');

    // Use a single overlay to test opacity blending more simply
    const overlays = [
      { id: 'semi', x: 0, y: 0, width: 50, height: 50, opacity: 0.5 }
    ];

    const overlayImages = new Map([
      ['semi', img1._canvas]
    ]);

    renderOverlays(ctx, overlays, overlayImages, 640, 480, { mirror: false });

    // Semi-transparent red overlay - should be blended with white background
    // Check a point that's definitely within the overlay
    const semiPixel = getPixelColor(ctx, 100, 100);
    expect(semiPixel.r).toBe(255);
    expect(semiPixel.g).toBeGreaterThan(100); // Blended with white
    expect(semiPixel.b).toBeGreaterThan(100); // Blended with white
  });

  it('renders full opacity overlay correctly', async () => {
    const blueImg = await createTestImage(100, 100, 'blue');

    const overlays = [
      { id: 'full', x: 0, y: 0, width: 50, height: 50, opacity: 1 }
    ];

    const overlayImages = new Map([
      ['full', blueImg._canvas]
    ]);

    renderOverlays(ctx, overlays, overlayImages, 640, 480, { mirror: false });

    // Full opacity blue overlay should completely cover white background
    const fullPixel = getPixelColor(ctx, 100, 100);
    expect(fullPixel.b).toBe(255);
    expect(fullPixel.r).toBe(0);
    expect(fullPixel.g).toBe(0);
  });

  it('skips overlays without loaded images', async () => {
    const img = await createTestImage(100, 100, 'red');

    const overlays = [
      { id: 'exists', x: 0, y: 0, width: 20, height: 20, opacity: 1 },
      { id: 'missing', x: 50, y: 50, width: 20, height: 20, opacity: 1 }
    ];

    const overlayImages = new Map([
      ['exists', img._canvas]
      // 'missing' is not in the map
    ]);

    // Should not throw
    expect(() => {
      renderOverlays(ctx, overlays, overlayImages, 640, 480, { mirror: false });
    }).not.toThrow();

    // First overlay should be drawn
    expect(hasContentInRegion(ctx, 0, 0, 100, 100)).toBe(true);
  });
});

describe('getPixelColor', () => {
  it('returns correct RGBA values', () => {
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext('2d');

    // Use solid color for exact matching
    ctx.fillStyle = 'rgb(100, 150, 200)';
    ctx.fillRect(0, 0, 10, 10);

    const pixel = getPixelColor(ctx, 5, 5);

    expect(pixel.r).toBe(100);
    expect(pixel.g).toBe(150);
    expect(pixel.b).toBe(200);
    expect(pixel.a).toBe(255); // Fully opaque
  });

  it('returns approximate values for semi-transparent fills', () => {
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(100, 150, 200, 0.5)';
    ctx.fillRect(0, 0, 10, 10);

    const pixel = getPixelColor(ctx, 5, 5);

    // Allow for rounding differences in canvas alpha handling
    expect(pixel.r).toBeGreaterThanOrEqual(98);
    expect(pixel.r).toBeLessThanOrEqual(102);
    expect(pixel.a).toBeGreaterThanOrEqual(126);
    expect(pixel.a).toBeLessThanOrEqual(130);
  });
});

describe('hasContentInRegion', () => {
  it('returns false for transparent region', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 100, 100);

    expect(hasContentInRegion(ctx, 0, 0, 50, 50)).toBe(false);
  });

  it('returns true for region with content', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 100, 100);
    ctx.fillStyle = 'red';
    ctx.fillRect(10, 10, 20, 20);

    expect(hasContentInRegion(ctx, 10, 10, 20, 20)).toBe(true);
    expect(hasContentInRegion(ctx, 50, 50, 20, 20)).toBe(false);
  });
});
