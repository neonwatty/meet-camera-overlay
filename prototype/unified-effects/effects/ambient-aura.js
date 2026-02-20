/**
 * AmbientAuraEffect — colored glow radiating from person contour,
 * tinted by nearest region's dominant art color.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class AmbientAuraEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 12000;
    this._contour = [];
    this._regionColors = [];
    this._regionCenters = [];
  }

  onTrigger(_ts, contour, regionColors, regionCenters) {
    this._contour = contour || [];
    this._regionColors = regionColors || [];
    this._regionCenters = regionCenters || [];
  }

  render(ctx, progress, elapsed) {
    if (this._contour.length === 0 || this._regionColors.length === 0) return;

    const fadeIn = Math.min(elapsed / 2000, 1);
    const fadeOut = progress > 0.75 ? 1 - easeOutCubic((progress - 0.75) / 0.25) : 1;
    const fade = fadeIn * fadeOut;
    const breath = 0.3 + 0.3 * Math.sin(elapsed * 0.003);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const step = Math.max(1, Math.floor(this._contour.length / 40));
    for (let i = 0; i < this._contour.length; i += step) {
      const p = this._contour[i];
      const color = this._nearestRegionColor(p);
      const radius = 40 + 40 * Math.sin(elapsed * 0.002 + i * 0.1);

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${fade * breath})`);
      grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    }

    ctx.restore();
  }

  _nearestRegionColor(point) {
    let minDist = Infinity;
    let color = { r: 255, g: 200, b: 100 };
    for (let i = 0; i < this._regionCenters.length; i++) {
      const c = this._regionCenters[i];
      const dist = Math.hypot(point.x - c.x, point.y - c.y);
      if (dist < minDist) {
        minDist = dist;
        color = this._regionColors[i] || color;
      }
    }
    return color;
  }
}
