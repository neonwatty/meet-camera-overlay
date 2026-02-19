/**
 * TransitionEffectManager — orchestrates all transition effects.
 * Extended from multi-region-art version with shared caches,
 * region data, portal hook, and per-effect trigger API.
 */

import { MeshShimmerEffect } from './mesh-shimmer.js';
import { EdgeWireframeFlashEffect } from './edge-wireframe.js';
import { AmbientAuraEffect } from './ambient-aura.js';
import { DepthParallaxEffect } from './depth-parallax.js';
import { RegionReactivityEffect } from './region-reactivity.js';
import { ContourParticlesEffect } from './contour-particles.js';
import { PortalDissolveEffect } from './portal-dissolve.js';
import { WireframeMorphEffect } from './wireframe-morph.js';
import { EnvironmentalGlowEffect } from './environmental-glow.js';
import { extractContour } from './utils.js';

export class TransitionEffectManager {
  constructor() {
    this.meshShimmer = new MeshShimmerEffect();
    this.edgeWireframe = new EdgeWireframeFlashEffect();
    this.ambientAura = new AmbientAuraEffect();
    this.depthParallax = new DepthParallaxEffect();
    this.regionReactivity = new RegionReactivityEffect();
    this.contourParticles = new ContourParticlesEffect();
    this.portalDissolve = new PortalDissolveEffect();
    this.wireframeMorph = new WireframeMorphEffect();
    this.environmentalGlow = new EnvironmentalGlowEffect();

    this._firstSegmentationFired = false;

    // Segmentation cache
    this._lastContour = null;
    this._lastMask = null;
    this._lastMaskW = 0;
    this._lastMaskH = 0;

    // Landmark cache
    this._cachedFaceLandmarks = null;
    this._cachedPoseLandmarks = null;

    // Detectors
    this._faceLandmarker = null;
    this._poseLandmarker = null;
    this._faceTesselation = null;
    this._poseConnections = null;
    this._videoSource = null;
    this._canvasW = 0;
    this._canvasH = 0;

    // Region data
    this._regions = [];
    this._regionColors = [];
    this._regionCenters = [];

    // Portal hook
    this._portalRegionId = null;
    this._portalIntensity = 0;

    // Parallax offsets (set by DepthParallaxEffect)
    this._parallaxOffsets = null;

    // Brightness multiplier from lighting detector
    this._brightnessMult = 1.0;

    this._allEffects = [
      this.meshShimmer,
      this.edgeWireframe,
      this.ambientAura,
      this.depthParallax,
      this.regionReactivity,
      this.contourParticles,
      this.portalDissolve,
      this.wireframeMorph,
      this.environmentalGlow,
    ];

    this._effectMap = {
      meshShimmer: this.meshShimmer,
      edgeWireframe: this.edgeWireframe,
      ambientAura: this.ambientAura,
      depthParallax: this.depthParallax,
      regionReactivity: this.regionReactivity,
      contourParticles: this.contourParticles,
      portalDissolve: this.portalDissolve,
      wireframeMorph: this.wireframeMorph,
      environmentalGlow: this.environmentalGlow,
    };
  }

  // ============================================
  // Per-frame update
  // ============================================

  update(ctx, timestamp, w, h) {
    this._canvasW = w;
    this._canvasH = h;

    // Clear portal when effect is inactive
    if (this.portalDissolve && !this.portalDissolve.active) {
      this._portalRegionId = null;
      this._portalIntensity = 0;
    }

    // Clear parallax when effect is inactive
    if (this.depthParallax && !this.depthParallax.active) {
      this._parallaxOffsets = null;
    }

    for (const effect of this._allEffects) {
      effect.update(ctx, timestamp, w, h);
    }
  }

  // ============================================
  // Detector registration
  // ============================================

  setDetectors(faceLandmarker, poseLandmarker, faceTesselation, poseConnections) {
    this._faceLandmarker = faceLandmarker;
    this._poseLandmarker = poseLandmarker;
    this._faceTesselation = faceTesselation;
    this._poseConnections = poseConnections;
  }

