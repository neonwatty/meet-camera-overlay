/**
 * Base class for all transition effects.
 * Provides lifecycle: trigger -> active -> update -> render -> deactivate.
 */
export class BaseEffect {
  constructor() {
    this.active = false;
    this.startTime = 0;
    this.duration = 1000;
  }

  trigger(timestamp, ...args) {
    this.active = true;
    this.startTime = timestamp;
    this.onTrigger(timestamp, ...args);
  }

  onTrigger() {}

  update(ctx, timestamp, w, h) {
    if (!this.active) return;
    const elapsed = timestamp - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);
    this.render(ctx, progress, elapsed, w, h);
    if (progress >= 1) this.active = false;
  }

  render() {}
}
