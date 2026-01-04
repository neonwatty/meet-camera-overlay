import { describe, it, expect } from 'vitest';
import {
  fitImageInBox,
  calculateOverlayPosition,
  validateOverlay,
  generateId,
  createOverlay,
  createEffect,
  isEffect,
  shouldRender,
  migrateOverlay,
  migrateOverlays,
  sortOverlaysByLayer,
  duplicateOverlay,
  recalculateZIndices,
  CATEGORY_USER,
  CATEGORY_BUNDLED,
  LAYER_FOREGROUND,
  LAYER_BACKGROUND
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

  it('accepts valid opacity', () => {
    expect(validateOverlay({ ...validOverlay, opacity: 0 }).valid).toBe(true);
    expect(validateOverlay({ ...validOverlay, opacity: 0.5 }).valid).toBe(true);
    expect(validateOverlay({ ...validOverlay, opacity: 1 }).valid).toBe(true);
  });

  it('accepts missing opacity (optional field)', () => {
    const overlayWithoutOpacity = { ...validOverlay };
    delete overlayWithoutOpacity.opacity;
    expect(validateOverlay(overlayWithoutOpacity).valid).toBe(true);
  });

  it('rejects invalid opacity', () => {
    expect(validateOverlay({ ...validOverlay, opacity: -0.1 }).valid).toBe(false);
    expect(validateOverlay({ ...validOverlay, opacity: 1.1 }).valid).toBe(false);
    expect(validateOverlay({ ...validOverlay, opacity: 'half' }).valid).toBe(false);
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
    expect(overlay.opacity).toBe(1);
    expect(overlay.name).toBe('Image');
  });

  it('accepts custom name', () => {
    const overlay = createOverlay('http://example.com/img.png', 'My Overlay');
    expect(overlay.name).toBe('My Overlay');
  });

  it('includes new MVP fields with defaults', () => {
    const overlay = createOverlay('http://example.com/img.png');
    expect(overlay.category).toBe(CATEGORY_USER);
    expect(overlay.layer).toBe(LAYER_FOREGROUND);
    expect(overlay.zIndex).toBe(0);
    expect(overlay.createdAt).toBeDefined();
    expect(typeof overlay.createdAt).toBe('number');
  });

  it('accepts custom category and layer options', () => {
    const overlay = createOverlay('http://example.com/img.png', 'Test', {
      category: CATEGORY_BUNDLED,
      layer: LAYER_BACKGROUND
    });
    expect(overlay.category).toBe(CATEGORY_BUNDLED);
    expect(overlay.layer).toBe(LAYER_BACKGROUND);
  });
});

describe('createEffect', () => {
  it('creates effect with correct defaults', () => {
    const effect = createEffect('http://example.com/effect.gif');
    expect(effect.id).toBeDefined();
    expect(effect.src).toBe('http://example.com/effect.gif');
    expect(effect.type).toBe('effect');
    expect(effect.active).toBe(false);
    expect(effect.name).toBe('Effect');
  });

  it('creates full-screen effect', () => {
    const effect = createEffect('http://example.com/effect.gif');
    expect(effect.x).toBe(0);
    expect(effect.y).toBe(0);
    expect(effect.width).toBe(100);
    expect(effect.height).toBe(100);
  });

  it('defaults to background layer', () => {
    const effect = createEffect('http://example.com/effect.gif');
    expect(effect.layer).toBe(LAYER_BACKGROUND);
  });

  it('accepts custom name and category', () => {
    const effect = createEffect('http://example.com/effect.gif', 'Fire Effect', {
      category: CATEGORY_BUNDLED
    });
    expect(effect.name).toBe('Fire Effect');
    expect(effect.category).toBe(CATEGORY_BUNDLED);
  });

  it('includes MVP fields', () => {
    const effect = createEffect('http://example.com/effect.gif');
    expect(effect.category).toBe(CATEGORY_USER);
    expect(effect.zIndex).toBe(0);
    expect(effect.createdAt).toBeDefined();
  });
});

describe('isEffect', () => {
  it('returns true for effect type', () => {
    const effect = { type: 'effect', id: '123', name: 'Test' };
    expect(isEffect(effect)).toBe(true);
  });

  it('returns false for standard type', () => {
    const overlay = { type: 'standard', id: '123', name: 'Test' };
    expect(isEffect(overlay)).toBe(false);
  });

  it('returns false for undefined type', () => {
    const overlay = { id: '123', name: 'Test' };
    expect(isEffect(overlay)).toBe(false);
  });

  it('returns falsy for null', () => {
    expect(isEffect(null)).toBeFalsy();
  });

  it('returns falsy for undefined', () => {
    expect(isEffect(undefined)).toBeFalsy();
  });
});

