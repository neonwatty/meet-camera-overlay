/**
 * PortalDissolveEffect — one region becomes a portal where person
 * mask inverts, making you appear to step into the art.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class PortalDissolveEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 12000;
    this._manager = null;
    this._portalRegionId = null;
  }

  onTrigger(_ts, manager, _contour) {
    this._manager = manager;

    const regions = manager.getRegions();
    let maxArea = 0;
    let portalId = null;
    for (const r of regions) {
      const w = Math.abs(r.region.topRight.x - r.region.topLeft.x);
      const h = Math.abs(r.region.bottomLeft.y - r.region.topLeft.y);
      const area = w * h;
      if (area > maxArea) { maxArea = area; portalId = r.id; }
    }
    this._portalRegionId = portalId;
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager || !this._portalRegionId) return;

    let intensity;
    if (elapsed < 3000) {
      intensity = easeOutCubic(elapsed / 3000);
    } else if (progress > 0.75) {
      intensity = 1 - easeOutCubic((progress - 0.75) / 0.25);
    } else {
      intensity = 1;
    }

    if (intensity > 0.05) {
      this._manager.setPortalRegion(this._portalRegionId, intensity);
    } else {
      this._manager.setPortalRegion(null, 0);
    }

    // Dissolve edge glow
    if (intensity > 0.1) {
      const region = this._manager.getRegions().find(r => r.id === this._portalRegionId);
      if (region) {
        this._renderDissolveEdge(ctx, region, intensity, elapsed, w, h);
      }
    }
  }

  _renderDissolveEdge(ctx, region, intensity, elapsed, w, h) {
    const r = region.region;
    const corners = {
      topLeft: { x: r.topLeft.x / 100 * w, y: r.topLeft.y / 100 * h },
      topRight: { x: r.topRight.x / 100 * w, y: r.topRight.y / 100 * h },
      bottomLeft: { x: r.bottomLeft.x / 100 * w, y: r.bottomLeft.y / 100 * h },
      bottomRight: { x: r.bottomRight.x / 100 * w, y: r.bottomRight.y / 100 * h },
    };

    const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 0.005);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(100, 200, 255, ${intensity * shimmer * 0.6})`;
    ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
