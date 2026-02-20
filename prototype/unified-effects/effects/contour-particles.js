/**
 * ContourParticlesEffect — luminous particles emitted from person
 * contour edge, drifting outward with physics and additive blending.
 */

import { BaseEffect } from './base-effect.js';
import { easeOutCubic } from './utils.js';

export class ContourParticlesEffect extends BaseEffect {
  constructor() {
    super();
    this.duration = 10000;
    this._contour = [];
    this._particles = [];
    this._maxParticles = 150;
  }

  onTrigger(_ts, contour) {
    this._contour = contour || [];
    this._particles = [];
  }

  render(ctx, progress, _elapsed) {
    if (this._contour.length < 5) return;
    const fade = progress > 0.8 ? 1 - easeOutCubic((progress - 0.8) / 0.2) : 1;

    // Spawn particles
    if (this._particles.length < this._maxParticles) {
      const count = 2 + Math.floor(Math.random() * 3);
      for (let s = 0; s < count; s++) {
        this._spawnParticle();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const alive = [];
    for (const p of this._particles) {
      p.age += 16;
      if (p.age > p.lifetime) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;

      const lifeRatio = p.age / p.lifetime;
      const alpha = fade * (1 - lifeRatio);
      const radius = p.radius * (1 - lifeRatio * 0.5);

      // Glow halo
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2);
      grad.addColorStop(0, `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha})`);
      grad.addColorStop(1, `rgba(${p.r}, ${p.g}, ${p.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - radius * 2, p.y - radius * 2, radius * 4, radius * 4);

      // Core dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha * 0.9})`;
      ctx.fill();

      alive.push(p);
    }

    this._particles = alive;
    ctx.restore();
  }

  _spawnParticle() {
    const idx = Math.floor(Math.random() * this._contour.length);
    const p = this._contour[idx];
    const prev = this._contour[(idx - 1 + this._contour.length) % this._contour.length];
    const next = this._contour[(idx + 1) % this._contour.length];

    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;

    const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.2;
    const speed = 0.5 + Math.random() * 1.5;

    this._particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 2,
      lifetime: 1500 + Math.random() * 1500,
      age: 0,
      r: 255, g: 220, b: 150,
    });
  }
}