describe('shouldRender', () => {
  it('returns true for standard overlay', () => {
    const overlay = { type: 'standard', id: '123' };
    expect(shouldRender(overlay)).toBe(true);
  });

  it('returns true for overlay without type (defaults to standard)', () => {
    const overlay = { id: '123' };
    expect(shouldRender(overlay)).toBe(true);
  });

  it('returns false for inactive effect', () => {
    const effect = { type: 'effect', active: false, id: '123' };
    expect(shouldRender(effect)).toBe(false);
  });

  it('returns true for active effect', () => {
    const effect = { type: 'effect', active: true, id: '123' };
    expect(shouldRender(effect)).toBe(true);
  });

  it('returns false for null', () => {
    expect(shouldRender(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(shouldRender(undefined)).toBe(false);
  });
});

describe('migrateOverlay', () => {
  it('returns null/undefined as-is', () => {
    expect(migrateOverlay(null)).toBe(null);
    expect(migrateOverlay(undefined)).toBe(undefined);
  });

  it('adds category field if missing', () => {
    const old = { id: '123', src: 'test.png', x: 0, y: 0, width: 10, height: 10 };
    const migrated = migrateOverlay(old);
    expect(migrated.category).toBe(CATEGORY_USER);
  });

  it('preserves existing category', () => {
    const old = { id: '123', category: CATEGORY_BUNDLED };
    const migrated = migrateOverlay(old);
    expect(migrated.category).toBe(CATEGORY_BUNDLED);
  });

  it('adds layer field based on type - effect gets background', () => {
    const old = { id: '123', type: 'effect' };
    const migrated = migrateOverlay(old);
    expect(migrated.layer).toBe(LAYER_BACKGROUND);
  });

  it('adds layer field based on type - standard gets foreground', () => {
    const old = { id: '123', type: 'standard' };
    const migrated = migrateOverlay(old);
    expect(migrated.layer).toBe(LAYER_FOREGROUND);
  });

  it('adds layer field - no type defaults to foreground', () => {
    const old = { id: '123' };
    const migrated = migrateOverlay(old);
    expect(migrated.layer).toBe(LAYER_FOREGROUND);
  });

  it('preserves existing layer', () => {
    const old = { id: '123', layer: LAYER_BACKGROUND };
    const migrated = migrateOverlay(old);
    expect(migrated.layer).toBe(LAYER_BACKGROUND);
  });

  it('adds zIndex field if missing', () => {
    const old = { id: '123' };
    const migrated = migrateOverlay(old);
    expect(migrated.zIndex).toBe(0);
  });

  it('preserves existing zIndex', () => {
    const old = { id: '123', zIndex: 5 };
    const migrated = migrateOverlay(old);
    expect(migrated.zIndex).toBe(5);
  });

  it('adds createdAt field if missing', () => {
    const old = { id: '123' };
    const migrated = migrateOverlay(old);
    expect(migrated.createdAt).toBeDefined();
    expect(typeof migrated.createdAt).toBe('number');
  });

  it('preserves existing createdAt', () => {
    const timestamp = 1234567890;
    const old = { id: '123', createdAt: timestamp };
    const migrated = migrateOverlay(old);
    expect(migrated.createdAt).toBe(timestamp);
  });

  it('does not mutate original overlay', () => {
    const old = { id: '123' };
    const migrated = migrateOverlay(old);
    expect(old.category).toBeUndefined();
    expect(migrated.category).toBe(CATEGORY_USER);
  });
});

describe('migrateOverlays', () => {
  it('returns empty array for non-array input', () => {
    expect(migrateOverlays(null)).toEqual([]);
    expect(migrateOverlays(undefined)).toEqual([]);
    expect(migrateOverlays('string')).toEqual([]);
  });

  it('migrates all overlays in array', () => {
    const old = [
      { id: '1', type: 'standard' },
      { id: '2', type: 'effect' }
    ];
    const migrated = migrateOverlays(old);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].layer).toBe(LAYER_FOREGROUND);
    expect(migrated[1].layer).toBe(LAYER_BACKGROUND);
  });

  it('handles empty array', () => {
    expect(migrateOverlays([])).toEqual([]);
  });
});

