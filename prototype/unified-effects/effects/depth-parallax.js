/**
 * DepthParallaxEffect — wall art shifts as you move your head,
 * creating a window-into-deeper-space illusion.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class DepthParallaxEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 15000;
    this._manager = null;
    this._parallaxStrength = 120;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
  }

  render(ctx, progress, elapsed, w, h) {
    if (!this._manager) return;

    const faceLandmarks = this._manager.getCachedFaceLandmarks();
    if (!faceLandmarks || faceLandmarks.length === 0) return;

    const nose = faceLandmarks[1];
    if (!nose) return;

    const rampIn = Math.min(elapsed / 1000, 1);
    const rampOut = progress > 0.87 ? 1 - easeOutCubic((progress - 0.87) / 0.13) : 1;
    const strength = rampIn * rampOut * this._parallaxStrength;

    const centerX = w / 2;
    const centerY = h / 2;
    const offsetX = (nose.x - centerX) / centerX;
    const offsetY = (nose.y - centerY) / centerY;

    const regions = this._manager.getRegions();
    const offsets = regions.map((region) => {
      const regionCX = (region.region.topLeft.x + region.region.bottomRight.x) / 2;
      const distFromCenter = Math.abs(regionCX - 50) / 50;
      const depth = 0.5 + distFromCenter * 0.5;
      return {
        panX: -offsetX * strength * depth,
        panY: -offsetY * strength * depth * 0.5,
      };
    });

    this._manager._parallaxOffsets = offsets;

    // Visual indicator: crosshair at nose position
    const alpha = rampIn * rampOut * 0.4;
    if (alpha > 0.02) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 255, 65, ${alpha})`;
      ctx.lineWidth = 1;
      const nx = nose.x;
      const ny = nose.y;
      ctx.beginPath();
      ctx.moveTo(nx - 12, ny);
      ctx.lineTo(nx + 12, ny);
      ctx.moveTo(nx, ny - 12);
      ctx.lineTo(nx, ny + 12);
      ctx.stroke();
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
      ctx.textAlign = 'left';
      ctx.fillText(`parallax: ${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}`, nx + 16, ny + 4);
      ctx.restore();
    }
  }
}
