/**
 * Render pipeline — pure functions for perspective-warped region rendering.
 * Extracted from multi-region-art/multi-region.js.
 */

/**
 * Bilinear interpolation for a point within a quadrilateral.
 */
export function bilinearPoint(tl, tr, bl, br, u, v) {
  const top = {
    x: tl.x + (tr.x - tl.x) * u,
    y: tl.y + (tr.y - tl.y) * u,
  };
  const bottom = {
    x: bl.x + (br.x - bl.x) * u,
    y: bl.y + (br.y - bl.y) * u,
  };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}

/**
 * Draw a textured triangle using affine transform.
 * Maps source triangle to destination triangle.
 *
 * Source triangle: (sx0,sy0), (sx1,sy1), (sx2,sy2) in source image
 * Dest triangle: p0, p1, p2 on canvas
 */
export function drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy1, sx2, sy2, p0, p1, p2) {
  const destArea = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y));
  if (destArea < 1) return;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();

  const srcDet = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(srcDet) < 0.001) {
    ctx.restore();
    return;
  }

  const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y;
  const dx2 = p2.x - p0.x, dy2 = p2.y - p0.y;
  const dsx1 = sx1 - sx0, dsy1 = sy1 - sy0;
  const dsx2 = sx2 - sx0, dsy2 = sy2 - sy0;

  const invDet = 1 / srcDet;
  const m11 = dsy2 * invDet, m12 = -dsx2 * invDet;
  const m21 = -dsy1 * invDet, m22 = dsx1 * invDet;

  const a = dx1 * m11 + dx2 * m21;
  const c = dx1 * m12 + dx2 * m22;
  const b = dy1 * m11 + dy2 * m21;
  const d = dy1 * m12 + dy2 * m22;
  const e = p0.x - a * sx0 - c * sy0;
  const f = p0.y - b * sx0 - d * sy0;

  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

/**
 * Draw an image perspective-warped into a quadrilateral via 8x8 triangle mesh.
 */
export function drawPerspectiveImage(ctx, source, corners, transform) {
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const { zoom = 1, panX = 0, panY = 0 } = transform;

  const srcWidth = source.naturalWidth || source.width;
  const srcHeight = source.naturalHeight || source.height;
  if (!srcWidth || !srcHeight) return;

  const visibleWidth = srcWidth / zoom;
  const visibleHeight = srcHeight / zoom;
  const srcX = Math.max(0, Math.min(srcWidth - visibleWidth, (srcWidth - visibleWidth) / 2 + panX));
  const srcY = Math.max(0, Math.min(srcHeight - visibleHeight, (srcHeight - visibleHeight) / 2 + panY));

  const gridSize = 8;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const u0 = col / gridSize;
      const v0 = row / gridSize;
      const u1 = (col + 1) / gridSize;
      const v1 = (row + 1) / gridSize;

      const dstTL = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u0, v0);
      const dstTR = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u1, v0);
      const dstBL = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u0, v1);
      const dstBR = bilinearPoint(topLeft, topRight, bottomLeft, bottomRight, u1, v1);

      const sx0 = srcX + u0 * visibleWidth;
      const sy0 = srcY + v0 * visibleHeight;
      const sx1 = srcX + u1 * visibleWidth;
      const sy1 = srcY + v1 * visibleHeight;

      drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy0, sx0, sy1, dstTL, dstTR, dstBL);
      drawTexturedTriangle(ctx, source, sx1, sy0, sx1, sy1, sx0, sy1, dstTR, dstBR, dstBL);
    }
  }
}

/**
 * Apply person segmentation mask to a canvas — makes person pixels transparent.
 * MediaPipe convention: mask value 0 = person, 255 = background.
 */
export function applyPersonMask(ctx, mask, mWidth, mHeight) {
  const canvas = ctx.canvas;
  const cWidth = canvas.width;
  const cHeight = canvas.height;

  if (mWidth === cWidth && mHeight === cHeight) {
    const imageData = ctx.getImageData(0, 0, cWidth, cHeight);
    const pixels = imageData.data;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) {
        pixels[i * 4 + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mWidth;
  maskCanvas.height = mHeight;
  const maskCtx = maskCanvas.getContext('2d');

  const maskImageData = maskCtx.createImageData(mWidth, mHeight);
  for (let i = 0; i < mask.length; i++) {
    const isPerson = mask[i] === 0;
    maskImageData.data[i * 4] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 1] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 2] = isPerson ? 255 : 0;
    maskImageData.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = cWidth;
  scaledCanvas.height = cHeight;
  const scaledCtx = scaledCanvas.getContext('2d');
  scaledCtx.drawImage(maskCanvas, 0, 0, cWidth, cHeight);
  const scaledMask = scaledCtx.getImageData(0, 0, cWidth, cHeight);

  const imageData = ctx.getImageData(0, 0, cWidth, cHeight);
  const pixels = imageData.data;
  for (let i = 0; i < cWidth * cHeight; i++) {
    if (scaledMask.data[i * 4] > 128) {
      pixels[i * 4 + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
