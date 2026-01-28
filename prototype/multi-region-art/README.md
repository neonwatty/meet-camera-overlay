# Multi-Region Wall Art Prototype

A standalone prototype for placing multiple perspective-transformed art regions on webcam video with person occlusion.

## Running Locally

```bash
npx serve prototype/multi-region-art
```

Then open the URL shown in terminal (e.g., `http://localhost:3000`).

## Features

- **Multiple art regions** - Add unlimited perspective-transformed regions
- **Person occlusion** - Art appears behind the user via MediaPipe segmentation
- **Two region types:**
  - **Free Form** - All corners move independently
  - **Wall Frame** - Left/right edges stay vertical (parallel), top/bottom can angle freely
- **Art sources:** Upload images, pick from gallery, use solid colors/gradients, or paste URLs
- **Animated GIF support** - Play/pause controls for animated images
- **WebGL rendering** - GPU-accelerated perspective transforms with Canvas2D fallback

## Controls

| Action | Effect |
|--------|--------|
| Click + button | Add new region |
| Drag corner handles | Reshape region |
| Click inside region | Select region |
| Double-click region | Open art picker |
| Scroll wheel (over region) | Zoom in/out |
| Shift + drag inside | Pan art within region |
| Double-click inside | Reset zoom/pan to defaults |
| Delete key | Remove selected region |
| +/- buttons | Zoom in/out |
| Arrow buttons | Pan art |

## Design Decisions

### Image Fill Mode

**Images always fill the region completely** (cover/fill mode). This is intentional:

- At **zoom = 1.0x**: The image scales to completely fill the region bounds
- At **zoom > 1.0x**: You see a magnified portion of the image and can pan around
- At **zoom < 1.0x**: Shows more of the image but still fills the region

**Pan only works when zoomed in** (zoom > 1.0). At 1x zoom, the entire image is visible within the region, so there's nowhere to pan to. To use pan:
1. First zoom in with scroll wheel or + button
2. Then shift+drag to pan around the magnified view

This design ensures art always covers the region without gaps - ideal for wall art overlays.

### Wall Frame Mode (formerly "Trapezoid")

The Wall Frame constraint keeps **vertical edges parallel** rather than horizontal edges:

- Left edge: `topLeft.x === bottomLeft.x`
- Right edge: `topRight.x === bottomRight.x`
- Top/bottom edges can be at any angle

This matches real-world camera perspectives where vertical lines in a scene stay vertical in the image, but horizontal lines converge toward a vanishing point. Perfect for picture frames on walls viewed from an angle.

### Rendering Pipeline

1. **WebGL path** (default): Uses homography matrix for true projective transforms
2. **Canvas2D fallback**: Uses triangular mesh approximation if WebGL unavailable
3. **Person mask**: Applied after art rendering to make user appear in front of art

## Tech Stack

- MediaPipe Tasks Vision (selfie segmentation)
- WebGL 2.0 with custom shaders
- Vanilla JavaScript (no framework)
- localStorage for persistence
