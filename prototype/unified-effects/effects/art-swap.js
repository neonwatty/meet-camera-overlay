/**
 * ArtSwapEffect — raise hand near a region to cycle its image through a gallery.
 * Toggle mode: click on/off, only one gesture mode active at a time.
 */

import { BaseEffect } from './base-effect.js';

export class ArtSwapEffect extends BaseEffect {
  constructor() {
    super();
    this.isToggle = true;
    this.duration = Infinity;
    this._manager = null;
    this._smoothedRaise = [0, 0];
    this._ema = 0.3;
    this._lastSwapTime = 0;
    this._swapCooldown = 1500;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedRaise = [0, 0];
    this._lastSwapTime = 0;
  }

  onDeactivate() {
    if (this._manager) {
      this._manager._artSwapRequest = null;
    }
    this._manager = null;
  }

  render(ctx, _progress, elapsed, w, h) {
    if (!this._manager) return;
    const now = this.startTime + elapsed;

    const poseLM = this._manager.getCachedPoseLandmarks();
    this._detectHandRaise(poseLM);

    const maxRaise = Math.max(...this._smoothedRaise);
    if (maxRaise > 0.3 && poseLM) {
      const nearestInfo = this._findNearestRegion(poseLM, w, h);
      if (nearestInfo && (now - this._lastSwapTime) > this._swapCooldown) {
        this._triggerSwap(nearestInfo.regionId, now);
      }
      if (nearestInfo) {
        this._renderGlow(ctx, nearestInfo.corners, maxRaise, elapsed);
      }
    }

    // Advance crossfade
    this._updateCrossfade(now);
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

  _findNearestRegion(poseLM, w, h) {
    const regions = this._manager.getRegions();
    const side = this._smoothedRaise[0] > this._smoothedRaise[1] ? 0 : 1;
    const wrist = poseLM[side === 0 ? 15 : 16];
    if (!wrist) return null;

    let nearest = null;
    let nearestId = null;
    let minDist = Infinity;
    for (const region of regions) {
      const c = this._toPixels(region, w, h);
      const cx = (c.topLeft.x + c.bottomRight.x) / 2;
      const cy = (c.topLeft.y + c.bottomRight.y) / 2;
      const dist = Math.hypot(wrist.x - cx, wrist.y - cy);
      if (dist < minDist) { minDist = dist; nearest = c; nearestId = region.id; }
    }
    return nearest ? { corners: nearest, regionId: nearestId } : null;
  }

  _triggerSwap(regionId, now) {
    const gallery = this._manager._artGalleries.get(regionId);
    if (!gallery || gallery.length < 2) return;

    const currentIdx = this._manager._artGalleryIndex.get(regionId) || 0;
    const prevImage = gallery[currentIdx];
    const nextIdx = (currentIdx + 1) % gallery.length;
    this._manager._artGalleryIndex.set(regionId, nextIdx);
    this._lastSwapTime = now;

    this._manager._artSwapRequest = {
      regionId,
      prevImage,
      crossfadeStart: now,
      crossfadeDuration: 400,
    };
  }

  _updateCrossfade(now) {
    const req = this._manager._artSwapRequest;
    if (!req) return;
    const elapsed = now - req.crossfadeStart;
    if (elapsed > req.crossfadeDuration) {
      this._manager._artSwapRequest = null;
    }
  }

  _renderGlow(ctx, corners, intensity, elapsed) {
    ctx.save();
    const pulse = 0.4 + 0.3 * Math.sin(elapsed * 0.006);
    const alpha = intensity * pulse;
    ctx.shadowColor = `rgba(100, 200, 255, ${alpha})`;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
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
