/**
 * Generate DBZ-style aura effect GIFs
 * Creates animated energy aura effects with flame-like upward flow,
 * particle effects, and electric sparks.
 *
 * Run with: node scripts/generate-aura.js
 */

import { createCanvas } from 'canvas';
import GIFEncoder from 'gifencoder';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../examples');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const WIDTH = 640;
const HEIGHT = 480;
const FRAMES = 24;  // More frames for smoother animation
const FRAME_DELAY = 42; // ~24fps

// Flame particle class for upward flowing energy
class FlameParticle {
  constructor(x, baseY, color1, color2, isInner = false) {
    this.x = x;
    this.baseY = baseY;
    this.y = baseY;
    this.age = Math.random() * 100;
    this.speed = 2 + Math.random() * 3;
    this.size = isInner ? 15 + Math.random() * 25 : 25 + Math.random() * 40;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = 0.1 + Math.random() * 0.15;
    this.wobbleAmount = 5 + Math.random() * 15;
    this.color1 = color1;
    this.color2 = color2;
    this.isInner = isInner;
    this.alpha = 0.3 + Math.random() * 0.5;
  }

  update() {
    this.age += 1;
    this.y -= this.speed;
    this.wobble += this.wobbleSpeed;

    // Fade out as it rises
    const heightRatio = (this.baseY - this.y) / (HEIGHT * 0.5);
    this.alpha = Math.max(0, (0.6 - heightRatio) * (this.isInner ? 0.9 : 0.6));

    // Reset when too high or faded
    if (this.y < -this.size || this.alpha <= 0) {
      this.y = this.baseY + Math.random() * 30;
      this.age = 0;
      this.alpha = 0.3 + Math.random() * 0.5;
    }
  }

  draw(ctx) {
    const xOffset = Math.sin(this.wobble) * this.wobbleAmount;
    const x = this.x + xOffset;

    // Create flame-like gradient
    const gradient = ctx.createRadialGradient(
      x, this.y, 0,
      x, this.y - this.size * 0.3, this.size
    );

    const alpha1 = Math.floor(this.alpha * 255).toString(16).padStart(2, '0');
    const alpha2 = Math.floor(this.alpha * 0.5 * 255).toString(16).padStart(2, '0');
    const alpha3 = Math.floor(this.alpha * 0.2 * 255).toString(16).padStart(2, '0');

    gradient.addColorStop(0, this.color1 + alpha1);
    gradient.addColorStop(0.4, this.color1 + alpha2);
    gradient.addColorStop(0.7, this.color2 + alpha3);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();

    // Draw elongated flame shape
    const flameHeight = this.size * 1.8;
    ctx.moveTo(x, this.y - flameHeight);
    ctx.bezierCurveTo(
      x - this.size * 0.5, this.y - flameHeight * 0.6,
      x - this.size * 0.7, this.y,
      x, this.y + this.size * 0.3
    );
    ctx.bezierCurveTo(
      x + this.size * 0.7, this.y,
      x + this.size * 0.5, this.y - flameHeight * 0.6,
      x, this.y - flameHeight
    );
    ctx.fill();
  }
}

// Spark particle for electric effects
class SparkParticle {
  constructor(centerX, centerY, radius) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.reset();
  }

  reset() {
    // Start from random point around the aura edge
    const angle = Math.random() * Math.PI * 2;
    this.x = this.centerX + Math.cos(angle) * this.radius * (0.7 + Math.random() * 0.3);
    this.y = this.centerY + Math.sin(angle) * this.radius * (0.7 + Math.random() * 0.3);
    this.life = 1;
    this.decay = 0.05 + Math.random() * 0.1;
    this.angle = angle;
    this.length = 20 + Math.random() * 40;
    this.branches = Math.floor(Math.random() * 3) + 1;
  }

  update() {
    this.life -= this.decay;
    if (this.life <= 0) {
      this.reset();
    }
  }

  draw(ctx) {
    if (this.life <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.life * 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#88ccff';
    ctx.shadowBlur = 10;

    // Draw main lightning bolt
    this.drawBolt(ctx, this.x, this.y, this.angle + Math.PI, this.length, this.branches);

    ctx.restore();
  }

  drawBolt(ctx, x, y, angle, length, branchesLeft) {
    const segments = 3 + Math.floor(Math.random() * 3);
    const segLength = length / segments;

    ctx.beginPath();
    ctx.moveTo(x, y);

    let currentX = x;
    let currentY = y;

    for (let i = 0; i < segments; i++) {
      const deviation = (Math.random() - 0.5) * 0.5;
      const segAngle = angle + deviation;
      currentX += Math.cos(segAngle) * segLength;
      currentY += Math.sin(segAngle) * segLength;
      ctx.lineTo(currentX, currentY);

      // Maybe add a branch
      if (branchesLeft > 0 && Math.random() < 0.3) {
        const branchAngle = segAngle + (Math.random() - 0.5) * Math.PI * 0.5;
        this.drawBolt(ctx, currentX, currentY, branchAngle, length * 0.4, branchesLeft - 1);
      }
    }

    ctx.stroke();
  }
}

