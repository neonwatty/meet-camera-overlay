/**
 * HeadTiltEffect — detects head tilt and shows angle readout.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class HeadTiltEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 20000;
    this._manager = null;
    this._smoothedTilt = 0;
    this._ema = 0.3;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedTilt = 0;
  }

  render(ctx, progress, _elapsed, w, _h) {
    if (!this._manager) return;
    const fade = progress > 0.85 ? 1 - easeOutCubic((progress - 0.85) / 0.15) : 1;

    const faceLM = this._manager.getCachedFaceLandmarks();
    this._detectTilt(faceLM);

    if (Math.abs(this._smoothedTilt) > 0.05) {
      const degrees = (this._smoothedTilt * 180 / Math.PI).toFixed(1);
      ctx.save();
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(0, 255, 65, ${fade * 0.6})`;
      ctx.textAlign = 'right';
      ctx.fillText(`tilt: ${degrees}\u00B0`, w - 12, 20);
      ctx.restore();
    }
  }

  _detectTilt(faceLM) {
    if (!faceLM || faceLM.length < 264) return;
    const eyeL = faceLM[33];
    const eyeR = faceLM[263];
    if (!eyeL || !eyeR) return;
    const angle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
    this._smoothedTilt += (angle - this._smoothedTilt) * this._ema;
  }
}
