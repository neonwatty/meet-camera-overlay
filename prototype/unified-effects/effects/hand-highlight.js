/**
 * HandHighlightEffect — raising a hand highlights the nearest art region
 * with a pulsing orange border.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class HandHighlightEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 20000;
    this._manager = null;
    this._smoothedRaise = [0, 0];
    this._ema = 0.3;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedRaise = [0, 0];
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager) return;
    const fade = progress > 0.85 ? 1 - easeOutCubic((progress - 0.85) / 0.15) : 1;

    const poseLM = this._manager.getCachedPoseLandmarks();
    this._detectHandRaise(poseLM);

    const maxRaise = Math.max(...this._smoothedRaise);
    if (maxRaise > 0.3 && poseLM) {
      this._renderHighlight(ctx, poseLM, fade, elapsed, w, h, maxRaise);
    }
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

  _renderHighlight(ctx, poseLM, fade, elapsed, w, h, maxRaise) {
    const regions = this._manager.getRegions();
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

    ctx.save();
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
    ctx.restore();
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
