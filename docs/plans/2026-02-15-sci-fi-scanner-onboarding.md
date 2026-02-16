# Sci-Fi Scanner Onboarding — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a phased sci-fi scanner animation that plays when a first-time user picks a demo scene — scan sweep reveals body contour, lock-on flares face mesh + skeleton, then art regions animate in.

**Architecture:** New `ScannerSequence` class in `effects/scanner-sequence.js` coordinates three phases (SCAN → LOCK_ON → REVEAL) using existing effect primitives. Integrates via two touch points in `multi-region.js`: `handleDemoSelection()` triggers it, `renderLoop()` calls its update and gates region rendering on its state.

**Tech Stack:** Vanilla JS (ES modules), Canvas2D drawing, existing MediaPipe detection pipeline, existing effects infrastructure in `effects/`.

**Design doc:** `docs/plans/2026-02-15-sci-fi-scanner-onboarding-design.md`

---

### Task 1: ScannerSequence — State Machine & Phase Timing

**Files:**
- Create: `prototype/multi-region-art/effects/scanner-sequence.js`
- Test: `tests/unit/transition-effects/scanner-sequence.test.js`

**Step 1: Write the failing test**

```js
// tests/unit/transition-effects/scanner-sequence.test.js
import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('performance', { now: () => 1000 });
vi.stubGlobal('OffscreenCanvas', class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return {}; }
});

const { ScannerSequence } = await import(
  '../../../prototype/multi-region-art/effects/scanner-sequence.js'
);

describe('ScannerSequence state machine', () => {
  it('starts in IDLE phase', () => {
    const seq = new ScannerSequence();
    expect(seq.phase).toBe('IDLE');
    expect(seq.isActive).toBe(false);
  });

  it('transitions to WAITING on start()', () => {
    const seq = new ScannerSequence();
    seq.start();
    expect(seq.phase).toBe('WAITING');
    expect(seq.isActive).toBe(true);
  });

  it('transitions WAITING → SCAN when detection data provided', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.setDetectionData({
      contour: [{ x: 0, y: 0 }],
      mask: new Uint8Array(4),
      maskW: 2, maskH: 2,
    });
    expect(seq.phase).toBe('SCAN');
  });

  it('stays in WAITING if no detection data', () => {
    const seq = new ScannerSequence();
    seq.start();
    // No setDetectionData call
    expect(seq.phase).toBe('WAITING');
  });

  it('skip() jumps to DONE', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.skip();
    expect(seq.phase).toBe('DONE');
    expect(seq.isActive).toBe(false);
  });

  it('calls onComplete when reaching DONE', () => {
    const cb = vi.fn();
    const seq = new ScannerSequence({ onComplete: cb });
    seq.start();
    seq.skip();
    expect(cb).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```js
// prototype/multi-region-art/effects/scanner-sequence.js

const PHASE_DURATIONS = {
  SCAN: 3000,
  LOCK_ON: 2000,
  REVEAL: 2000,
};

const PHASES = ['IDLE', 'WAITING', 'SCAN', 'LOCK_ON', 'REVEAL', 'DONE'];

export class ScannerSequence {
  constructor(options = {}) {
    this.phase = 'IDLE';
    this._phaseStartTime = 0;
    this._onComplete = options.onComplete || null;

    // Detection data (set externally)
    this._contour = null;
    this._mask = null;
    this._maskW = 0;
    this._maskH = 0;
  }

  get isActive() {
    return this.phase !== 'IDLE' && this.phase !== 'DONE';
  }

  start() {
    this.phase = 'WAITING';
    this._phaseStartTime = performance.now();
  }

  setDetectionData({ contour, mask, maskW, maskH }) {
    this._contour = contour;
    this._mask = mask;
    this._maskW = maskW;
    this._maskH = maskH;

    if (this.phase === 'WAITING' && contour && contour.length > 0) {
      this._enterPhase('SCAN');
    }
  }

  skip() {
    this._enterPhase('DONE');
  }

  _enterPhase(phase) {
    this.phase = phase;
    this._phaseStartTime = performance.now();
    if (phase === 'DONE' && this._onComplete) {
      this._onComplete();
    }
  }

