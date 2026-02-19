/**
 * Region preset data, loading, and color sampling.
 */

const ART_PATHS = [
  '/assets/wall-art/abstract-ocean.png',
  '/assets/wall-art/nature-mountain.png',
  '/assets/wall-art/abstract-sunset.png',
  '/assets/wall-art/pattern-geometric.png',
];

const REGION_PRESETS = {
  2: [
    { id: 'r1', region: { topLeft: { x: 5, y: 15 }, topRight: { x: 38, y: 15 }, bottomLeft: { x: 5, y: 78 }, bottomRight: { x: 38, y: 78 } } },
    { id: 'r2', region: { topLeft: { x: 62, y: 20 }, topRight: { x: 95, y: 20 }, bottomLeft: { x: 62, y: 75 }, bottomRight: { x: 95, y: 75 } } },
  ],
  3: [
    { id: 'r1', region: { topLeft: { x: 3, y: 12 }, topRight: { x: 30, y: 12 }, bottomLeft: { x: 3, y: 78 }, bottomRight: { x: 30, y: 78 } } },
    { id: 'r2', region: { topLeft: { x: 35, y: 18 }, topRight: { x: 65, y: 18 }, bottomLeft: { x: 35, y: 68 }, bottomRight: { x: 65, y: 68 } } },
    { id: 'r3', region: { topLeft: { x: 70, y: 15 }, topRight: { x: 97, y: 15 }, bottomLeft: { x: 70, y: 75 }, bottomRight: { x: 97, y: 75 } } },
  ],
  4: [
    { id: 'r1', region: { topLeft: { x: 2, y: 10 }, topRight: { x: 24, y: 10 }, bottomLeft: { x: 2, y: 70 }, bottomRight: { x: 24, y: 70 } } },
    { id: 'r2', region: { topLeft: { x: 27, y: 15 }, topRight: { x: 49, y: 15 }, bottomLeft: { x: 27, y: 65 }, bottomRight: { x: 49, y: 65 } } },
    { id: 'r3', region: { topLeft: { x: 52, y: 15 }, topRight: { x: 74, y: 15 }, bottomLeft: { x: 52, y: 65 }, bottomRight: { x: 74, y: 65 } } },
    { id: 'r4', region: { topLeft: { x: 77, y: 10 }, topRight: { x: 98, y: 10 }, bottomLeft: { x: 77, y: 70 }, bottomRight: { x: 98, y: 70 } } },
  ],
};

export function regionToPixelCorners(region, w, h) {
  const r = region.region;
  return {
    topLeft: { x: r.topLeft.x / 100 * w, y: r.topLeft.y / 100 * h },
    topRight: { x: r.topRight.x / 100 * w, y: r.topRight.y / 100 * h },
    bottomLeft: { x: r.bottomLeft.x / 100 * w, y: r.bottomLeft.y / 100 * h },
    bottomRight: { x: r.bottomRight.x / 100 * w, y: r.bottomRight.y / 100 * h },
  };
}

export async function loadArt(artImages) {
  const promises = ART_PATHS.map((path, i) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { artImages.set(`r${i + 1}`, img); resolve(); };
    img.onerror = () => resolve();
    img.src = path;
  }));
  await Promise.all(promises);
}

export function loadRegionPreset(count, state, manager, canvasW, canvasH) {
  state.regionPresetCount = count;
  state.regions = (REGION_PRESETS[count] || REGION_PRESETS[3]).map((r) => ({
    ...r,
    transform: { zoom: 1, panX: 0, panY: 0 },
    active: true,
  }));
  manager.setRegions(state.regions);
  updateRegionColors(state, manager, canvasW, canvasH);
}

export function updateRegionColors(state, manager, canvasW, canvasH) {
  const colors = [];
  const centers = [];

  for (const region of state.regions) {
    const corners = regionToPixelCorners(region, canvasW, canvasH);
    const cx = (corners.topLeft.x + corners.bottomRight.x) / 2;
    const cy = (corners.topLeft.y + corners.bottomRight.y) / 2;
    centers.push({ x: cx, y: cy });

    const img = state.artImages.get(region.id);
    if (img) {
      const sampleCanvas = new OffscreenCanvas(1, 1);
      const sCtx = sampleCanvas.getContext('2d');
      const sx = Math.floor(img.width / 2);
      const sy = Math.floor(img.height / 2);
      sCtx.drawImage(img, sx - 5, sy - 5, 10, 10, 0, 0, 1, 1);
      const pixel = sCtx.getImageData(0, 0, 1, 1).data;
      colors.push({ r: pixel[0], g: pixel[1], b: pixel[2] });
    } else {
      colors.push({ r: 200, g: 180, b: 160 });
    }
  }

  manager.setRegionColors(colors, centers);
}
