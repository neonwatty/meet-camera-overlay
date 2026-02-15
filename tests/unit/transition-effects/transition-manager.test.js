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

// Mock performance.now
vi.stubGlobal('performance', { now: () => 1000 });

// Mock document for createDebugPanel
vi.stubGlobal('document', {
  createElement: vi.fn(() => ({
    id: '',
    innerHTML: '',
    addEventListener: vi.fn(),
    querySelectorAll: vi.fn(() => []),
  })),
  body: { appendChild: vi.fn() },
});

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', vi.fn());

const { TransitionEffectManager } = await import(
  '../../../prototype/multi-region-art/effects/transition-manager.js'
);

describe('TransitionEffectManager', () => {
  let manager;

  beforeEach(() => {
    manager = new TransitionEffectManager();
  });

  it('starts with two effects', () => {
    expect(manager.meshShimmer).toBeDefined();
    expect(manager.edgeWireframe).toBeDefined();
    expect(manager._allEffects.length).toBe(2);
  });

  it('isActive returns false when no effects are active', () => {
    expect(manager.isActive).toBe(false);
  });

  it('update calls update on all effects', () => {
    const spy1 = vi.spyOn(manager.meshShimmer, 'update');
    const spy2 = vi.spyOn(manager.edgeWireframe, 'update');
    const ctx = {};

    manager.update(ctx, 100, 640, 480);

    expect(spy1).toHaveBeenCalledWith(ctx, 100, 640, 480);
    expect(spy2).toHaveBeenCalledWith(ctx, 100, 640, 480);
  });

  it('update stores canvas dimensions', () => {
    manager.update({}, 100, 800, 600);
    expect(manager._canvasW).toBe(800);
    expect(manager._canvasH).toBe(600);
  });

  it('setDetectors stores all detector refs', () => {
    const fl = {};
    const pl = {};
    const ft = [];
    const pc = [];
    manager.setDetectors(fl, pl, ft, pc);

    expect(manager._faceLandmarker).toBe(fl);
    expect(manager._poseLandmarker).toBe(pl);
    expect(manager._faceTesselation).toBe(ft);
    expect(manager._poseConnections).toBe(pc);
  });

  describe('updateContourCache', () => {
    it('stores a defensive copy of the mask', () => {
      const mask = new Uint8Array([0, 0, 0, 255]);
      manager.updateContourCache(mask, 2, 2, 100, 100);

      expect(manager._lastMask).not.toBe(mask);
      expect(manager._lastMask).toEqual(mask);
      expect(manager._lastMaskW).toBe(2);
      expect(manager._lastMaskH).toBe(2);
    });

    it('extracts and stores contour when mask is large enough', () => {
      // 20x20 mask, all person
      const mask = new Uint8Array(20 * 20).fill(0);
      manager.updateContourCache(mask, 20, 20, 200, 200);

      expect(manager._lastContour).not.toBeNull();
      expect(manager._lastContour.length).toBeGreaterThan(0);
    });
  });

  describe('triggerFirstSegmentation', () => {
    it('fires once and sets flag', () => {
      // Provide a video source so edgeWireframe.trigger works
      manager.setVideoSource(createCanvas(200, 200));

      const mask = new Uint8Array(20 * 20).fill(0);
      manager.triggerFirstSegmentation(
        mask, 20, 20, 200, 200, 1000
      );

      expect(manager._firstSegmentationFired).toBe(true);
      expect(manager.meshShimmer.active).toBe(true);
      expect(manager.edgeWireframe.active).toBe(true);
    });

    it('is idempotent — second call is no-op', () => {
      manager.setVideoSource(createCanvas(200, 200));

      const mask = new Uint8Array(20 * 20).fill(0);
      manager.triggerFirstSegmentation(
        mask, 20, 20, 200, 200, 1000
      );

      // Deactivate effects manually
      manager.meshShimmer.active = false;
      manager.edgeWireframe.active = false;

      // Second call should not re-trigger
      manager.triggerFirstSegmentation(
        mask, 20, 20, 200, 200, 2000
      );
      expect(manager.meshShimmer.active).toBe(false);
      expect(manager.edgeWireframe.active).toBe(false);
    });
  });

  describe('resetFirstSegmentation', () => {
    it('resets the flag so effects can fire again', () => {
      manager._firstSegmentationFired = true;
      manager.resetFirstSegmentation();
      expect(manager._firstSegmentationFired).toBe(false);
    });
  });

  it('setVideoSource stores video ref', () => {
    const video = { tagName: 'VIDEO' };
    manager.setVideoSource(video);
    expect(manager._videoSource).toBe(video);
  });
});
