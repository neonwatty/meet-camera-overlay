/**
 * Perspective warp renderer — draws a source image into an arbitrary
 * quadrilateral using an 8x8 bilinear triangle mesh.
 *
 * Extracted from multi-region-art/multi-region.js and simplified:
 * no zoom/pan, corners in pixel coordinates, single export.
 */

/**
 * Bilinear interpolation for a point within a quadrilateral.
 */
function bilinearPoint(tl, tr, bl, br, u, v) {
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
 * Maps source triangle to destination triangle via texture mapping.
 */
function drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy1, sx2, sy2, p0, p1, p2) {
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
 * Draw a source image perspective-warped into a quadrilateral defined by
 * four pixel-coordinate corners, using an 8x8 bilinear triangle mesh.
 *
 * @param {CanvasRenderingContext2D} ctx  - destination context
 * @param {CanvasImageSource} source     - image/video/canvas to warp
 * @param {{topLeft, topRight, bottomLeft, bottomRight}} corners
 *        Each corner is {x, y} in pixel coordinates.
 */
export function drawPerspectiveImage(ctx, source, corners) {
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;

  const srcWidth = source.naturalWidth || source.videoWidth || source.width;
  const srcHeight = source.naturalHeight || source.videoHeight || source.height;
  if (!srcWidth || !srcHeight) return;

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

      const sx0 = u0 * srcWidth;
      const sy0 = v0 * srcHeight;
      const sx1 = u1 * srcWidth;
      const sy1 = v1 * srcHeight;

      drawTexturedTriangle(ctx, source, sx0, sy0, sx1, sy0, sx0, sy1, dstTL, dstTR, dstBL);
      drawTexturedTriangle(ctx, source, sx1, sy0, sx1, sy1, sx0, sy1, dstTR, dstBR, dstBL);
    }
  }
}