describe('sortOverlaysByLayer', () => {
  it('returns empty array for non-array input', () => {
    expect(sortOverlaysByLayer(null)).toEqual([]);
    expect(sortOverlaysByLayer(undefined)).toEqual([]);
  });

  it('puts background overlays before foreground', () => {
    const overlays = [
      { id: '1', layer: LAYER_FOREGROUND, zIndex: 0 },
      { id: '2', layer: LAYER_BACKGROUND, zIndex: 0 }
    ];
    const sorted = sortOverlaysByLayer(overlays);
    expect(sorted[0].id).toBe('2'); // background first
    expect(sorted[1].id).toBe('1'); // foreground second
  });

  it('sorts by zIndex within same layer', () => {
    const overlays = [
      { id: '1', layer: LAYER_FOREGROUND, zIndex: 2 },
      { id: '2', layer: LAYER_FOREGROUND, zIndex: 0 },
      { id: '3', layer: LAYER_FOREGROUND, zIndex: 1 }
    ];
    const sorted = sortOverlaysByLayer(overlays);
    expect(sorted[0].id).toBe('2'); // zIndex 0
    expect(sorted[1].id).toBe('3'); // zIndex 1
    expect(sorted[2].id).toBe('1'); // zIndex 2
  });

  it('handles complex mixed layers and zIndices', () => {
    const overlays = [
      { id: 'f1', layer: LAYER_FOREGROUND, zIndex: 1 },
      { id: 'b2', layer: LAYER_BACKGROUND, zIndex: 1 },
      { id: 'f0', layer: LAYER_FOREGROUND, zIndex: 0 },
      { id: 'b0', layer: LAYER_BACKGROUND, zIndex: 0 }
    ];
    const sorted = sortOverlaysByLayer(overlays);
    expect(sorted.map(o => o.id)).toEqual(['b0', 'b2', 'f0', 'f1']);
  });

  it('does not mutate original array', () => {
    const overlays = [
      { id: '1', layer: LAYER_FOREGROUND, zIndex: 0 },
      { id: '2', layer: LAYER_BACKGROUND, zIndex: 0 }
    ];
    const sorted = sortOverlaysByLayer(overlays);
    expect(overlays[0].id).toBe('1'); // original unchanged
    expect(sorted).not.toBe(overlays);
  });

  it('handles missing zIndex (defaults to 0)', () => {
    const overlays = [
      { id: '1', layer: LAYER_FOREGROUND, zIndex: 1 },
      { id: '2', layer: LAYER_FOREGROUND } // no zIndex
    ];
    const sorted = sortOverlaysByLayer(overlays);
    expect(sorted[0].id).toBe('2'); // missing zIndex = 0, comes first
    expect(sorted[1].id).toBe('1');
  });

  it('treats non-background as foreground', () => {
    const overlays = [
      { id: '1', layer: 'foreground', zIndex: 0 },
      { id: '2', layer: undefined, zIndex: 0 }, // undefined = foreground
      { id: '3', layer: LAYER_BACKGROUND, zIndex: 0 }
    ];
    const sorted = sortOverlaysByLayer(overlays);
    expect(sorted[0].id).toBe('3'); // background first
    // foreground and undefined are both "not background", sorted by zIndex
  });
});

describe('duplicateOverlay', () => {
  it('returns null for null input', () => {
    expect(duplicateOverlay(null)).toBe(null);
  });

  it('creates copy with new ID', () => {
    const original = {
      id: 'original-id',
      name: 'Test Overlay',
      src: 'test.png',
      x: 10,
      y: 20
    };
    const duplicate = duplicateOverlay(original);
    expect(duplicate.id).not.toBe('original-id');
    expect(duplicate.id).toBeDefined();
  });

  it('appends (Copy) to name', () => {
    const original = { id: '123', name: 'My Overlay' };
    const duplicate = duplicateOverlay(original);
    expect(duplicate.name).toBe('My Overlay (Copy)');
  });

  it('sets new createdAt timestamp', () => {
    const oldTimestamp = 1000;
    const original = { id: '123', name: 'Test', createdAt: oldTimestamp };
    const duplicate = duplicateOverlay(original);
    expect(duplicate.createdAt).toBeGreaterThan(oldTimestamp);
  });

  it('preserves other properties', () => {
    const original = {
      id: '123',
      name: 'Test',
      src: 'test.png',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      opacity: 0.5,
      layer: LAYER_BACKGROUND,
      category: CATEGORY_BUNDLED,
      zIndex: 5
    };
    const duplicate = duplicateOverlay(original);
    expect(duplicate.src).toBe('test.png');
    expect(duplicate.x).toBe(10);
    expect(duplicate.y).toBe(20);
    expect(duplicate.width).toBe(30);
    expect(duplicate.height).toBe(40);
    expect(duplicate.opacity).toBe(0.5);
    expect(duplicate.layer).toBe(LAYER_BACKGROUND);
    expect(duplicate.category).toBe(CATEGORY_BUNDLED);
    expect(duplicate.zIndex).toBe(5);
  });
});

