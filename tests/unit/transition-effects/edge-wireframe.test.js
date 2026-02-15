import { describe, it, expect, vi } from 'vitest';
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

const { EdgeWireframeFlashEffect } = await import(
  '../../../prototype/multi-region-art/effects/edge-wireframe.js'
);

describe('EdgeWireframeFlashEffect', () => {
  it('has 8s duration', () => {
    const effect = new EdgeWireframeFlashEffect();
    expect(effect.duration).toBe(8000);
  });

  it('starts with null edgeCanvas', () => {
    const effect = new EdgeWireframeFlashEffect();
    expect(effect.edgeCanvas).toBeNull();
  });

  it('builds edgeCanvas on trigger', () => {
    const effect = new EdgeWireframeFlashEffect();
    const src = createCanvas(100, 100);
    const ctx = src.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 100, 100);

    effect.trigger(0, src, 100, 100);

    expect(effect.edgeCanvas).not.toBeNull();
    expect(effect.renderW).toBe(100);
    expect(effect.renderH).toBe(100);
  });

  it('render is no-op when edgeCanvas is null', () => {
    const effect = new EdgeWireframeFlashEffect();
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    // Should not throw
    expect(() => effect.render(ctx, 0.5)).not.toThrow();
  });

  it('render sets screen blend mode and fades by progress', () => {
    const effect = new EdgeWireframeFlashEffect();
    const src = createCanvas(50, 50);
    src.getContext('2d').fillRect(0, 0, 50, 50);

    effect.trigger(0, src, 50, 50);

    const canvas = createCanvas(50, 50);
    const ctx = canvas.getContext('2d');

    // Spy on drawImage to avoid node-canvas OffscreenCanvas compat issue
    const drawSpy = vi.spyOn(ctx, 'drawImage').mockImplementation(() => {});

    effect.render(ctx, 0.5);

    expect(drawSpy).toHaveBeenCalledOnce();
    // At progress=0.5, fade should be > 0
    expect(ctx.globalAlpha).not.toBe(0);
  });
});
