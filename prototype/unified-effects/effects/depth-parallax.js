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
    this._parallaxStrength = 30;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
  }

  render(_ctx, progress, elapsed, w, h) {
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
  }
}
