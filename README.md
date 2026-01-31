# Meet Camera Overlay

Real-time webcam processing with perspective-transformed art regions and person occlusion using MediaPipe.

## Live Demo

**Production:** [https://meet-camera-overlay.vercel.app](https://meet-camera-overlay.vercel.app)

## Features

- **Multiple Art Regions** — Add unlimited perspective-transformed regions to your webcam feed
- **Person Occlusion** — Art appears behind you using MediaPipe segmentation
- **Wall Frame Mode** — Constrained regions with vertical edges for realistic wall perspectives
- **WebGL Rendering** — GPU-accelerated perspective transforms with Canvas2D fallback
- **Animated GIFs** — Full GIF support with play/pause controls
- **Color & Gradients** — Solid colors and gradients via the Color tab

## Quick Start

```bash
# Clone and serve locally
git clone https://github.com/neonwatty/meet-camera-overlay.git
cd meet-camera-overlay
npx serve .
```

Then open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
├── prototype/multi-region-art/   # Main web app (Wall Art Prototype)
├── assets/                       # Images, GIFs, and wall art
├── docs/                         # Marketing landing page
├── lib/                          # Shared utilities
└── demo/                         # Additional demos (MediaPipe playground)
```

## Development

```bash
# Run locally
npx serve .

# Run linting
npm run lint

# Run tests
npm test
```

## Deployment

- **Production** (`main` branch): https://meet-camera-overlay.vercel.app
- **Staging** (`staging` branch): https://meet-camera-overlay-staging.vercel.app

## URLs

| Path | Description |
|------|-------------|
| `/` | Wall Art Prototype (main app) |
| `/app` | Wall Art Prototype (alias) |
| `/landing` | Marketing landing page |
| `/guide` | User guide |
| `/demo/mediapipe-playground.html` | MediaPipe segmentation demo |
| `/demo/sam-playground.html` | SAM click-to-segment demo |

## Chrome Extension

The original Chrome extension for Google Meet overlays is still available:

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder

## License

MIT