  setVideoSource(video) {
    this._videoSource = video;
  }

  // ============================================
  // Segmentation / contour cache
  // ============================================

  updateContourCache(personMask, maskW, maskH, canvasW, canvasH) {
    this._lastMask = new Uint8Array(personMask);
    this._lastMaskW = maskW;
    this._lastMaskH = maskH;
    const contour = extractContour(this._lastMask, maskW, maskH, canvasW, canvasH);
    if (contour.length >= 3) {
      this._lastContour = contour;
    }
  }

  getCachedContour() {
    return this._lastContour;
  }

  // ============================================
  // Landmark cache
  // ============================================

  updateLandmarkCache(faceLandmarks, poseLandmarks) {
    this._cachedFaceLandmarks = faceLandmarks;
    this._cachedPoseLandmarks = poseLandmarks;
  }

  getCachedFaceLandmarks() {
    return this._cachedFaceLandmarks;
  }

  getCachedPoseLandmarks() {
    return this._cachedPoseLandmarks;
  }

  // ============================================
  // Region data
  // ============================================

  setRegions(regions) {
    this._regions = regions;
  }

  getRegions() {
    return this._regions;
  }

  setRegionColors(colors, centers) {
    this._regionColors = colors;
    this._regionCenters = centers;
  }

  getRegionColors() {
    return this._regionColors;
  }

  // ============================================
  // Portal hook
  // ============================================

  setPortalRegion(regionId, intensity = 0) {
    this._portalRegionId = regionId;
    this._portalIntensity = intensity;
  }

  getPortalRegion() {
    return { id: this._portalRegionId, intensity: this._portalIntensity };
  }

  // ============================================
  // Brightness
  // ============================================

  setBrightnessMult(mult) {
    this._brightnessMult = mult;
  }

  // ============================================
  // Effect triggering
  // ============================================

  get isActive() {
    return this._allEffects.some((e) => e.active);
  }

  getActiveEffectNames() {
    return Object.entries(this._effectMap)
      .filter(([, e]) => e.active)
      .map(([name]) => name);
  }

  triggerEffect(name, timestamp) {
    const t = timestamp || performance.now();
    const w = this._canvasW;
    const h = this._canvasH;

    switch (name) {
      case 'meshShimmer':
        if (!this._lastContour) break;
        this.meshShimmer.trigger(
          t, this._lastContour,
          this._lastMask, this._lastMaskW, this._lastMaskH, w, h,
          this._faceLandmarker, this._faceTesselation,
          this._poseLandmarker, this._poseConnections,
          this._videoSource, this
        );
        break;
      case 'edgeWireframe':
        if (!this._videoSource) break;
        this.edgeWireframe.trigger(t, this._videoSource, w, h);
        break;
      case 'ambientAura':
        this.ambientAura.trigger(
          t, this._lastContour, this._regionColors, this._regionCenters
        );
        break;
      case 'depthParallax':
        this.depthParallax.trigger(t, this);
        break;
      case 'regionReactivity':
        this.regionReactivity.trigger(t, this);
        break;
      case 'contourParticles':
        this.contourParticles.trigger(t, this._lastContour);
        break;
      case 'portalDissolve':
        this.portalDissolve.trigger(t, this, this._lastContour);
        break;
      case 'wireframeMorph':
        this.wireframeMorph.trigger(t, this);
        break;
      case 'environmentalGlow':
        this.environmentalGlow.trigger(
          t, this._lastContour, this._regionColors,
          this._regionCenters, this._brightnessMult, this
        );
        break;
    }
  }

  triggerFirstSegmentation(personMask, maskW, maskH, canvasW, canvasH, timestamp) {
    if (this._firstSegmentationFired) return;
    this._firstSegmentationFired = true;
    this.updateContourCache(personMask, maskW, maskH, canvasW, canvasH);
    if (!this._lastContour) return;
    this.triggerEffect('meshShimmer', timestamp);
    this.triggerEffect('edgeWireframe', timestamp);
  }

  resetFirstSegmentation() {
    this._firstSegmentationFired = false;
  }
}
