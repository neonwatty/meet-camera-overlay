import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvas } from 'canvas';

// Mock OffscreenCanvas
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

// Mock performance.now for _detectLandmarks
vi.stubGlobal('performance', { now: () => 1000 });

const { MeshShimmerEffect } = await import(
  '../../../prototype/multi-region-art/effects/mesh-shimmer.js'
);

describe('MeshShimmerEffect', () => {
  let effect;

  beforeEach(() => {
    effect = new MeshShimmerEffect();
  });

  it('has 15s duration', () => {
    expect(effect.duration).toBe(15000);
  });

  it('starts with null landmarks', () => {
    expect(effect.faceLandmarks).toBeNull();
    expect(effect.poseLandmarks).toBeNull();
  });

  describe('_smoothLandmarks', () => {
    it('returns raw values when prev is null', () => {
      const raw = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
      const result = effect._smoothLandmarks(null, raw);
      expect(result).toBe(raw);
    });

    it('returns raw values when lengths differ', () => {
      const prev = [{ x: 0, y: 0 }];
      const raw = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
      const result = effect._smoothLandmarks(prev, raw);
      expect(result).toBe(raw);
    });

    it('blends prev and raw with smoothing factor', () => {
      effect._smoothingFactor = 0.5;
      const prev = [{ x: 0, y: 0 }];
      const raw = [{ x: 10, y: 20 }];
      const result = effect._smoothLandmarks(prev, raw);

      expect(result[0].x).toBeCloseTo(5, 5);
      expect(result[0].y).toBeCloseTo(10, 5);
    });

    it('with smoothing=1 returns raw values', () => {
      effect._smoothingFactor = 1;
      const prev = [{ x: 100, y: 200 }];
      const raw = [{ x: 10, y: 20 }];
      const result = effect._smoothLandmarks(prev, raw);

      expect(result[0].x).toBeCloseTo(10, 5);
      expect(result[0].y).toBeCloseTo(20, 5);
    });
  });

  describe('_rebuildMaskData', () => {
    it('does nothing when mask is null', () => {
      effect._rebuildMaskData(null, 0, 0, 100, 100);
      expect(effect._maskOverlay).toBeNull();
      expect(effect._scanLines).toEqual([]);
    });

    it('builds mask overlay and scan lines', () => {
      // Small all-person mask
      const mask = new Uint8Array(4 * 4).fill(0);
      effect._rebuildMaskData(mask, 4, 4, 40, 40);

      expect(effect._maskOverlay).not.toBeNull();
      expect(effect._scanLines.length).toBeGreaterThan(0);
    });

    it('generates scan lines with correct structure', () => {
      const mask = new Uint8Array(10 * 10).fill(0);
      effect._rebuildMaskData(mask, 10, 10, 100, 100);

      for (const line of effect._scanLines) {
        expect(line).toHaveProperty('y');
        expect(line).toHaveProperty('x1');
        expect(line).toHaveProperty('x2');
        expect(line.x2).toBeGreaterThan(line.x1);
      }
    });
  });

  describe('deferred countdown', () => {
    it('resets _landmarksDetected on trigger', () => {
      effect._landmarksDetected = true;
      effect.trigger(1000);
      expect(effect._landmarksDetected).toBe(false);
    });

    it('defers startTime until face landmarks detected', () => {
      const ctx = createCanvas(100, 100).getContext('2d');
      effect.trigger(1000);
      expect(effect.active).toBe(true);

      // Without landmarks, startTime keeps resetting
      effect.update(ctx, 5000, 100, 100);
      expect(effect.startTime).toBe(5000);
      expect(effect.active).toBe(true);

      effect.update(ctx, 10000, 100, 100);
      expect(effect.startTime).toBe(10000);
      expect(effect.active).toBe(true);

      // Simulate landmarks detected
      effect.faceLandmarks = [{ x: 50, y: 50 }];
      effect.update(ctx, 12000, 100, 100);
      expect(effect._landmarksDetected).toBe(true);
      expect(effect.startTime).toBe(12000);

      // Now countdown progresses normally — startTime stays fixed
      effect.update(ctx, 13000, 100, 100);
      expect(effect.startTime).toBe(12000);
      expect(effect.active).toBe(true);
    });

    it('expires 15s after landmarks first detected', () => {
      const ctx = createCanvas(100, 100).getContext('2d');
      effect.trigger(1000);

      // Landmarks appear at t=5000
      effect.faceLandmarks = [{ x: 50, y: 50 }];
      effect.update(ctx, 5000, 100, 100);
      expect(effect._landmarksDetected).toBe(true);

      // Still active at t=19999 (14.999s after landmarks)
      effect.update(ctx, 19999, 100, 100);
      expect(effect.active).toBe(true);

      // Expires at t=20000 (15s after landmarks)
      effect.update(ctx, 20000, 100, 100);
      expect(effect.active).toBe(false);
    });
  });
});
