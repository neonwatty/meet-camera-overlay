/**
 * Region rendering with gesture effect hooks (tilt, warmth, art swap).
 */

import { drawPerspectiveImage, applyPersonMask } from './render-pipeline.js';
import { regionToPixelCorners } from './regions.js';

const CORNER_KEYS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

export function renderRegions(ctx, tempCtx, tempCanvas, state, manager, timestamp) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const portal = manager.getPortalRegion();
  const parallaxOffsets = manager._parallaxOffsets;
  const tiltOffsets = manager._tiltCornerOffsets;
  const warmth = manager._warmthIntensity;
  const swapReq = manager._artSwapRequest;
  const personMask = state.lastMask;

  for (let i = 0; i < state.regions.length; i++) {
    const region = state.regions[i];
    if (!region.active) continue;

    const gallery = manager._artGalleries.get(region.id);
    const galleryIdx = manager._artGalleryIndex.get(region.id) || 0;
    const galleryImg = gallery && gallery.length > 0 ? gallery[galleryIdx] : null;
    const img = galleryImg || state.artImages.get(region.id);
    if (!img) continue;

    const corners = regionToPixelCorners(region, w, h);
    const transform = { ...region.transform };

    if (parallaxOffsets && parallaxOffsets[i]) {
      const dx = parallaxOffsets[i].panX;
      const dy = parallaxOffsets[i].panY;
      for (const key of CORNER_KEYS) {
        corners[key].x += dx;
        corners[key].y += dy;
      }
    }

    if (tiltOffsets && tiltOffsets[region.id]) {
      const to = tiltOffsets[region.id];
      for (const key of CORNER_KEYS) {
        corners[key].x += to[key].x;
        corners[key].y += to[key].y;
      }
    }

    tempCtx.clearRect(0, 0, w, h);

    if (swapReq && swapReq.regionId === region.id && swapReq.prevImage) {
      const fadeElapsed = timestamp - swapReq.crossfadeStart;
      const fadePct = Math.min(fadeElapsed / swapReq.crossfadeDuration, 1);
      tempCtx.globalAlpha = 1 - fadePct;
      drawPerspectiveImage(tempCtx, swapReq.prevImage, corners, transform);
      tempCtx.globalAlpha = fadePct;
      drawPerspectiveImage(tempCtx, img, corners, transform);
      tempCtx.globalAlpha = 1;
    } else {
      drawPerspectiveImage(tempCtx, img, corners, transform);
    }

    if (warmth > 0.01) {
      tempCtx.save();
      tempCtx.globalCompositeOperation = 'multiply';
      const g = Math.round(255 - warmth * 65);
      const b = Math.round(255 - warmth * 140);
      tempCtx.fillStyle = `rgb(255, ${g}, ${b})`;
      tempCtx.fillRect(0, 0, w, h);
      tempCtx.restore();
    }

    const isPortal = portal.id === region.id && portal.intensity > 0;
    if (personMask && state.segmentationEnabled && !isPortal) {
      applyPersonMask(tempCtx, personMask, state.lastMaskW, state.lastMaskH);
    } else if (isPortal && personMask && portal.intensity < 1 && portal.intensity < 0.5) {
      applyPersonMask(tempCtx, personMask, state.lastMaskW, state.lastMaskH);
    }

    ctx.drawImage(tempCanvas, 0, 0);
  }
}
