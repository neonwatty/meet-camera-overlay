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
    this._skipBtn = null;
  }

  // ---- Public API ----

  get isActive() {
    return this.phase !== 'IDLE' && this.phase !== 'DONE';
  }

  start() {
    this._createSkipButton();
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
    // Each region gets at least 400ms to animate, even at high indices
    const duration = Math.max(DURATIONS.REVEAL - delay, 400);
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
      if (progress >= 1) {
        this._computePersonCenter();
        this._setPhase('LOCK_ON', timestamp);
      }
    } else if (this.phase === 'LOCK_ON') {
      const progress = Math.min(elapsed / duration, 1);
      this._renderLockOn(ctx, progress, elapsed, w, h);
      if (progress >= 1) {
        this._setPhase('REVEAL', timestamp);
      }
    } else if (this.phase === 'REVEAL') {
      this._revealElapsed = elapsed;
      const progress = Math.min(elapsed / duration, 1);
      this._renderReveal(ctx, progress, w, h);
      if (progress >= 1) {
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
    if (phase === 'DONE') {
      this._removeSkipButton();
      if (this.onComplete) this.onComplete();
    }
  }

  // ---- Rendering: SCAN ----

  _renderScan(ctx, progress, _elapsed, w, h) {
    const scanY = progress * h;

    ctx.save();

    // Trailing glow gradient (80px above scan line)
    const glowTop = Math.max(0, scanY - 80);
    const grad = ctx.createLinearGradient(0, glowTop, 0, scanY);
    grad.addColorStop(0, 'rgba(0, 255, 65, 0)');
    grad.addColorStop(1, 'rgba(0, 255, 65, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, glowTop, w, scanY - glowTop);

    // Bright core scan line
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(w, scanY);
    ctx.stroke();

    // Progressive contour reveal (only points above scanY)
    if (this._contour.length > 0) {
      ctx.strokeStyle = 'rgba(0, 255, 65, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (const p of this._contour) {
        if (p.y <= scanY) {
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
      }
      if (started) ctx.stroke();
    }

    // Green mask overlay fades in with progress
    if (this._maskOverlay) {
      ctx.globalAlpha = progress * 0.15;
      ctx.globalCompositeOperation = 'screen';
      this._drawOverlay(ctx);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    this._drawStatusText(ctx, 'ANALYZING SUBJECT...', w, h);
  }

  // ---- Rendering: LOCK_ON ----

  _renderLockOn(ctx, progress, elapsed, w, h) {
    ctx.save();

    const center = this._personCenter || { x: w / 2, y: h / 2 };
    const shimmer = 0.6 + 0.4 * Math.sin(elapsed * 0.006);

    // Pulse ring expanding outward from center
    const ringRadius = 40 + progress * 120;
    const ringAlpha = (1 - progress) * 0.5;
    ctx.strokeStyle = `rgba(0, 255, 65, ${ringAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Full contour with shimmer
    if (this._contour.length > 0) {
      ctx.strokeStyle = `rgba(0, 255, 65, ${shimmer * 0.8})`;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < this._contour.length; i++) {
        const p = this._contour[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();

      // 4 scanning dots orbiting contour
      const dotCount = 4;
      const scanSpeed = elapsed * 0.002;
      for (let d = 0; d < dotCount; d++) {
        const t = (scanSpeed + d / dotCount) % 1;
        const idx = Math.floor(t * this._contour.length);
        const p = this._contour[idx % this._contour.length];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 200, ${shimmer})`;
        ctx.fill();
      }
    }

    // Mask overlay at higher intensity
    if (this._maskOverlay) {
      ctx.globalAlpha = shimmer * 0.25;
      ctx.globalCompositeOperation = 'screen';
      this._drawOverlay(ctx);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    this._drawStatusText(ctx, 'SUBJECT LOCKED', w, h);
  }

  // ---- Rendering: REVEAL ----

  _renderReveal(ctx, progress, w, h) {
    // "SCENE READY" text fades in during first half, then holds
    const textAlpha = Math.min(progress / 0.5, 1);
    ctx.save();
    ctx.globalAlpha = textAlpha;
    this._drawStatusText(ctx, 'SCENE READY', w, h);
    ctx.restore();
  }

  // ---- Helpers ----

  _createSkipButton() {
    this._removeSkipButton();
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
    ctx.drawImage(this._maskOverlay, 0, 0);
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
