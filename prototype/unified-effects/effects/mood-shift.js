/**
 * MoodShiftEffect — smile intensity continuously shifts color temperature
 * of art regions. Toggle mode: click on/off.
 */

import { BaseEffect } from './base-effect.js';

export class MoodShiftEffect extends BaseEffect {
  constructor() {
    super();
    this.isToggle = true;
    this.duration = Infinity;
    this._manager = null;
    this._smoothedSmile = 0;
    this._ema = 0.15;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
    this._smoothedSmile = 0;
  }

  onDeactivate() {
    if (this._manager) {
      this._manager._warmthIntensity = 0;
    }
    this._manager = null;
  }

  render(ctx, _progress, _elapsed, w, _h) {
    if (!this._manager) return;

    const faceLM = this._manager.getCachedFaceLandmarks();
    this._detectSmile(faceLM);

    // Map smile ratio to warmth intensity (0 = neutral, 1 = full warm)
    this._manager._warmthIntensity = this._smoothedSmile;

    // Small HUD indicator
    this._renderHud(ctx, w);
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

    // Map 0.28-0.45 range to 0-1
    const normalized = Math.max(0, Math.min(1, (smileRatio - 0.28) / 0.17));
    this._smoothedSmile += (normalized - this._smoothedSmile) * this._ema;
  }

  _renderHud(ctx, w) {
    const val = this._manager._warmthIntensity;
    ctx.save();
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';

    // Warmth bar background
    const barX = w - 90;
    const barY = 10;
    const barW = 50;
    const barH = 6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(barX, barY, barW, barH);

    // Warmth bar fill
    const r = Math.round(255);
    const g = Math.round(190 - val * 65);
    const b = Math.round(115 - val * 115);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.fillRect(barX, barY, barW * val, barH);

    ctx.fillStyle = 'rgba(255, 200, 100, 0.6)';
    ctx.fillText(`warmth ${(val * 100).toFixed(0)}%`, w - 12, 28);
    ctx.restore();
  }
}
