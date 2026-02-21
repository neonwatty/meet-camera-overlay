/**
 * PerspectiveShiftEffect — head tilt angle skews art region corners
 * for a 3D perspective feel. Toggle mode: click on/off.
 */

import { BaseEffect } from './base-effect.js';

const MAX_OFFSET = 20;

export class PerspectiveShiftEffect extends BaseEffect {
  constructor() {
    super();
    this.isToggle = true;
    this.duration = Infinity;
    this._manager = null;
    this._smoothedTilt = 0;
    this._ema = 0.2;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedTilt = 0;
  }

  onDeactivate() {
    if (this._manager) {
      this._manager._tiltCornerOffsets = null;
    }
    this._manager = null;
  }

  render(ctx, _progress, _elapsed, w, _h) {
    if (!this._manager) return;

    const faceLM = this._manager.getCachedFaceLandmarks();
    this._detectTilt(faceLM);

    // Compute per-region asymmetric corner offsets
    const regions = this._manager.getRegions();
    const offsets = {};
    const tiltNorm = Math.max(-1, Math.min(1, this._smoothedTilt * 5));

    for (const region of regions) {
      // Tilt right -> left corners shift down, right corners shift up
      const yShift = tiltNorm * MAX_OFFSET;
      offsets[region.id] = {
        topLeft: { x: 0, y: yShift },
        topRight: { x: 0, y: -yShift },
        bottomLeft: { x: 0, y: yShift },
        bottomRight: { x: 0, y: -yShift },
      };
    }
    this._manager._tiltCornerOffsets = offsets;

    // Small HUD indicator
    this._renderHud(ctx, w);
  }

  _detectTilt(faceLM) {
    if (!faceLM || faceLM.length < 264) return;
    const eyeL = faceLM[33];
    const eyeR = faceLM[263];
    if (!eyeL || !eyeR) return;
    const angle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
    this._smoothedTilt += (angle - this._smoothedTilt) * this._ema;
  }

  _renderHud(ctx, w) {
    const degrees = (this._smoothedTilt * 180 / Math.PI).toFixed(1);
    const tiltNorm = Math.max(-1, Math.min(1, this._smoothedTilt * 5));
    ctx.save();
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';

    // Tilt indicator bar
    const barX = w - 90;
    const barY = 10;
    const barW = 50;
    const barH = 6;
    const midX = barX + barW / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(barX, barY, barW, barH);

    const fillW = Math.abs(tiltNorm) * (barW / 2);
    const fillX = tiltNorm > 0 ? midX : midX - fillW;
    ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
    ctx.fillRect(fillX, barY, fillW, barH);

    ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.fillText(`tilt ${degrees}\u00B0`, w - 12, 28);
    ctx.restore();
  }
}