  update(ctx, timestamp, w, h) {
    if (!this.isActive) return;
    if (this.phase === 'WAITING') return;

    const elapsed = timestamp - this._phaseStartTime;
    const duration = PHASE_DURATIONS[this.phase] || 0;
    const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;

    switch (this.phase) {
      case 'SCAN':
        this._renderScan(ctx, progress, w, h);
        if (progress >= 1) this._enterPhase('LOCK_ON');
        break;
      case 'LOCK_ON':
        this._renderLockOn(ctx, progress, elapsed, w, h);
        if (progress >= 1) this._enterPhase('REVEAL');
        break;
      case 'REVEAL':
        this._renderReveal(ctx, progress, w, h);
        if (progress >= 1) this._enterPhase('DONE');
        break;
    }
  }

  // Stubs — implemented in subsequent tasks
  _renderScan() {}
  _renderLockOn() {}
  _renderReveal() {}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: PASS — all 6 tests green

**Step 5: Commit**

```bash
git add prototype/multi-region-art/effects/scanner-sequence.js \
       tests/unit/transition-effects/scanner-sequence.test.js
git commit -m "feat(scanner): add ScannerSequence state machine with phase timing"
```

---

### Task 2: SCAN Phase — Sweep Line & Progressive Contour Reveal

**Files:**
- Modify: `prototype/multi-region-art/effects/scanner-sequence.js`
- Test: `tests/unit/transition-effects/scanner-sequence.test.js` (append)

**Step 1: Write the failing tests**

Append to `scanner-sequence.test.js`:

```js
describe('SCAN phase rendering', () => {
  it('draws scan line at correct Y position based on progress', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.setDetectionData({
      contour: Array.from({ length: 20 }, (_, i) => ({
        x: 50, y: i * 10,
      })),
      mask: new Uint8Array(100).fill(0),
      maskW: 10, maskH: 10,
    });

    const calls = [];
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      set strokeStyle(v) { calls.push({ prop: 'strokeStyle', val: v }); },
      set fillStyle(v) { calls.push({ prop: 'fillStyle', val: v }); },
      set lineWidth(v) { calls.push({ prop: 'lineWidth', val: v }); },
      set globalAlpha(v) { calls.push({ prop: 'globalAlpha', val: v }); },
      set globalCompositeOperation(v) {},
      set font(v) {},
      set textAlign(v) {},
      set lineCap(v) {},
      set lineJoin(v) {},
    };

    // At progress 0.5, scan line should be at 50% of canvas height
    seq._renderScan(mockCtx, 0.5, 640, 480);

    // Should have drawn something (stroke called for scan line + contour)
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('renders status text during SCAN phase', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.setDetectionData({
      contour: [{ x: 50, y: 50 }],
      mask: new Uint8Array(4).fill(0),
      maskW: 2, maskH: 2,
    });

    const mockCtx = {
      save: vi.fn(), restore: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
      fillText: vi.fn(), arc: vi.fn(), drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      set strokeStyle(_v) {}, set fillStyle(_v) {},
      set lineWidth(_v) {}, set globalAlpha(_v) {},
      set globalCompositeOperation(_v) {},
      set font(_v) {}, set textAlign(_v) {},
      set lineCap(_v) {}, set lineJoin(_v) {},
    };

    seq._renderScan(mockCtx, 0.3, 640, 480);
    expect(mockCtx.fillText).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: FAIL — `_renderScan` is a no-op stub, stroke/fillText never called

**Step 3: Implement `_renderScan`**

Replace the `_renderScan` stub in `scanner-sequence.js`:

```js
_renderScan(ctx, progress, w, h) {
  if (!this._contour || this._contour.length === 0) return;

  ctx.save();

  const scanY = progress * h;

  // Scan line with trailing glow
  const gradient = ctx.createLinearGradient(0, scanY - 80, 0, scanY);
  gradient.addColorStop(0, 'rgba(0, 255, 65, 0)');
  gradient.addColorStop(1, 'rgba(0, 255, 65, 0.9)');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(w, scanY);
  ctx.stroke();

  // Bright core line
  ctx.strokeStyle = 'rgba(150, 255, 180, 0.95)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(w, scanY);
  ctx.stroke();

  // Progressive contour reveal — only show points above scanY
  const visible = this._contour.filter((p) => p.y <= scanY);
  if (visible.length > 2) {
    ctx.strokeStyle = `rgba(0, 255, 65, 0.7)`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // Green mask overlay fades in behind scan line (low opacity)
  if (this._maskOverlay) {
    ctx.globalAlpha = progress * 0.15;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this._maskOverlay, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Corner status text
  this._drawStatusText(ctx, 'ANALYZING SUBJECT...', w, h);

  ctx.restore();
}

_drawStatusText(ctx, text, w, _h) {
  ctx.font = '11px "JetBrains Mono", "SF Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0, 255, 65, 0.6)';
  ctx.fillText(text, w - 16, 28);
}
```

Also add mask overlay building to `setDetectionData`:

```js
setDetectionData({ contour, mask, maskW, maskH }) {
  this._contour = contour;
  this._mask = mask;
  this._maskW = maskW;
  this._maskH = maskH;

  // Pre-render mask overlay for SCAN phase
  if (mask && maskW && maskH && this._canvasW && this._canvasH) {
    this._maskOverlay = renderMaskOverlay(
      mask, maskW, maskH, this._canvasW, this._canvasH
    );
  }

  if (this.phase === 'WAITING' && contour && contour.length > 0) {
    this._enterPhase('SCAN');
  }
}
```

And add `_canvasW`/`_canvasH` tracking to `update`:

```js
update(ctx, timestamp, w, h) {
  if (!this.isActive) return;
  this._canvasW = w;
  this._canvasH = h;
  if (this.phase === 'WAITING') return;
  // ... rest of update
}
```

Add the import at the top of `scanner-sequence.js`:

```js
import { renderMaskOverlay } from './utils.js';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add prototype/multi-region-art/effects/scanner-sequence.js \
       tests/unit/transition-effects/scanner-sequence.test.js
git commit -m "feat(scanner): implement SCAN phase — sweep line, progressive contour, status text"
```

---

### Task 3: LOCK_ON Phase — Face Mesh, Skeleton, Pulse Ring

**Files:**
- Modify: `prototype/multi-region-art/effects/scanner-sequence.js`
- Test: `tests/unit/transition-effects/scanner-sequence.test.js` (append)

**Step 1: Write the failing tests**

Append to `scanner-sequence.test.js`:

```js
describe('LOCK_ON phase rendering', () => {
  it('renders pulse ring and status text', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.setDetectionData({
      contour: Array.from({ length: 10 }, (_, i) => ({
        x: 100 + i * 5, y: 100 + i * 10,
      })),
      mask: new Uint8Array(100).fill(0),
      maskW: 10, maskH: 10,
    });

    const mockCtx = {
      save: vi.fn(), restore: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
      fillText: vi.fn(), arc: vi.fn(), drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      set strokeStyle(_v) {}, set fillStyle(_v) {},
      set lineWidth(_v) {}, set globalAlpha(_v) {},
      set globalCompositeOperation(_v) {},
      set font(_v) {}, set textAlign(_v) {},
      set lineCap(_v) {}, set lineJoin(_v) {},
    };

    seq._renderLockOn(mockCtx, 0.3, 600, 640, 480);

    // Pulse ring draws an arc
    expect(mockCtx.arc).toHaveBeenCalled();
    // Status text shown
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  it('triggers existing effects on phase entry', () => {
    const triggerSpy = vi.fn();
    const seq = new ScannerSequence({
      onLockOn: triggerSpy,
    });
    seq.start();
    seq.setDetectionData({
      contour: [{ x: 50, y: 50 }],
      mask: new Uint8Array(4).fill(0),
      maskW: 2, maskH: 2,
    });

    // Force transition to LOCK_ON
    seq._enterPhase('LOCK_ON');
    expect(triggerSpy).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: FAIL — `_renderLockOn` is stub, arc/fillText not called, onLockOn not wired

**Step 3: Implement `_renderLockOn`**

Add `_onLockOn` callback to constructor:

```js
constructor(options = {}) {
  this.phase = 'IDLE';
  this._phaseStartTime = 0;
  this._onComplete = options.onComplete || null;
  this._onLockOn = options.onLockOn || null;
  // ... rest
}
```

Add callback to `_enterPhase`:

```js
_enterPhase(phase) {
  this.phase = phase;
  this._phaseStartTime = performance.now();
  if (phase === 'LOCK_ON' && this._onLockOn) {
    this._onLockOn();
  }
  if (phase === 'DONE' && this._onComplete) {
    this._onComplete();
  }
}
```

Replace the `_renderLockOn` stub:

```js
_renderLockOn(ctx, progress, elapsed, w, h) {
  ctx.save();

  // Compute person center from contour
  const cx = this._contour.reduce((s, p) => s + p.x, 0) / this._contour.length;
  const cy = this._contour.reduce((s, p) => s + p.y, 0) / this._contour.length;

  // Pulse ring — expands outward from center, fading
  const pulseRadius = progress * Math.max(w, h) * 0.4;
  const pulseAlpha = Math.max(0, 1 - progress) * 0.6;
  ctx.strokeStyle = `rgba(0, 255, 65, ${pulseAlpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Full contour with shimmer
  const shimmer = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(elapsed * 0.005));
  if (this._contour.length > 2) {
    ctx.strokeStyle = `rgba(0, 255, 65, ${shimmer * 0.8})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < this._contour.length; i++) {
      const p = this._contour[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Scanning dots orbit the contour
  const scanSpeed = elapsed * 0.003;
  const dotCount = 4;
  for (let d = 0; d < dotCount; d++) {
    const t = (scanSpeed + d / dotCount) % 1;
    const idx = Math.floor(t * this._contour.length) % this._contour.length;
    const p = this._contour[idx];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 255, 200, 0.9)`;
    ctx.fill();
  }

  // Mask overlay at higher intensity
  if (this._maskOverlay) {
    ctx.globalAlpha = shimmer * 0.25;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this._maskOverlay, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Status text
  this._drawStatusText(ctx, 'SUBJECT LOCKED', w, h);

  ctx.restore();
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add prototype/multi-region-art/effects/scanner-sequence.js \
       tests/unit/transition-effects/scanner-sequence.test.js
git commit -m "feat(scanner): implement LOCK_ON phase — pulse ring, contour, scanner dots, status text"
```

---

### Task 4: REVEAL Phase — Art Region Entrance Animations

**Files:**
- Modify: `prototype/multi-region-art/effects/scanner-sequence.js`
- Test: `tests/unit/transition-effects/scanner-sequence.test.js` (append)

**Step 1: Write the failing tests**

Append to `scanner-sequence.test.js`:

```js
describe('REVEAL phase', () => {
  it('getRegionEntrance returns 0 before REVEAL phase', () => {
    const seq = new ScannerSequence();
    seq.start();
    expect(seq.getRegionEntrance(0)).toBe(0);
    expect(seq.getRegionEntrance(1)).toBe(0);
  });

  it('getRegionEntrance returns 1 after DONE', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.skip();
    expect(seq.getRegionEntrance(0)).toBe(1);
    expect(seq.getRegionEntrance(1)).toBe(1);
  });

  it('getRegionEntrance staggers by region index during REVEAL', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.setDetectionData({
      contour: [{ x: 50, y: 50 }],
      mask: new Uint8Array(4).fill(0),
      maskW: 2, maskH: 2,
    });
    // Force into REVEAL at 50% progress
    seq.phase = 'REVEAL';
    seq._phaseStartTime = performance.now() - 1000; // 1s into 2s phase

    const e0 = seq.getRegionEntrance(0);
    const e1 = seq.getRegionEntrance(1);
    // First region should be further along than second
    expect(e0).toBeGreaterThan(e1);
    // Both should be between 0 and 1
    expect(e0).toBeGreaterThanOrEqual(0);
    expect(e0).toBeLessThanOrEqual(1);
  });

  it('renders fading status text during REVEAL', () => {
    const seq = new ScannerSequence();
    seq.start();
    seq.setDetectionData({
      contour: [{ x: 50, y: 50 }],
      mask: new Uint8Array(4).fill(0),
      maskW: 2, maskH: 2,
    });

    const mockCtx = {
      save: vi.fn(), restore: vi.fn(),
      fillText: vi.fn(),
      set fillStyle(_v) {}, set globalAlpha(_v) {},
      set font(_v) {}, set textAlign(_v) {},
    };

    seq._renderReveal(mockCtx, 0.5, 640, 480);
    expect(mockCtx.fillText).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: FAIL — `getRegionEntrance` not defined, `_renderReveal` is stub

**Step 3: Implement REVEAL phase + `getRegionEntrance`**

Add to `ScannerSequence`:

```js
/**
 * Returns 0–1 entrance progress for a region at the given index.
 * Used by renderLoop to scale/fade regions during REVEAL.
 * Returns 0 before REVEAL, 1 after DONE.
 */
getRegionEntrance(regionIndex) {
  if (this.phase === 'DONE' || this.phase === 'IDLE') return 1;
  if (this.phase !== 'REVEAL') return 0;

  const elapsed = performance.now() - this._phaseStartTime;
  const staggerDelay = regionIndex * 300;
  const regionElapsed = elapsed - staggerDelay;
  const regionDuration = PHASE_DURATIONS.REVEAL - staggerDelay;

  if (regionElapsed <= 0) return 0;
  return Math.min(regionElapsed / Math.max(regionDuration, 1), 1);
}
```

Replace the `_renderReveal` stub:

```js
_renderReveal(ctx, progress, w, h) {
  ctx.save();

  // Fading status text
  const textAlpha = Math.max(0, 1 - progress * 2); // fades in first half
  if (textAlpha > 0.01) {
    ctx.font = '11px "JetBrains Mono", "SF Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(0, 255, 65, ${textAlpha * 0.6})`;
    ctx.fillText('SCENE READY', w - 16, 28);
  }

  ctx.restore();
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add prototype/multi-region-art/effects/scanner-sequence.js \
       tests/unit/transition-effects/scanner-sequence.test.js
git commit -m "feat(scanner): implement REVEAL phase — staggered region entrance, fading status text"
```

---

### Task 5: Export ScannerSequence from Barrel

**Files:**
- Modify: `prototype/multi-region-art/effects/index.js`

**Step 1: Update barrel export**

In `prototype/multi-region-art/effects/index.js`, add:

```js
export { TransitionEffectManager } from './transition-manager.js';
export { ScannerSequence } from './scanner-sequence.js';
```

**Step 2: Run lint to verify**

Run: `npx eslint prototype/multi-region-art/effects/`
Expected: 0 errors

**Step 3: Commit**

```bash
git add prototype/multi-region-art/effects/index.js
git commit -m "feat(scanner): export ScannerSequence from effects barrel"
```

---

### Task 6: Integrate into `multi-region.js` — Wire Up Scanner

**Files:**
- Modify: `prototype/multi-region-art/multi-region.js:15` (import)
- Modify: `prototype/multi-region-art/multi-region.js:1174` (handleDemoSelection)
- Modify: `prototype/multi-region-art/multi-region.js:1510` (triggerFirstSegmentation guard)
- Modify: `prototype/multi-region-art/multi-region.js:1524` (region rendering gate)
- Modify: `prototype/multi-region-art/multi-region.js:1547` (scanner update call)

**Step 1: Add import and instance**

At `multi-region.js:15`, change:

```js
import { TransitionEffectManager } from './effects/index.js';
```

to:

```js
import { TransitionEffectManager, ScannerSequence } from './effects/index.js';
```

After line 16, add:

```js
const scannerSequence = new ScannerSequence({
  onLockOn: () => {
    // Trigger existing shimmer effects during LOCK_ON
    const w = elements.canvas.width;
    const h = elements.canvas.height;
    if (transitionEffects._lastContour) {
      transitionEffects.triggerFirstSegmentation(
        transitionEffects._lastMask,
        transitionEffects._lastMaskW,
        transitionEffects._lastMaskH,
        w, h, performance.now()
      );
    }
  },
  onComplete: () => {
    // Scanner done — ensure regions are fully visible
  },
});
```

**Step 2: Modify `handleDemoSelection` to start scanner**

At line 1175 (inside `handleDemoSelection`), after `hideWelcomeModal()`, add:

```js
  // Start scanner sequence for first-time users
  scannerSequence.start();
```

**Step 3: Guard `triggerFirstSegmentation` — don't auto-fire during scanner**

At line 1510, wrap the existing call:

```js
        // Trigger first-segmentation transition effects
        // (skip if scanner sequence is managing effects)
        if (!scannerSequence.isActive) {
          transitionEffects.triggerFirstSegmentation(
            personMask, maskWidth, maskHeight,
            elements.canvas.width, elements.canvas.height, timestamp
          );
        }
```

**Step 4: Feed detection data to scanner**

After the `updateContourCache` call at line 1505, add:

```js
        // Feed live data to scanner sequence if active
        if (scannerSequence.isActive) {
          scannerSequence.setDetectionData({
            contour: transitionEffects._lastContour,
            mask: personMask,
            maskW: maskWidth,
            maskH: maskHeight,
          });
        }
```

**Step 5: Gate region rendering on scanner state**

At line 1524, wrap the existing region rendering block:

```js
  // Gate region rendering on scanner sequence
  const scannerHidesRegions = scannerSequence.isActive
    && scannerSequence.phase !== 'REVEAL'
    && scannerSequence.phase !== 'DONE';

  if (hasArtRegions && !scannerHidesRegions) {
```

For the REVEAL phase, each region's draw needs an entrance multiplier. After line 1533 (the `renderRegionWithArt` call), wrap with opacity:

```js
        // Apply scanner entrance animation during REVEAL
        const regionIdx = state.regions.filter(r => r.active && r.art).indexOf(region);
        const entrance = scannerSequence.getRegionEntrance(regionIdx);
        if (entrance < 1) {
          ctx.save();
          ctx.globalAlpha = entrance;
          const scale = 0.8 + 0.2 * entrance;
          const corners = region.corners;
          const rcx = (corners.topLeft.x + corners.bottomRight.x) / 2;
          const rcy = (corners.topLeft.y + corners.bottomRight.y) / 2;
          ctx.translate(rcx, rcy);
          ctx.scale(scale, scale);
          ctx.translate(-rcx, -rcy);
        }

        renderRegionWithArt(region, personMask, maskWidth, maskHeight);

        if (entrance < 1) {
          ctx.restore();
        }
```

**Step 6: Add scanner update call**

At line 1547, before the existing `transitionEffects.update()`, add:

```js
  // Draw scanner sequence on top
  scannerSequence.update(ctx, timestamp, elements.canvas.width, elements.canvas.height);
```

**Step 7: Run lint**

Run: `npx eslint prototype/multi-region-art/multi-region.js`
Expected: 0 errors (warnings OK)

**Step 8: Commit**

```bash
git add prototype/multi-region-art/multi-region.js
git commit -m "feat(scanner): integrate ScannerSequence into multi-region render loop"
```

---

### Task 7: Skip Button

**Files:**
- Modify: `prototype/multi-region-art/effects/scanner-sequence.js`

**Step 1: Add skip button creation/removal to ScannerSequence**

Add to `start()`:

```js
start() {
  this.phase = 'WAITING';
  this._phaseStartTime = performance.now();
  this._createSkipButton();
}
```

Add methods:

```js
_createSkipButton() {
  if (typeof document === 'undefined') return;
  this._skipBtn = document.createElement('button');
  this._skipBtn.textContent = 'Skip';
  Object.assign(this._skipBtn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '10001',
    background: 'rgba(10, 10, 12, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.7)',
    padding: '10px 20px',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    cursor: 'pointer',
    minWidth: '44px',
    minHeight: '44px',
    backdropFilter: 'blur(4px)',
  });
  this._skipBtn.addEventListener('click', () => this.skip());
  document.body.appendChild(this._skipBtn);
}

_removeSkipButton() {
  if (this._skipBtn && this._skipBtn.parentNode) {
    this._skipBtn.parentNode.removeChild(this._skipBtn);
    this._skipBtn = null;
  }
}
```

Add cleanup to `_enterPhase`:

```js
_enterPhase(phase) {
  this.phase = phase;
  this._phaseStartTime = performance.now();
  if (phase === 'LOCK_ON' && this._onLockOn) {
    this._onLockOn();
  }
  if (phase === 'DONE') {
    this._removeSkipButton();
    if (this._onComplete) this._onComplete();
  }
}
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/transition-effects/scanner-sequence.test.js`
Expected: PASS — tests use mocked document or no document

**Step 3: Commit**

```bash
git add prototype/multi-region-art/effects/scanner-sequence.js
git commit -m "feat(scanner): add skip button with auto-cleanup"
```

---

### Task 8: Run All Checks & Fix

**Step 1: Lint**

Run: `npm run lint`
Expected: 0 errors

**Step 2: Unit tests**

Run: `npm run test:unit`
Expected: all pass

**Step 3: Type check**

Run: `npm run typecheck`
Expected: clean

**Step 4: Knip**

Run: `npm run knip`
Expected: clean

**Step 5: Fix any issues, commit**

```bash
git add -A
git commit -m "chore: fix lint/test/type issues from scanner integration"
```

---

### Task 9: Manual Browser Verification

**Step 1: Start dev server**

Run: `cd prototype/multi-region-art && python3 -m http.server 3210`

**Step 2: Open in browser**

Open `http://localhost:3210/multi-region.html`

**Step 3: Verify scanner sequence**

1. Clear localStorage (to trigger first-time flow): `localStorage.clear()` in console, refresh
2. Welcome modal should appear
3. Pick any demo scene
4. Verify: scan line sweeps top→bottom revealing contour (~3s)
5. Verify: face mesh + skeleton flash on with pulse ring (~2s)
6. Verify: art regions fade/scale in with stagger (~2s)
7. Verify: skip button works (click during any phase)
8. Verify: returning users (refresh) go straight to app, no scanner

**Step 4: Commit any browser-discovered fixes**

```bash
git add -A
git commit -m "fix(scanner): browser-tested adjustments"
```
