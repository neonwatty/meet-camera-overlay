/**
 * PNG Sequence to GIF Converter
 * Converts a folder of PNG frames into an animated GIF with transparency.
 *
 * Usage: node scripts/png-to-gif.js <input-folder> <output-file> [options]
 *
 * Options:
 *   --fps=N       Frame rate (default: 24)
 *   --scale=N     Scale factor 0-1 (default: 1)
 *   --quality=N   GIF quality 1-30, lower=better (default: 10)
 *
 * Examples:
 *   node scripts/png-to-gif.js ./frames/lightning ./examples/lightning-aura.gif
 *   node scripts/png-to-gif.js ./frames/fire ./examples/fire-aura.gif --fps=30 --scale=0.5
 */

import { createCanvas, loadImage } from 'canvas';
import GIFEncoder from 'gifencoder';
import fs from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  fps: 24,
  scale: 1,
  quality: 10
};

// Extract options
const positionalArgs = [];
for (const arg of args) {
  if (arg.startsWith('--fps=')) {
    options.fps = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--scale=')) {
    options.scale = parseFloat(arg.split('=')[1]);
  } else if (arg.startsWith('--quality=')) {
    options.quality = parseInt(arg.split('=')[1], 10);
  } else {
    positionalArgs.push(arg);
  }
}

const [inputFolder, outputFile] = positionalArgs;

if (!inputFolder || !outputFile) {
  console.log(`
PNG Sequence to GIF Converter
=============================

Usage: node scripts/png-to-gif.js <input-folder> <output-file> [options]

Options:
  --fps=N       Frame rate (default: 24)
  --scale=N     Scale factor 0-1 (default: 1)
  --quality=N   GIF quality 1-30, lower=better (default: 10)

Examples:
  node scripts/png-to-gif.js ./frames/lightning ./examples/lightning-aura.gif
  node scripts/png-to-gif.js ./frames/fire ./examples/fire-aura.gif --fps=30 --scale=0.5

Notes:
  - Input folder should contain PNG files named in order (e.g., frame001.png, frame002.png)
  - PNG files should have transparency for best results
  - Files are sorted alphanumerically
`);
  process.exit(1);
}

async function convertPngSequenceToGif() {
  console.log(`\nConverting PNG sequence to GIF...`);
  console.log(`  Input:   ${inputFolder}`);
  console.log(`  Output:  ${outputFile}`);
  console.log(`  FPS:     ${options.fps}`);
  console.log(`  Scale:   ${options.scale}`);
  console.log(`  Quality: ${options.quality}`);
  console.log('');

  // Check input folder exists
  if (!fs.existsSync(inputFolder)) {
    console.error(`Error: Input folder not found: ${inputFolder}`);
    process.exit(1);
  }

  // Get all PNG files
  const files = fs.readdirSync(inputFolder)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => {
      // Natural sort for numbered files
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return numA - numB;
    });

  if (files.length === 0) {
    console.error(`Error: No PNG files found in ${inputFolder}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} PNG frames`);

  // Load first image to get dimensions
  const firstImage = await loadImage(path.join(inputFolder, files[0]));
  const width = Math.round(firstImage.width * options.scale);
  const height = Math.round(firstImage.height * options.scale);

  console.log(`Output dimensions: ${width}x${height}`);

  // Create canvas and encoder
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(width, height);

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const stream = fs.createWriteStream(outputFile);
  encoder.createReadStream().pipe(stream);

  encoder.start();
  encoder.setRepeat(0); // Loop forever
  encoder.setDelay(Math.round(1000 / options.fps));
  encoder.setQuality(options.quality);
  encoder.setTransparent(0x000000); // Black is transparent

  // Process each frame
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imagePath = path.join(inputFolder, file);

    process.stdout.write(`\rProcessing frame ${i + 1}/${files.length}...`);

    const image = await loadImage(imagePath);

    // Clear canvas with black (will be transparent)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Draw image scaled
    ctx.drawImage(image, 0, 0, width, height);

    encoder.addFrame(ctx);
  }

  encoder.finish();

  await new Promise(resolve => stream.on('finish', resolve));

  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n\nDone! Created ${outputFile} (${sizeMB} MB)`);
}

convertPngSequenceToGif().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
