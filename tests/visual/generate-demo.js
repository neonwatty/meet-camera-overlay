/**
 * Visual Demo Generator
 *
 * Generates images and an animated GIF showing overlays at different opacities.
 * Run with: npm run test:visual
 *
 * Output:
 *   - test-results/visual/overlay-opacity-0.png
 *   - test-results/visual/overlay-opacity-25.png
 *   - test-results/visual/overlay-opacity-50.png
 *   - test-results/visual/overlay-opacity-75.png
 *   - test-results/visual/overlay-opacity-100.png
 *   - test-results/visual/opacity-demo.gif (animated)
 */

import { createCanvas, loadImage } from 'canvas';
import { drawOverlay } from '../../lib/canvas-renderer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import GIFEncoder from 'gifencoder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../../test-results/visual');

// Canvas dimensions (simulating Meet video)
const WIDTH = 640;
const HEIGHT = 480;

// Create a test overlay image (colored square with text)
async function createOverlayImage(color, text) {
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');

  // Draw rounded rectangle background
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, 200, 200, 20);
  ctx.fill();

  // Add border
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Add text
  ctx.fillStyle = 'white';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 100, 100);

  return canvas;
}

// Create a fake camera background (gradient simulating a person)
function createBackground() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Gradient background (simulating room/person silhouette)
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#2c3e50');
  gradient.addColorStop(0.5, '#3498db');
  gradient.addColorStop(1, '#2c3e50');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add some visual elements to make it look like a video feed
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 - 50, 80, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(WIDTH / 2, HEIGHT / 2 + 100, 120, 80, 0, 0, Math.PI * 2);
  ctx.fill();

  // Add "LIVE" indicator
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(30, 30, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('LIVE', 45, 35);

  return canvas;
}

// Render a frame with overlay at specified opacity
async function renderFrame(backgroundCanvas, overlayImg, opacity) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Draw background
  ctx.drawImage(backgroundCanvas, 0, 0);

  // Draw overlay with opacity
  const overlay = {
    x: 5,        // 5% from left
    y: 70,       // 70% from top (bottom-left area)
    width: 25,   // 25% of canvas width
    height: 25,  // 25% of canvas height
    opacity: opacity
  };

  drawOverlay(ctx, overlay, overlayImg, WIDTH, HEIGHT, { mirror: false });

  // Add opacity label
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(WIDTH - 180, 10, 170, 40);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(`Opacity: ${Math.round(opacity * 100)}%`, WIDTH - 20, 38);

  return canvas;
}

async function main() {
  console.log('Generating visual demo...\n');

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Create assets
  const background = createBackground();
  const overlayImg = await createOverlayImage('#e74c3c', 'OVERLAY');

  // Test opacities
  const opacities = [0, 0.25, 0.5, 0.75, 1.0];
  const frames = [];

  // Generate individual frames
  for (const opacity of opacities) {
    const frame = await renderFrame(background, overlayImg, opacity);
    frames.push(frame);

    // Save as PNG
    const filename = `overlay-opacity-${Math.round(opacity * 100)}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const buffer = frame.toBuffer('image/png');
    fs.writeFileSync(filepath, buffer);
    console.log(`  Created: ${filename}`);
  }

  // Generate animated GIF
  console.log('\nGenerating animated GIF...');

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  const gifPath = path.join(OUTPUT_DIR, 'opacity-demo.gif');
  const gifStream = fs.createWriteStream(gifPath);

  encoder.createReadStream().pipe(gifStream);
  encoder.start();
  encoder.setRepeat(0);   // Loop forever
  encoder.setDelay(800);  // 800ms between frames
  encoder.setQuality(10); // Best quality

  // Add frames (forward and backward for smooth loop)
  const allFrames = [...frames, ...frames.slice(1, -1).reverse()];
  for (const frame of allFrames) {
    encoder.addFrame(frame.getContext('2d'));
  }

  encoder.finish();

  await new Promise(resolve => gifStream.on('finish', resolve));
  console.log(`  Created: opacity-demo.gif`);

  console.log(`\nDone! Check ${OUTPUT_DIR} for output files.`);
  console.log('\nTo view:');
  console.log(`  open ${OUTPUT_DIR}/opacity-demo.gif`);
}

main().catch(console.error);
