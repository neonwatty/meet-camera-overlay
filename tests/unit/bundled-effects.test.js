import { describe, it, expect } from 'vitest';
import { BUNDLED_EFFECTS, createBundledEffect } from '../../lib/bundled-effects.js';

describe('BUNDLED_EFFECTS', () => {
  it('contains 7 bundled effects', () => {
    expect(BUNDLED_EFFECTS).toHaveLength(7);
  });

  it('each effect has required properties', () => {
    BUNDLED_EFFECTS.forEach(effect => {
      expect(effect).toHaveProperty('id');
      expect(effect).toHaveProperty('name');
      expect(effect).toHaveProperty('file');
      expect(effect.id).toMatch(/^bundled-/);
      expect(effect.file).toMatch(/\.gif$/);
    });
  });

  it('includes all expected aura colors', () => {
    const names = BUNDLED_EFFECTS.map(e => e.name);
    expect(names).toContain('Blue Aura');
    expect(names).toContain('Gold Aura');
    expect(names).toContain('Green Aura');
    expect(names).toContain('Pink Aura');
    expect(names).toContain('Purple Aura');
    expect(names).toContain('Red Aura');
    expect(names).toContain('Silver Aura');
  });

  it('has unique IDs for each effect', () => {
    const ids = BUNDLED_EFFECTS.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('createBundledEffect', () => {
  const mockExtensionUrl = 'chrome-extension://abc123/';
  const testEffect = { id: 'bundled-test', name: 'Test Effect', file: 'test.gif' };

  it('creates an overlay object with correct structure', () => {
    const overlay = createBundledEffect(testEffect, mockExtensionUrl);

    expect(overlay).toHaveProperty('id', 'bundled-test');
    expect(overlay).toHaveProperty('name', 'Test Effect');
    expect(overlay).toHaveProperty('src', 'chrome-extension://abc123/assets/effects/test.gif');
    expect(overlay).toHaveProperty('type', 'effect');
    expect(overlay).toHaveProperty('category', 'bundled');
  });

  it('sets effect-specific defaults', () => {
    const overlay = createBundledEffect(testEffect, mockExtensionUrl);

    expect(overlay.x).toBe(0);
    expect(overlay.y).toBe(0);
    expect(overlay.width).toBe(100);
    expect(overlay.height).toBe(100);
    expect(overlay.opacity).toBe(1);
    expect(overlay.active).toBe(false);
    expect(overlay.layer).toBe('background');
    expect(overlay.zIndex).toBe(0);
  });

  it('includes createdAt timestamp', () => {
    const before = Date.now();
    const overlay = createBundledEffect(testEffect, mockExtensionUrl);
    const after = Date.now();

    expect(overlay.createdAt).toBeGreaterThanOrEqual(before);
    expect(overlay.createdAt).toBeLessThanOrEqual(after);
  });

  it('constructs correct src URL for each bundled effect', () => {
    BUNDLED_EFFECTS.forEach(effect => {
      const overlay = createBundledEffect(effect, mockExtensionUrl);
      expect(overlay.src).toBe(`chrome-extension://abc123/assets/effects/${effect.file}`);
    });
  });
});
