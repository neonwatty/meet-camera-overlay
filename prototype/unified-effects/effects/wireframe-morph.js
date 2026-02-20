/**
 * WireframeMorphEffect — face/pose mesh cycles through 4 visual styles
 * (Matrix → Blueprint → Neon → Circuit) with color cross-fading.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

const STYLES = [
  { name: 'matrix', color: [0, 255, 65], lineWidth: 1.2, glow: 0, nodeRadius: 0 },
  { name: 'blueprint', color: [68, 136, 255], lineWidth: 0.8, glow: 0, nodeRadius: 3 },
  { name: 'neon', color: [255, 68, 170], lineWidth: 2, glow: 8, nodeRadius: 4 },
  { name: 'circuit', color: [255, 170, 0], lineWidth: 1, glow: 0, nodeRadius: 2 },
];

const STYLE_DURATION = 4000;

export class WireframeMorphEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = STYLE_DURATION * STYLES.length;
    this._manager = null;
  }

  onTrigger(_ts, manager) {
    this._manager = manager;
  }

  render(ctx, progress, elapsed) {
    if (!this._manager) return;
    const faceLM = this._manager.getCachedFaceLandmarks();
    const poseLM = this._manager.getCachedPoseLandmarks();
    if (!faceLM && !poseLM) return;

    const styleProgress = elapsed / STYLE_DURATION;
    const currentIdx = Math.min(Math.floor(styleProgress), STYLES.length - 1);
    const nextIdx = Math.min(currentIdx + 1, STYLES.length - 1);
    const blend = styleProgress - currentIdx;

    const crossFade = blend > 0.875 ? (blend - 0.875) / 0.125 : 0;
    const current = STYLES[currentIdx];
    const next = STYLES[nextIdx];

    const r = Math.round(current.color[0] + (next.color[0] - current.color[0]) * crossFade);
    const g = Math.round(current.color[1] + (next.color[1] - current.color[1]) * crossFade);
    const b = Math.round(current.color[2] + (next.color[2] - current.color[2]) * crossFade);
    const lw = current.lineWidth + (next.lineWidth - current.lineWidth) * crossFade;
    const glow = current.glow + (next.glow - current.glow) * crossFade;
    const nodeR = current.nodeRadius + (next.nodeRadius - current.nodeRadius) * crossFade;

    const overallFade = progress > 0.9 ? 1 - easeOutCubic((progress - 0.9) / 0.1) : 1;

    ctx.save();
    ctx.globalAlpha = overallFade;

    if (glow > 0) {
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.shadowBlur = glow;
    }

    // Pose skeleton
    if (poseLM && this._manager._poseConnections) {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
      ctx.lineWidth = lw + 1;
      ctx.lineCap = 'round';
      for (const conn of this._manager._poseConnections) {
        const a = poseLM[conn.start];
        const bPt = poseLM[conn.end];
        if (!a || !bPt) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bPt.x, bPt.y);
        ctx.stroke();
      }
      if (nodeR > 0) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        for (const lm of poseLM) {
          if (!lm) continue;
          ctx.beginPath();
          ctx.arc(lm.x, lm.y, nodeR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Face mesh
    if (faceLM && this._manager._faceTesselation) {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.lineWidth = lw;
      for (const edge of this._manager._faceTesselation) {
        const a = faceLM[edge.start];
        const bPt = faceLM[edge.end];
        if (!a || !bPt) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bPt.x, bPt.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
