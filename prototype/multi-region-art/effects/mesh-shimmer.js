/**
 * MeshShimmerEffect — live face mesh wireframe + pose skeleton
 * + person mask overlay with matrix-green shimmer.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic, renderMaskOverlay } from './utils.js';

export class MeshShimmerEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 15000;
    this.canvasW = 0;
    this.canvasH = 0;

    this._manager = null;

    this._faceLandmarker = null;
    this._poseLandmarker = null;
    this._faceTesselation = null;
    this._poseConnections = null;
    this._videoSource = null;

    this.faceLandmarks = null;
    this.poseLandmarks = null;
    this._smoothingFactor = 0.3;

    this._maskOverlay = null;
    this._scanLines = [];
    this._lastMaskRebuildTime = 0;
    this._landmarksDetected = false;
  }

  onTrigger(
    _timestamp, contour, mask, maskW, maskH, canvasW, canvasH,
    faceLandmarker, faceTesselation,
    poseLandmarker, poseConnections,
    videoSource, manager
  ) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this._manager = manager;

    this._faceLandmarker = faceLandmarker;
    this._faceTesselation = faceTesselation;
    this._poseLandmarker = poseLandmarker;
    this._poseConnections = poseConnections;
    this._videoSource = videoSource;

    this._landmarksDetected = false;
    this._detectLandmarks();
    this._rebuildMaskData(mask, maskW, maskH, canvasW, canvasH);
    this._lastMaskRebuildTime = _timestamp;
  }

  update(ctx, timestamp, w, h) {
    if (!this.active) return;
    // Defer the fade-out countdown until face landmarks are first detected.
    // This prevents the effect from expiring before models finish loading
    // (common in incognito / cold cache).
    if (!this._landmarksDetected) {
      if (this.faceLandmarks) {
        this._landmarksDetected = true;
        this.startTime = timestamp;
      } else {
        this.startTime = timestamp;
      }
    }
    super.update(ctx, timestamp, w, h);
  }

  _rebuildMaskData(mask, maskW, maskH, canvasW, canvasH) {
    if (!mask || !maskW || !maskH) return;

    this._maskOverlay = renderMaskOverlay(
      mask, maskW, maskH, canvasW, canvasH
    );

    this._scanLines = [];
    const spacing = 10;
    const scaleX = maskW / canvasW;
    const scaleY = maskH / canvasH;

    for (let cy = 0; cy < canvasH; cy += spacing) {
      const my = Math.floor(cy * scaleY);
      if (my >= maskH) break;

      let inPerson = false;
      let segStart = 0;

      for (let cx = 0; cx < canvasW; cx += 2) {
        const mx = Math.floor(cx * scaleX);
        const isPerson =
          mx < maskW && mask[my * maskW + mx] === 0;

        if (isPerson && !inPerson) {
          segStart = cx;
          inPerson = true;
        } else if (!isPerson && inPerson) {
          this._scanLines.push({ y: cy, x1: segStart, x2: cx });
          inPerson = false;
        }
      }
      if (inPerson) {
        this._scanLines.push({
          y: cy, x1: segStart, x2: canvasW,
        });
      }
    }
  }

  _smoothLandmarks(prev, raw) {
    if (!prev || prev.length !== raw.length) return raw;
    const a = this._smoothingFactor;
    const b = 1 - a;
    return raw.map((p, i) => ({
      x: prev[i].x * b + p.x * a,
      y: prev[i].y * b + p.y * a,
    }));
  }

  _detectLandmarks() {
    const ts = performance.now();
    const w = this.canvasW;
    const h = this.canvasH;

    // Read detectors from manager so late-loaded models are picked up
    const faceLM = this._manager?._faceLandmarker || this._faceLandmarker;
    const poseLM = this._manager?._poseLandmarker || this._poseLandmarker;
    const videoSrc = this._manager?._videoSource || this._videoSource;

    if (faceLM && videoSrc) {
      try {
        const result = faceLM.detectForVideo(videoSrc, ts);
        if (
          result.faceLandmarks &&
          result.faceLandmarks.length > 0
        ) {
          const raw = result.faceLandmarks[0].map((lm) => ({
            x: lm.x * w,
            y: lm.y * h,
          }));
          this.faceLandmarks = this._smoothLandmarks(
            this.faceLandmarks, raw
          );
          // Pick up tesselation from manager if not set at trigger time
          if (!this._faceTesselation && this._manager?._faceTesselation) {
            this._faceTesselation = this._manager._faceTesselation;
          }
        }
      } catch {
        // Ignore per-frame detection errors
      }
    }

    if (poseLM && videoSrc) {
      try {
        const result = poseLM.detectForVideo(videoSrc, ts + 1);
        if (result.landmarks && result.landmarks.length > 0) {
          const raw = result.landmarks[0].map((lm) => ({
            x: lm.x * w,
            y: lm.y * h,
          }));
          this.poseLandmarks = this._smoothLandmarks(
            this.poseLandmarks, raw
          );
          // Pick up connections from manager if not set at trigger time
          if (!this._poseConnections && this._manager?._poseConnections) {
            this._poseConnections = this._manager._poseConnections;
          }
        }
      } catch {
        // Ignore per-frame detection errors
      }
    }
  }

  render(ctx, progress, elapsed, _w, _h) {
    const contour =
      (this._manager && this._manager._lastContour) || [];

    if (!this._maskOverlay && contour.length === 0) return;

    this._detectLandmarks();

    const now = this.startTime + elapsed;
    if (
      this._manager &&
      this._manager._lastMask &&
      now - this._lastMaskRebuildTime > 150
    ) {
      this._rebuildMaskData(
        this._manager._lastMask,
        this._manager._lastMaskW,
        this._manager._lastMaskH,
        this.canvasW,
        this.canvasH
      );
      this._lastMaskRebuildTime = now;
    }

    const fade = 1 - easeOutCubic(progress);
    const shimmer =
      0.6 + 0.4 * (0.5 + 0.5 * Math.sin(elapsed * 0.005));

    ctx.save();

    // Layer 1: Green mask fill
    if (this._maskOverlay) {
      ctx.globalAlpha = fade * shimmer * 0.3;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this._maskOverlay, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Layer 2: Pose skeleton
    if (this.poseLandmarks && this._poseConnections) {
      this._renderPoseSkeleton(ctx, fade, shimmer);
    }

    // Layer 3: Face mesh wireframe
    if (this.faceLandmarks && this._faceTesselation) {
      this._renderFaceMesh(ctx, fade, shimmer, elapsed);
    }

    // Layer 4: Horizontal scan lines
    this._renderScanLines(ctx, fade, shimmer, progress);

    // Layer 5: Bold person outline + scanning dots
    if (contour.length > 0) {
      this._renderContour(ctx, contour, fade, shimmer, elapsed);
    }

    ctx.restore();
  }

  _renderScanLines(ctx, fade, shimmer, progress) {
    if (this._scanLines.length === 0) return;
    const sweepY =
      this.canvasH * easeOutCubic(Math.min(progress * 2.5, 1));

    for (const line of this._scanLines) {
      if (line.y > sweepY) break;
      const dist = sweepY - line.y;
      const trail = Math.min(1, dist / 80);
      const lineAlpha =
        fade * shimmer * 0.45 * (1 - trail * 0.7);
      if (lineAlpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(0, 255, 65, ${lineAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y);
      ctx.lineTo(line.x2, line.y);
      ctx.stroke();
    }
  }

  _renderContour(ctx, contour, fade, shimmer, elapsed) {
    const drawPath = () => {
      ctx.beginPath();
      for (let i = 0; i < contour.length; i++) {
        const p = contour[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };

    // Outer glow
    ctx.strokeStyle = `rgba(0, 220, 40, ${fade * 0.5})`;
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawPath();
    ctx.stroke();

    // Mid glow
    ctx.strokeStyle =
      `rgba(0, 255, 65, ${fade * shimmer * 0.8})`;
    ctx.lineWidth = 5;
    drawPath();
    ctx.stroke();

    // Sharp core line
    ctx.strokeStyle =
      `rgba(150, 255, 180, ${fade * shimmer * 0.9})`;
    ctx.lineWidth = 1.5;
    drawPath();
    ctx.stroke();

    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';

    // Scanning dots
    const scanSpeed = elapsed * 0.002;
    const dotCount = 4;
    for (let d = 0; d < dotCount; d++) {
      const t = (scanSpeed + d / dotCount) % 1;
      const idx = Math.floor(t * contour.length);
      const p = contour[idx % contour.length];
      const dotAlpha = fade * 0.95;
      const dotRadius = 5 + 2 * Math.sin(elapsed * 0.008 + d);

      ctx.beginPath();
      ctx.arc(p.x, p.y, dotRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 65, ${dotAlpha * 0.3})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle =
        `rgba(180, 255, 200, ${dotAlpha})`;
      ctx.fill();
    }
  }

  _renderPoseSkeleton(ctx, fade, shimmer) {
    const lm = this.poseLandmarks;
    const alpha = fade * shimmer * 0.85;

    ctx.strokeStyle = `rgba(0, 255, 65, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const conn of this._poseConnections) {
      const a = lm[conn.start];
      const b = lm[conn.end];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.lineCap = 'butt';
  }

  _renderFaceMesh(ctx, fade, shimmer, elapsed) {
    const lm = this.faceLandmarks;
    const wave = 0.5 + 0.5 * Math.sin(elapsed * 0.004);
    const alpha = fade * shimmer * 0.7;

    ctx.strokeStyle =
      `rgba(0, 255, 65, ${alpha * (0.4 + 0.6 * wave)})`;
    ctx.lineWidth = 1.2;
    for (const edge of this._faceTesselation) {
      const a = lm[edge.start];
      const b = lm[edge.end];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}
