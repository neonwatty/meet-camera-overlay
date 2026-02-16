import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvas } from 'canvas';

vi.stubGlobal('OffscreenCanvas', class {
  constructor(w, h) {
    this._canvas = createCanvas(w, h);
    this.width = w;
    this.height = h;
  }
  getContext(type) { return this._canvas.getContext(type); }
});
vi.stubGlobal('performance', { now: () => 1000 });

const { ScannerSequence } = await import(
  '../../../prototype/multi-region-art/effects/scanner-sequence.js'
);

function makeCtx() { return createCanvas(640, 480).getContext('2d'); }

function makeDetectionData() {
  return {
    contour: [
      { x: 100, y: 50 }, { x: 100, y: 400 },
      { x: 500, y: 400 }, { x: 500, y: 50 },
    ],
    mask: new Uint8Array(16 * 16).fill(0),
    maskW: 16,
    maskH: 16,
  };
}

function startScan(seq, ctx, t = 1000) {
  seq.start();
  seq.update(ctx, t, 640, 480);
  seq.setDetectionData(makeDetectionData());
  return t;
}

// Task 1: State Machine
describe('ScannerSequence — State Machine', () => {
  let seq;
  beforeEach(() => { seq = new ScannerSequence(); });

  it('starts in IDLE with isActive false', () => {
    expect(seq.phase).toBe('IDLE');
    expect(seq.isActive).toBe(false);
  });

  it('start() transitions to WAITING (isActive true)', () => {
    seq.start();
    expect(seq.phase).toBe('WAITING');
    expect(seq.isActive).toBe(true);
  });

  it('setDetectionData transitions WAITING -> SCAN when contour has data', () => {
    const ctx = makeCtx();
    startScan(seq, ctx);
    expect(seq.phase).toBe('SCAN');
  });

  it('setDetectionData does nothing with empty contour or wrong phase', () => {
    seq.start();
    seq.setDetectionData({ contour: [], mask: null, maskW: 0, maskH: 0 });
    expect(seq.phase).toBe('WAITING');
    const seq2 = new ScannerSequence();
    seq2.setDetectionData(makeDetectionData());
    expect(seq2.phase).toBe('IDLE');
  });

  it('skip() jumps to DONE from any state and fires onComplete', () => {
    const cb = vi.fn();
    seq.onComplete = cb;
    seq.start();
    seq.skip();
    expect(seq.phase).toBe('DONE');
    expect(seq.isActive).toBe(false);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('skip() from IDLE goes to DONE', () => {
    seq.skip();
    expect(seq.phase).toBe('DONE');
  });

  it('full lifecycle: SCAN -> LOCK_ON -> REVEAL -> DONE', () => {
    const cb = vi.fn();
    seq.onComplete = cb;
    const ctx = makeCtx();
    const t0 = startScan(seq, ctx);
    const t1 = t0 + 3001;
    seq.update(ctx, t1, 640, 480);
    expect(seq.phase).toBe('LOCK_ON');
    const t2 = t1 + 2001;
    seq.update(ctx, t2, 640, 480);
    expect(seq.phase).toBe('REVEAL');
    const t3 = t2 + 2001;
    seq.update(ctx, t3, 640, 480);
    expect(seq.phase).toBe('DONE');
    expect(cb).toHaveBeenCalledOnce();
  });

  it('update is no-op for IDLE, DONE, and WAITING', () => {
    const ctx = makeCtx();
    seq.update(ctx, 1000, 640, 480);
    expect(seq.phase).toBe('IDLE');
    seq.start();
    seq.update(ctx, 1000, 640, 480);
    seq.update(ctx, 99999, 640, 480);
    expect(seq.phase).toBe('WAITING');
    seq.skip();
    seq.update(ctx, 99999, 640, 480);
    expect(seq.phase).toBe('DONE');
  });
});
