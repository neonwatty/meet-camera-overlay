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

function makeCtx() {
  const ctx = createCanvas(640, 480).getContext('2d');
  // Spy drawImage so OffscreenCanvas mock doesn't hit node-canvas compat issue
  vi.spyOn(ctx, 'drawImage').mockImplementation(() => {});
  return ctx;
}

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

// Task 2: SCAN Phase
describe('ScannerSequence — SCAN Phase', () => {
  let seq, ctx;
  beforeEach(() => { seq = new ScannerSequence(); ctx = makeCtx(); });

  it('tracks canvas dimensions and pre-renders mask overlay', () => {
    startScan(seq, ctx);
    seq.update(ctx, 1500, 640, 480);
    expect(seq._canvasW).toBe(640);
    expect(seq._canvasH).toBe(480);
    expect(seq._maskOverlay).not.toBeNull();
  });

  it('skips mask overlay without canvas dimensions', () => {
    seq.start();
    seq.setDetectionData(makeDetectionData());
    expect(seq._maskOverlay).toBeNull();
  });

  it('renders at various progress points without error', () => {
    const t0 = startScan(seq, ctx);
    seq.update(ctx, t0 + 100, 640, 480);
    expect(seq.phase).toBe('SCAN');
    seq.update(ctx, t0 + 1500, 640, 480);
    expect(seq.phase).toBe('SCAN');
    seq.update(ctx, t0 + 2900, 640, 480);
    expect(seq.phase).toBe('SCAN');
  });

  it('draws "ANALYZING SUBJECT..." status text', () => {
    const t0 = startScan(seq, ctx);
    const spy = vi.spyOn(seq, '_drawStatusText');
    seq.update(ctx, t0 + 500, 640, 480);
    expect(spy).toHaveBeenCalledWith(ctx, 'ANALYZING SUBJECT...', 640, 480);
    spy.mockRestore();
  });

  it('_drawStatusText renders without error', () => {
    startScan(seq, ctx);
    seq._drawStatusText(ctx, 'TEST', 640, 480);
  });
});

function advanceToLockOn(seq, ctx) {
  const t0 = startScan(seq, ctx);
  const t1 = t0 + 3001;
  seq.update(ctx, t1, 640, 480);
  return t1;
}

// Task 3: LOCK_ON Phase
describe('ScannerSequence — LOCK_ON Phase', () => {
  let seq, ctx;
  beforeEach(() => { seq = new ScannerSequence(); ctx = makeCtx(); });

  it('fires onLockOn callback exactly once', () => {
    const cb = vi.fn();
    seq.onLockOn = cb;
    const t = advanceToLockOn(seq, ctx);
    expect(seq.phase).toBe('LOCK_ON');
    expect(cb).toHaveBeenCalledOnce();
    seq.update(ctx, t + 500, 640, 480);
    seq.update(ctx, t + 1000, 640, 480);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('renders without error and shows "SUBJECT LOCKED"', () => {
    const t = advanceToLockOn(seq, ctx);
    const spy = vi.spyOn(seq, '_drawStatusText');
    seq.update(ctx, t + 500, 640, 480);
    expect(seq.phase).toBe('LOCK_ON');
    expect(spy).toHaveBeenCalledWith(ctx, 'SUBJECT LOCKED', 640, 480);
    spy.mockRestore();
  });

  it('computes person center from contour average', () => {
    advanceToLockOn(seq, ctx);
    expect(seq._personCenter.x).toBeCloseTo(300, 0);
    expect(seq._personCenter.y).toBeCloseTo(225, 0);
  });
});

function advanceToReveal(seq, ctx) {
  const t1 = advanceToLockOn(seq, ctx);
  const t2 = t1 + 2001;
  seq.update(ctx, t2, 640, 480);
  return t2;
}

// Task 4: REVEAL Phase + getRegionEntrance
describe('ScannerSequence — REVEAL + getRegionEntrance', () => {
  let seq, ctx;
  beforeEach(() => { seq = new ScannerSequence(); ctx = makeCtx(); });

  it('enters REVEAL and renders without error', () => {
    const t = advanceToReveal(seq, ctx);
    expect(seq.phase).toBe('REVEAL');
    seq.update(ctx, t + 500, 640, 480);
    expect(seq.phase).toBe('REVEAL');
  });

  it('renders fading "SCENE READY" text', () => {
    const t = advanceToReveal(seq, ctx);
    const spy = vi.spyOn(seq, '_drawStatusText');
    seq.update(ctx, t + 500, 640, 480);
    expect(spy.mock.calls.some((a) => a[1] === 'SCENE READY')).toBe(true);
    spy.mockRestore();
  });

  it('getRegionEntrance returns 1 when IDLE or DONE', () => {
    expect(seq.getRegionEntrance(0)).toBe(1);
    expect(seq.getRegionEntrance(5)).toBe(1);
    seq.start();
    seq.skip();
    expect(seq.getRegionEntrance(0)).toBe(1);
  });

  it('getRegionEntrance returns 0 when WAITING, SCAN, or LOCK_ON', () => {
    seq.start();
    expect(seq.getRegionEntrance(0)).toBe(0);
    seq.update(ctx, 1000, 640, 480);
    seq.setDetectionData(makeDetectionData());
    expect(seq.getRegionEntrance(0)).toBe(0);
    seq.update(ctx, 1000 + 3001, 640, 480);
    expect(seq.phase).toBe('LOCK_ON');
    expect(seq.getRegionEntrance(0)).toBe(0);
  });

  it('getRegionEntrance returns 0-1 progress during REVEAL', () => {
    const t = advanceToReveal(seq, ctx);
    seq.update(ctx, t + 1000, 640, 480);
    const p = seq.getRegionEntrance(0);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('stagger: later regions start later', () => {
    const t = advanceToReveal(seq, ctx);
    seq.update(ctx, t + 400, 640, 480);
    expect(seq.getRegionEntrance(0)).toBeGreaterThan(seq.getRegionEntrance(1));
  });

  it('region entrance is 0 before stagger delay elapses', () => {
    const t = advanceToReveal(seq, ctx);
    seq.update(ctx, t + 100, 640, 480);
    expect(seq.getRegionEntrance(2)).toBe(0);
  });

  it('region 0 reaches 1 at end of REVEAL', () => {
    const t = advanceToReveal(seq, ctx);
    seq.update(ctx, t + 1999, 640, 480);
    expect(seq.getRegionEntrance(0)).toBeCloseTo(1, 1);
  });
});