// Glitter particle
class GlitterParticle {
  constructor(centerX, centerY, radius) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.reset();
  }

  reset() {
    const angle = Math.random() * Math.PI * 2;
    const dist = this.radius * (0.5 + Math.random() * 0.5);
    this.x = this.centerX + Math.cos(angle) * dist;
    this.y = this.centerY + Math.sin(angle) * dist;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 0.2 + Math.random() * 0.3;
    this.size = 2 + Math.random() * 4;
  }

  update() {
    this.phase += this.speed;
    this.y -= 0.5; // Slowly rise

    if (this.y < this.centerY - this.radius * 1.5) {
      this.reset();
    }
  }

  draw(ctx) {
    const alpha = (Math.sin(this.phase) + 1) * 0.5;
    if (alpha < 0.1) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;

    // Draw star shape
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const x = this.x + Math.cos(angle) * this.size;
      const y = this.y + Math.sin(angle) * this.size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);

      const innerAngle = ((i + 0.5) / 4) * Math.PI * 2;
      const innerX = this.x + Math.cos(innerAngle) * this.size * 0.3;
      const innerY = this.y + Math.sin(innerAngle) * this.size * 0.3;
      ctx.lineTo(innerX, innerY);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

/**
 * Draw DBZ-style aura frame
 */
function drawAuraFrame(ctx, frame, totalFrames, config) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const { color1, color2, innerColor, particles, sparks, glitters, showSparks } = config;
  const progress = frame / totalFrames;
  const time = progress * Math.PI * 2;

  // Update and draw particles
  particles.forEach(p => {
    p.update();
    p.draw(ctx);
  });

  // Draw base aura glow around edges
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2 + 50; // Offset down to simulate person center
  const auraRadius = Math.min(WIDTH, HEIGHT) * 0.45;

  // Outer glow with pulsing
  const pulseScale = 1 + Math.sin(time * 3) * 0.05;

  for (let layer = 0; layer < 3; layer++) {
    const layerRadius = auraRadius * (1.1 - layer * 0.15) * pulseScale;
    const gradient = ctx.createRadialGradient(
      centerX, centerY, layerRadius * 0.3,
      centerX, centerY, layerRadius
    );

    const layerAlpha = (0.15 - layer * 0.04).toFixed(2);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.5, 'transparent');
    gradient.addColorStop(0.7, color2 + Math.floor(parseFloat(layerAlpha) * 128).toString(16).padStart(2, '0'));
    gradient.addColorStop(0.9, color1 + Math.floor(parseFloat(layerAlpha) * 200).toString(16).padStart(2, '0'));
    gradient.addColorStop(1, color1 + Math.floor(parseFloat(layerAlpha) * 255).toString(16).padStart(2, '0'));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Inner core glow
  if (innerColor) {
    const innerGradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, auraRadius * 0.5
    );
    innerGradient.addColorStop(0, innerColor + '44');
    innerGradient.addColorStop(0.5, innerColor + '22');
    innerGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = innerGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Draw electric sparks
  if (showSparks) {
    sparks.forEach(s => {
      s.update();
      s.draw(ctx);
    });
  }

  // Draw glitter particles
  glitters.forEach(g => {
    g.update();
    g.draw(ctx);
  });
}

