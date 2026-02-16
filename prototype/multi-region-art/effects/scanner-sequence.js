/**
 * ScannerSequence — onboarding scan effect that reveals the person
 * through phases: IDLE -> WAITING -> SCAN -> LOCK_ON -> REVEAL -> DONE.
 */

import { renderMaskOverlay } from './utils.js';

const DURATIONS = { SCAN: 3000, LOCK_ON: 2000, REVEAL: 2000 };
const REGION_STAGGER_MS = 300;

export class ScannerSequence {
  constructor() {
    this.phase = 'IDLE';
    this.onComplete = null;
    this.onLockOn = null;

    this._phaseStart = 0;
    this._contour = [];
    this._mask = null;
    this._maskW = 0;
    this._maskH = 0;
    this._maskOverlay = null;
    this._canvasW = 0;
    this._canvasH = 0;
    this._personCenter = null;
    this._revealElapsed = 0;
    this._lastTimestamp = 0;
  }

  // ---- Public API ----

  get isActive() {
    return this.phase !== 'IDLE' && this.phase !== 'DONE';
  }

  start() {
    this._setPhase('WAITING', 0);
  }

  skip() {
    this._setPhase('DONE', 0);
  }

  setDetectionData({ contour, mask, maskW, maskH }) {
    if (this.phase !== 'WAITING') return;
    if (!contour || contour.length === 0) return;

    this._contour = contour;
    this._mask = mask;
    this._maskW = maskW;
    this._maskH = maskH;

    // Pre-render mask overlay if canvas dimensions are known
    if (this._canvasW > 0 && this._canvasH > 0 && mask) {
      this._maskOverlay = renderMaskOverlay(
        mask, maskW, maskH, this._canvasW, this._canvasH
      );
    }

    this._setPhase('SCAN', this._lastTimestamp);
  }

  getRegionEntrance(regionIndex) {
    if (this.phase === 'IDLE' || this.phase === 'DONE') return 1;
    if (this.phase !== 'REVEAL') return 0;

    const delay = regionIndex * REGION_STAGGER_MS;
    const effective = this._revealElapsed - delay;
    if (effective <= 0) return 0;
    const duration = DURATIONS.REVEAL - delay;
    if (duration <= 0) return 1;
    return Math.min(effective / duration, 1);
  }

  update(ctx, timestamp, w, h) {
    this._canvasW = w;
    this._canvasH = h;
    this._lastTimestamp = timestamp;

    if (this.phase === 'IDLE' || this.phase === 'DONE' || this.phase === 'WAITING') {
      return;
    }

    const elapsed = timestamp - this._phaseStart;
    const duration = DURATIONS[this.phase];

    if (this.phase === 'SCAN') {
      const progress = Math.min(elapsed / duration, 1);
      this._renderScan(ctx, progress, elapsed, w, h);
      if (elapsed > duration) {
        this._computePersonCenter();
        this._setPhase('LOCK_ON', timestamp);
      }
    } else if (this.phase === 'LOCK_ON') {
      const progress = Math.min(elapsed / duration, 1);
      this._renderLockOn(ctx, progress, elapsed, w, h);
      if (elapsed > duration) {
        this._setPhase('REVEAL', timestamp);
      }
    } else if (this.phase === 'REVEAL') {
      this._revealElapsed = elapsed;
      const progress = Math.min(elapsed / duration, 1);
      this._renderReveal(ctx, progress, w, h);
      if (elapsed > duration) {
        this._setPhase('DONE', timestamp);
      }
    }
  }

  // ---- Phase Transitions ----

  _setPhase(phase, timestamp) {
    this.phase = phase;
    this._phaseStart = timestamp;

    if (phase === 'LOCK_ON' && this.onLockOn) {
      this.onLockOn();
    }
    if (phase === 'DONE' && this.onComplete) {
      this.onComplete();
    }
  }

  // ---- Rendering stubs (filled in subsequent commits) ----

  _renderScan(_ctx, _progress, _elapsed, _w, _h) {}

  _renderLockOn(_ctx, _progress, _elapsed, _w, _h) {}

  _renderReveal(_ctx, _progress, _w, _h) {}

  // ---- Helpers ----

  _drawStatusText(ctx, text, w, h) {
    ctx.save();
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(0, 255, 65, 0.6)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, w - 16, h - 16);
    ctx.restore();
  }

  _drawOverlay(ctx) {
    // OffscreenCanvas is a valid drawImage source in browsers.
    // In Node test environments the mock may wrap a native canvas.
    const src = this._maskOverlay._canvas || this._maskOverlay;
    ctx.drawImage(src, 0, 0);
  }

  _computePersonCenter() {
    if (this._contour.length === 0) return;
    let sx = 0;
    let sy = 0;
    for (const p of this._contour) {
      sx += p.x;
      sy += p.y;
    }
    this._personCenter = {
      x: sx / this._contour.length,
      y: sy / this._contour.length,
    };
  }
}
