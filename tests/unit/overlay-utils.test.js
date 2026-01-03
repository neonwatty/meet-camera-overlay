import { describe, it, expect } from 'vitest';
import {
  fitImageInBox,
  calculateOverlayPosition,
  validateOverlay,
  generateId,
  createOverlay
} from '../../lib/overlay-utils.js';

describe('fitImageInBox', () => {
  it('fits a wider image to box width', () => {
    // 200x100 image (2:1 aspect) into 100x100 box
    const result = fitImageInBox(200, 100, 100, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('fits a taller image to box height', () => {
    // 100x200 image (1:2 aspect) into 100x100 box
    const result = fitImageInBox(100, 200, 100, 100);
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);
  });

  it('fits a square image into a square box', () => {
    const result = fitImageInBox(100, 100, 50, 50);
    expect(result.width).toBe(50);
    expect(result.height).toBe(50);
  });

  it('fits image when aspect ratios match', () => {
    // 200x100 image into 100x50 box (same 2:1 aspect)
    const result = fitImageInBox(200, 100, 100, 50);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('handles landscape image in portrait box', () => {
    // 400x200 image (2:1) into 100x200 box (1:2)
    const result = fitImageInBox(400, 200, 100, 200);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('handles portrait image in landscape box', () => {
    // 200x400 image (1:2) into 200x100 box (2:1)
    const result = fitImageInBox(200, 400, 200, 100);
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);
  });
});

describe('calculateOverlayPosition', () => {
  const canvasWidth = 1280;
  const canvasHeight = 720;

  it('mirrors x position for Meet self-view', () => {
    const overlay = { x: 0, y: 0, width: 10, height: 10 };
    const result = calculateOverlayPosition(overlay, canvasWidth, canvasHeight, 100, 100);

    // At x=0%, after mirroring, should be at right side minus width
    // Box is 10% of 1280 = 128px, image fits as 72x72 (square in 128x72 box)
    expect(result.x).toBeCloseTo(canvasWidth - result.width, 1);
  });

  it('positions overlay at center when x=50%', () => {
    const overlay = { x: 50, y: 50, width: 10, height: 10 };
    const result = calculateOverlayPosition(overlay, canvasWidth, canvasHeight, 100, 100);

    // y should be at 50% = 360px
    expect(result.y).toBe(360);
  });

  it('preserves aspect ratio of image', () => {
    const overlay = { x: 10, y: 10, width: 20, height: 20 };
    // Wide image: 200x100
    const result = calculateOverlayPosition(overlay, canvasWidth, canvasHeight, 200, 100);

    // Aspect ratio should be preserved (2:1)
    expect(result.width / result.height).toBeCloseTo(2, 5);
  });

  it('calculates correct y position', () => {
    const overlay = { x: 0, y: 25, width: 10, height: 10 };
    const result = calculateOverlayPosition(overlay, canvasWidth, canvasHeight, 100, 100);

    // y at 25% of 720 = 180
    expect(result.y).toBe(180);
  });
});

describe('validateOverlay', () => {
  const validOverlay = {
    id: 'abc123',
    src: 'data:image/png;base64,xxx',
    x: 10,
    y: 20,
    width: 15,
    height: 25,
    name: 'Test'
  };

  it('validates a correct overlay', () => {
    const result = validateOverlay(validOverlay);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null overlay', () => {
    const result = validateOverlay(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Overlay is null or undefined');
  });

  it('rejects missing id', () => {
    const result = validateOverlay({ ...validOverlay, id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('rejects missing src', () => {
    const result = validateOverlay({ ...validOverlay, src: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('src'))).toBe(true);
  });

  it('rejects x out of range', () => {
    expect(validateOverlay({ ...validOverlay, x: -1 }).valid).toBe(false);
    expect(validateOverlay({ ...validOverlay, x: 101 }).valid).toBe(false);
  });

  it('rejects y out of range', () => {
    expect(validateOverlay({ ...validOverlay, y: -1 }).valid).toBe(false);
    expect(validateOverlay({ ...validOverlay, y: 101 }).valid).toBe(false);
  });

  it('rejects invalid width', () => {
    expect(validateOverlay({ ...validOverlay, width: 0 }).valid).toBe(false);
    expect(validateOverlay({ ...validOverlay, width: 101 }).valid).toBe(false);
  });

  it('rejects invalid height', () => {
    expect(validateOverlay({ ...validOverlay, height: 0 }).valid).toBe(false);
    expect(validateOverlay({ ...validOverlay, height: 101 }).valid).toBe(false);
  });
});

describe('generateId', () => {
  it('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates string IDs', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('createOverlay', () => {
  it('creates overlay with default values', () => {
    const overlay = createOverlay('http://example.com/img.png');
    expect(overlay.id).toBeDefined();
    expect(overlay.src).toBe('http://example.com/img.png');
    expect(overlay.x).toBe(5);
    expect(overlay.y).toBe(25);
    expect(overlay.width).toBe(20);
    expect(overlay.height).toBe(35);
    expect(overlay.name).toBe('Image');
  });

  it('accepts custom name', () => {
    const overlay = createOverlay('http://example.com/img.png', 'My Overlay');
    expect(overlay.name).toBe('My Overlay');
  });
});
