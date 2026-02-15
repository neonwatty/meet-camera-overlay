/**
 * TransitionEffectManager — orchestrates all transition effects
 * and provides a debug panel for manual triggering.
 */

import { MeshShimmerEffect } from './mesh-shimmer.js';
import { EdgeWireframeFlashEffect } from './edge-wireframe.js';
import { extractContour } from './utils.js';

export class TransitionEffectManager {
  constructor() {
    this.meshShimmer = new MeshShimmerEffect();
    this.edgeWireframe = new EdgeWireframeFlashEffect();

    this._firstSegmentationFired = false;

    this._lastContour = null;
    this._lastMask = null;
    this._lastMaskW = 0;
    this._lastMaskH = 0;
    this._videoSource = null;
    this._canvasW = 0;
    this._canvasH = 0;

    this._faceLandmarker = null;
    this._poseLandmarker = null;
    this._faceTesselation = null;
    this._poseConnections = null;

    this._allEffects = [
      this.meshShimmer,
      this.edgeWireframe,
    ];
  }

  update(ctx, timestamp, w, h) {
    this._canvasW = w;
    this._canvasH = h;
    for (const effect of this._allEffects) {
      effect.update(ctx, timestamp, w, h);
    }
  }

  setDetectors(
    faceLandmarker, poseLandmarker,
    faceTesselation, poseConnections
  ) {
    this._faceLandmarker = faceLandmarker;
    this._poseLandmarker = poseLandmarker;
    this._faceTesselation = faceTesselation;
    this._poseConnections = poseConnections;
  }

  updateContourCache(
    personMask, maskW, maskH, canvasW, canvasH
  ) {
    this._lastMask = new Uint8Array(personMask);
    this._lastMaskW = maskW;
    this._lastMaskH = maskH;

    const contour = extractContour(
      this._lastMask, maskW, maskH, canvasW, canvasH
    );
    if (contour.length >= 3) {
      this._lastContour = contour;
    }
  }

  get isActive() {
    return this._allEffects.some((e) => e.active);
  }

  triggerFirstSegmentation(
    personMask, maskW, maskH, canvasW, canvasH, timestamp
  ) {
    if (this._firstSegmentationFired) return;
    this._firstSegmentationFired = true;

    this.updateContourCache(
      personMask, maskW, maskH, canvasW, canvasH
    );
    if (!this._lastContour) return;

    this.meshShimmer.trigger(
      timestamp, this._lastContour,
      personMask, maskW, maskH, canvasW, canvasH,
      this._faceLandmarker, this._faceTesselation,
      this._poseLandmarker, this._poseConnections,
      this._videoSource, this
    );
    this.edgeWireframe.trigger(
      timestamp, this._videoSource, canvasW, canvasH
    );
  }

  resetFirstSegmentation() {
    this._firstSegmentationFired = false;
  }

  setVideoSource(video) {
    this._videoSource = video;
  }

  // ============================================
  // Debug Panel
  // ============================================

  createDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'fx-debug-panel';
    panel.innerHTML = `
      <style>
        #fx-debug-panel {
          position: fixed;
          bottom: 12px;
          left: 12px;
          z-index: 10000;
          background: rgba(10, 10, 12, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 10px;
          font-family: 'JetBrains Mono', 'SF Mono', monospace;
          font-size: 11px;
          color: #ccc;
          backdrop-filter: blur(8px);
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 180px;
        }
        #fx-debug-panel .fx-title {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #666;
          margin-bottom: 2px;
        }
        #fx-debug-panel button {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #ddd;
          padding: 6px 10px;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s, border-color 0.15s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #fx-debug-panel button:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.2);
        }
        #fx-debug-panel button:active {
          background: rgba(255, 255, 255, 0.18);
        }
        #fx-debug-panel button .fx-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        #fx-debug-panel button[disabled] {
          opacity: 0.35;
          cursor: not-allowed;
        }
      </style>
      <div class="fx-title">FX Debug</div>
      <button data-fx="meshShimmer">
        <span class="fx-dot" style="background:#00ff41"></span>
        Mesh Shimmer
      </button>
      <button data-fx="edgeWireframe">
        <span class="fx-dot" style="background:#00ff41"></span>
        Edge Detection
      </button>
      <button data-fx="allDetection">
        <span class="fx-dot" style="background:#00ff41"></span>
        All Detection FX
      </button>
    `;

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-fx]');
      if (!btn || btn.disabled) return;
      this._handleDebugClick(btn.dataset.fx);
    });

    document.body.appendChild(panel);
    this._startDebugPanelUpdater(panel);
    return panel;
  }

  _handleDebugClick(fx) {
    const t = performance.now();
    const w = this._canvasW;
    const h = this._canvasH;

    const triggerMesh = () => {
      if (!this._lastContour) return;
      this.meshShimmer.trigger(
        t, this._lastContour,
        this._lastMask, this._lastMaskW, this._lastMaskH,
        w, h,
        this._faceLandmarker, this._faceTesselation,
        this._poseLandmarker, this._poseConnections,
        this._videoSource, this
      );
    };

    switch (fx) {
      case 'meshShimmer':
        triggerMesh();
        break;
      case 'edgeWireframe':
        if (this._videoSource) {
          this.edgeWireframe.trigger(
            t, this._videoSource, w, h
          );
        }
        break;
      case 'allDetection':
        triggerMesh();
        if (this._videoSource) {
          this.edgeWireframe.trigger(
            t, this._videoSource, w, h
          );
        }
        break;
    }
  }

  _startDebugPanelUpdater(panel) {
    const updateDisabled = () => {
      const hasPerson = !!this._lastContour;
      const hasVideo = !!this._videoSource;
      for (const btn of panel.querySelectorAll(
        'button[data-fx]'
      )) {
        const fx = btn.dataset.fx;
        if (fx === 'meshShimmer') {
          btn.disabled = !hasPerson;
        } else if (fx === 'edgeWireframe') {
          btn.disabled = !hasVideo;
        } else if (fx === 'allDetection') {
          btn.disabled = !hasPerson && !hasVideo;
        }
      }
      requestAnimationFrame(updateDisabled);
    };
    updateDisabled();
  }
}
