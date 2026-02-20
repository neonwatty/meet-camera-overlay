/**
 * EnvironmentalGlowEffect — simulates light spill from wall art
 * regions onto the person using inverse-square color falloff.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class EnvironmentalGlowEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 15000;
    this._contour = [];
    this._regionColors = [];
    this._regionCenters = [];
    this._brightnessMult = 1.0;
    this._glowCanvas = null;
    this._lastRebuildTime = 0;
    this._manager = null;
  }

  onTrigger(_ts, contour, regionColors, regionCenters, brightnessMult, manager) {
    this._contour = contour || [];
    this._regionColors = regionColors || [];
    this._regionCenters = regionCenters || [];
    this._brightnessMult = brightnessMult || 1.0;
    this._manager = manager;
    this._glowCanvas = null;
    this._lastRebuildTime = 0;
  }

  render(ctx, progress, elapsed, w, h) {
    if (this._contour.length === 0 || this._regionColors.length === 0) return;

    // Refresh contour from manager
    if (this._manager) {
      const contour = this._manager.getCachedContour();
      if (contour && contour.length > 0) this._contour = contour;
    }

    const now = this.startTime + elapsed;
    if (!this._glowCanvas || now - this._lastRebuildTime > 200) {
      this._rebuildGlow(w, h);
      this._lastRebuildTime = now;
    }

    if (!this._glowCanvas) return;

    const fadeIn = Math.min(elapsed / 2000, 1);
    const fadeOut = progress > 0.8 ? 1 - easeOutCubic((progress - 0.8) / 0.2) : 1;
    const fade = fadeIn * fadeOut;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fade * this._brightnessMult * 0.6;
    ctx.drawImage(this._glowCanvas, 0, 0);
    ctx.restore();
  }

  _rebuildGlow(w, h) {
    if (!this._glowCanvas) {
      this._glowCanvas = new OffscreenCanvas(w, h);
    }
    const gCtx = this._glowCanvas.getContext('2d');
    gCtx.clearRect(0, 0, w, h);

    const step = Math.max(1, Math.floor(this._contour.length / 60));
    for (let i = 0; i < this._contour.length; i += step) {
      const p = this._contour[i];
      let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;

      for (let j = 0; j < this._regionCenters.length; j++) {
        const c = this._regionCenters[j];
        const color = this._regionColors[j];
        if (!color) continue;
        const dist = Math.max(50, Math.hypot(p.x - c.x, p.y - c.y));
        const weight = 10000 / (dist * dist);
        totalR += color.r * weight;
        totalG += color.g * weight;
        totalB += color.b * weight;
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        const r = Math.round(totalR / totalWeight);
        const g = Math.round(totalG / totalWeight);
        const b = Math.round(totalB / totalWeight);
        const grad = gCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        gCtx.fillStyle = grad;
        gCtx.fillRect(p.x - 30, p.y - 30, 60, 60);
      }
    }
  }
}
