/**
 * EdgeWireframeFlashEffect — Sobel edge detection overlay
 * that fades in with screen blend mode.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic, sobelEdgeDetect } from './utils.js';

export class EdgeWireframeFlashEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 8000;
    this.edgeCanvas = null;
    this.renderW = 0;
    this.renderH = 0;
  }

  onTrigger(_timestamp, videoSource, canvasW, canvasH) {
    const scale = 0.5;
    const sw = Math.floor(canvasW * scale);
    const sh = Math.floor(canvasH * scale);
    this.edgeCanvas = sobelEdgeDetect(videoSource, sw, sh);
    this.renderW = canvasW;
    this.renderH = canvasH;
  }

  render(ctx, progress) {
    if (!this.edgeCanvas) return;
    const fade = 1 - easeOutCubic(progress);

    ctx.save();
    ctx.globalAlpha = fade * 0.7;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(
      this.edgeCanvas, 0, 0, this.renderW, this.renderH
    );
    ctx.restore();
  }
}
