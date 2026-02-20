/**
 * RegionReactivityEffect — art responds to gestures:
 * smile → warm hue overlay, hand raise → pulse border, head tilt → indicator.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class RegionReactivityEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 20000;
    this._manager = null;
    this._smoothedSmile = 0;
    this._smoothedTilt = 0;
    this._smoothedRaise = [0, 0];
    this._ema = 0.3;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedSmile = 0;
    this._smoothedTilt = 0;
    this._smoothedRaise = [0, 0];
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager) return;
    const fade = progress > 0.85 ? 1 - easeOutCubic((progress - 0.85) / 0.15) : 1;

    const faceLM = this._manager.getCachedFaceLandmarks();
    const poseLM = this._manager.getCachedPoseLandmarks();
    const regions = this._manager.getRegions();

    this._detectSmile(faceLM);
    this._detectTilt(faceLM);
    this._detectHandRaise(poseLM);

    ctx.save();

    // Smile warmth overlay
    if (this._smoothedSmile > 0.2) {
      this._renderSmileWarmth(ctx, regions, fade, w, h);
    }

    // Hand raise highlight
    const maxRaise = Math.max(...this._smoothedRaise);
    if (maxRaise > 0.3 && poseLM) {
      this._renderHandHighlight(ctx, regions, poseLM, fade, elapsed, w, h, maxRaise);
    }

    // Tilt indicator
    if (Math.abs(this._smoothedTilt) > 0.05) {
      const degrees = (this._smoothedTilt * 180 / Math.PI).toFixed(1);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(0, 255, 65, ${fade * 0.4})`;
      ctx.textAlign = 'right';
      ctx.fillText(`tilt: ${degrees}\u00B0`, w - 12, 20);
    }

    ctx.restore();
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

  _detectTilt(faceLM) {
    if (!faceLM || faceLM.length < 264) return;
    const eyeL = faceLM[33];
    const eyeR = faceLM[263];
    if (!eyeL || !eyeR) return;
    const angle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
    this._smoothedTilt += (angle - this._smoothedTilt) * this._ema;
  }

  _detectHandRaise(poseLM) {
    if (!poseLM || poseLM.length < 17) return;
    for (let side = 0; side < 2; side++) {
      const wrist = poseLM[side === 0 ? 15 : 16];
      const shoulder = poseLM[side === 0 ? 11 : 12];
      if (wrist && shoulder) {
        const raised = wrist.y < shoulder.y ? 1 : 0;
        this._smoothedRaise[side] += (raised - this._smoothedRaise[side]) * this._ema;
      }
    }
  }

  _renderSmileWarmth(ctx, regions, fade, w, h) {
    const warmth = this._smoothedSmile * fade;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = warmth * 0.5;
    ctx.fillStyle = 'rgba(255, 180, 60, 0.7)';
    for (const region of regions) {
      const c = this._toPixels(region, w, h);
      ctx.beginPath();
      ctx.moveTo(c.topLeft.x, c.topLeft.y);
      ctx.lineTo(c.topRight.x, c.topRight.y);
      ctx.lineTo(c.bottomRight.x, c.bottomRight.y);
      ctx.lineTo(c.bottomLeft.x, c.bottomLeft.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  _renderHandHighlight(ctx, regions, poseLM, fade, elapsed, w, h, maxRaise) {
    const side = this._smoothedRaise[0] > this._smoothedRaise[1] ? 0 : 1;
    const wrist = poseLM[side === 0 ? 15 : 16];
    if (!wrist) return;

    let nearest = null;
    let minDist = Infinity;
    for (const region of regions) {
      const c = this._toPixels(region, w, h);
      const cx = (c.topLeft.x + c.bottomRight.x) / 2;
      const cy = (c.topLeft.y + c.bottomRight.y) / 2;
      const dist = Math.hypot(wrist.x - cx, wrist.y - cy);
      if (dist < minDist) { minDist = dist; nearest = c; }
    }
    if (!nearest) return;

    const pulse = 2 + 4 * Math.sin(elapsed * 0.008);
    ctx.strokeStyle = `rgba(232, 93, 4, ${maxRaise * fade * 0.8})`;
    ctx.lineWidth = pulse;
    ctx.beginPath();
    ctx.moveTo(nearest.topLeft.x, nearest.topLeft.y);
    ctx.lineTo(nearest.topRight.x, nearest.topRight.y);
    ctx.lineTo(nearest.bottomRight.x, nearest.bottomRight.y);
    ctx.lineTo(nearest.bottomLeft.x, nearest.bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
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
