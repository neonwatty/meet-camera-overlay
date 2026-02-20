/**
 * SmileWarmthEffect — smile triggers warm orange overlay on art regions.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class SmileWarmthEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 20000;
    this._manager = null;
    this._smoothedSmile = 0;
    this._ema = 0.3;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedSmile = 0;
  }

  render(ctx, progress, _elapsed, w, h) {
    if (!this._manager) return;
    const fade = progress > 0.85 ? 1 - easeOutCubic((progress - 0.85) / 0.15) : 1;

    const faceLM = this._manager.getCachedFaceLandmarks();
    this._detectSmile(faceLM);

    if (this._smoothedSmile > 0.2) {
      const warmth = this._smoothedSmile * fade;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = warmth * 0.5;
      ctx.fillStyle = 'rgba(255, 180, 60, 0.7)';
      for (const region of this._manager.getRegions()) {
        const c = this._toPixels(region, w, h);
        ctx.beginPath();
        ctx.moveTo(c.topLeft.x, c.topLeft.y);
        ctx.lineTo(c.topRight.x, c.topRight.y);
        ctx.lineTo(c.bottomRight.x, c.bottomRight.y);
        ctx.lineTo(c.bottomLeft.x, c.bottomLeft.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  _detectSmile(faceLM) {
    if (!faceLM || faceLM.length < 292) return;
    const mouthL = faceLM[61];
    const mouthR = faceLM[291];
    const faceL = faceLM[234];
    const faceR = faceLM[454];
    if (!mouthL || !mouthR || !faceL || !faceR) return;
    const mouthW = Math.hypot(mouthR.x - mouthL.x, mouthR.y - mouthL.y);
    const faceW = Math.hypot(faceR.x - faceL.x, faceR.y - faceL.y);
    const smileRatio = faceW > 0 ? mouthW / faceW : 0;
    const isSmiling = smileRatio > 0.33 ? 1 : 0;
    this._smoothedSmile += (isSmiling - this._smoothedSmile) * this._ema;
  }

  _toPixels(region, w, h) {
    const r = region.region;
    return {
      topLeft: { x: r.topLeft.x / 100 * w, y: r.topLeft.y / 100 * h },
      topRight: { x: r.topRight.x / 100 * w, y: r.topRight.y / 100 * h },
      bottomLeft: { x: r.bottomLeft.x / 100 * w, y: r.bottomLeft.y / 100 * h },
      bottomRight: { x: r.bottomRight.x / 100 * w, y: r.bottomRight.y / 100 * h },
    };
  }
}