describe('recalculateZIndices', () => {
  it('returns empty array for non-array input', () => {
    expect(recalculateZIndices(null)).toEqual([]);
    expect(recalculateZIndices(undefined)).toEqual([]);
  });

  it('assigns sequential zIndex within background layer', () => {
    const overlays = [
      { id: '1', layer: LAYER_BACKGROUND, zIndex: 10 },
      { id: '2', layer: LAYER_BACKGROUND, zIndex: 5 },
      { id: '3', layer: LAYER_BACKGROUND, zIndex: 20 }
    ];
    recalculateZIndices(overlays);
    expect(overlays[0].zIndex).toBe(0);
    expect(overlays[1].zIndex).toBe(1);
    expect(overlays[2].zIndex).toBe(2);
  });

  it('assigns sequential zIndex within foreground layer', () => {
    const overlays = [
      { id: '1', layer: LAYER_FOREGROUND, zIndex: 10 },
      { id: '2', layer: LAYER_FOREGROUND, zIndex: 5 }
    ];
    recalculateZIndices(overlays);
    expect(overlays[0].zIndex).toBe(0);
    expect(overlays[1].zIndex).toBe(1);
  });

  it('handles mixed layers independently', () => {
    const overlays = [
      { id: 'b1', layer: LAYER_BACKGROUND, zIndex: 99 },
      { id: 'f1', layer: LAYER_FOREGROUND, zIndex: 99 },
      { id: 'b2', layer: LAYER_BACKGROUND, zIndex: 99 },
      { id: 'f2', layer: LAYER_FOREGROUND, zIndex: 99 }
    ];
    recalculateZIndices(overlays);

    // Background gets 0, 1 in order of appearance
    expect(overlays[0].zIndex).toBe(0); // b1
    expect(overlays[2].zIndex).toBe(1); // b2

    // Foreground gets 0, 1 in order of appearance
    expect(overlays[1].zIndex).toBe(0); // f1
    expect(overlays[3].zIndex).toBe(1); // f2
  });

  it('handles empty array', () => {
    const overlays = [];
    const result = recalculateZIndices(overlays);
    expect(result).toEqual([]);
  });

  it('returns the same array reference', () => {
    const overlays = [{ id: '1', layer: LAYER_FOREGROUND, zIndex: 5 }];
    const result = recalculateZIndices(overlays);
    expect(result).toBe(overlays);
  });
});

describe('validateOverlay - new MVP fields', () => {
  const baseOverlay = {
    id: 'abc123',
    src: 'data:image/png;base64,xxx',
    x: 10,
    y: 20,
    width: 15,
    height: 25,
    name: 'Test'
  };

  it('accepts valid category values', () => {
    expect(validateOverlay({ ...baseOverlay, category: CATEGORY_USER }).valid).toBe(true);
    expect(validateOverlay({ ...baseOverlay, category: CATEGORY_BUNDLED }).valid).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = validateOverlay({ ...baseOverlay, category: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('category'))).toBe(true);
  });

  it('accepts valid layer values', () => {
    expect(validateOverlay({ ...baseOverlay, layer: LAYER_FOREGROUND }).valid).toBe(true);
    expect(validateOverlay({ ...baseOverlay, layer: LAYER_BACKGROUND }).valid).toBe(true);
  });

  it('rejects invalid layer', () => {
    const result = validateOverlay({ ...baseOverlay, layer: 'middle' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('layer'))).toBe(true);
  });

  it('accepts valid zIndex values', () => {
    expect(validateOverlay({ ...baseOverlay, zIndex: 0 }).valid).toBe(true);
    expect(validateOverlay({ ...baseOverlay, zIndex: 10 }).valid).toBe(true);
    expect(validateOverlay({ ...baseOverlay, zIndex: 100 }).valid).toBe(true);
  });

  it('rejects negative zIndex', () => {
    const result = validateOverlay({ ...baseOverlay, zIndex: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('zIndex'))).toBe(true);
  });

  it('rejects non-numeric zIndex', () => {
    const result = validateOverlay({ ...baseOverlay, zIndex: 'high' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('zIndex'))).toBe(true);
  });

  it('accepts valid createdAt timestamp', () => {
    expect(validateOverlay({ ...baseOverlay, createdAt: Date.now() }).valid).toBe(true);
    expect(validateOverlay({ ...baseOverlay, createdAt: 1234567890 }).valid).toBe(true);
  });

  it('rejects non-numeric createdAt', () => {
    const result = validateOverlay({ ...baseOverlay, createdAt: '2024-01-01' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('createdAt'))).toBe(true);
  });

  it('accepts missing optional MVP fields', () => {
    const result = validateOverlay(baseOverlay);
    expect(result.valid).toBe(true);
  });
});

describe('constants', () => {
  it('exports category constants', () => {
    expect(CATEGORY_USER).toBe('user');
    expect(CATEGORY_BUNDLED).toBe('bundled');
  });

  it('exports layer constants', () => {
    expect(LAYER_FOREGROUND).toBe('foreground');
    expect(LAYER_BACKGROUND).toBe('background');
  });
});