/**
 * Generate an aura GIF with specific colors
 */
async function generateAura(name, color1, color2, innerColor = null, showSparks = true) {
  console.log(`Generating ${name} aura...`);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  const outputPath = path.join(OUTPUT_DIR, `${name}-aura.gif`);
  const stream = fs.createWriteStream(outputPath);

  encoder.createReadStream().pipe(stream);
  encoder.start();
  encoder.setRepeat(0);   // Loop forever
  encoder.setDelay(FRAME_DELAY);
  encoder.setQuality(10);
  encoder.setTransparent(0x000000); // Black is transparent

  // Create flame particles along edges
  const particles = [];
  const edgePositions = [];

  // Bottom edge flames (more dense)
  for (let x = 50; x < WIDTH - 50; x += 20) {
    edgePositions.push({ x, y: HEIGHT - 20, isInner: false });
    edgePositions.push({ x: x + 10, y: HEIGHT - 10, isInner: true });
  }

  // Side edge flames
  for (let y = HEIGHT - 50; y > 100; y -= 40) {
    edgePositions.push({ x: 30, y, isInner: false });
    edgePositions.push({ x: WIDTH - 30, y, isInner: false });
  }

  edgePositions.forEach(pos => {
    particles.push(new FlameParticle(pos.x, pos.y, color1, color2, pos.isInner));
  });

  // Create spark particles
  const sparks = [];
  for (let i = 0; i < 5; i++) {
    sparks.push(new SparkParticle(WIDTH / 2, HEIGHT / 2 + 50, Math.min(WIDTH, HEIGHT) * 0.4));
  }

  // Create glitter particles
  const glitters = [];
  for (let i = 0; i < 30; i++) {
    glitters.push(new GlitterParticle(WIDTH / 2, HEIGHT / 2, Math.min(WIDTH, HEIGHT) * 0.5));
  }

  const config = { color1, color2, innerColor, particles, sparks, glitters, showSparks };

  for (let frame = 0; frame < FRAMES; frame++) {
    // Clear with black (will be transparent)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawAuraFrame(ctx, frame, FRAMES, config);
    encoder.addFrame(ctx);
  }

  encoder.finish();

  await new Promise(resolve => stream.on('finish', resolve));
  console.log(`  Created: ${outputPath}`);

  return outputPath;
}

async function main() {
  console.log('Generating DBZ-style aura effects...\n');

  // Generate different color auras based on DBZ styles
  const auras = [
    // Super Saiyan - gold/yellow with white core
    { name: 'gold', color1: '#FFD700', color2: '#FFA500', inner: '#FFFACD', sparks: false },
    // SSGSS/Blue - intense cyan blue
    { name: 'blue', color1: '#00BFFF', color2: '#1E90FF', inner: '#E0FFFF', sparks: true },
    // Rose - pink/magenta
    { name: 'pink', color1: '#FF69B4', color2: '#FF1493', inner: '#FFE4E1', sparks: false },
    // Legendary/Broly - green
    { name: 'green', color1: '#00FF00', color2: '#32CD32', inner: '#ADFF2F', sparks: true },
    // Ultra Instinct - silver/white with purple tinge
    { name: 'silver', color1: '#C0C0C0', color2: '#9370DB', inner: '#FFFFFF', sparks: true },
    // Villain/Evil - purple/dark
    { name: 'purple', color1: '#9400D3', color2: '#4B0082', inner: '#DDA0DD', sparks: true },
    // Rage/Kaioken - red
    { name: 'red', color1: '#FF0000', color2: '#DC143C', inner: '#FF6347', sparks: false },
  ];

  for (const aura of auras) {
    await generateAura(aura.name, aura.color1, aura.color2, aura.inner, aura.sparks);
  }

  console.log('\nDone! Example auras saved to examples/ directory.');
  console.log('To use: Add an effect in the extension and upload one of these GIFs.');
  console.log('\nFor more authentic effects, download PNG sequences from FootageCrate');
  console.log('and convert them using: node scripts/png-to-gif.js <input-folder> <output.gif>');
}

main().catch(console.error);
