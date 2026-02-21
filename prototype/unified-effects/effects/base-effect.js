/**
 * Base class for all transition effects.
 * Provides lifecycle: trigger -> active -> update -> render -> deactivate.
 * Toggle effects (isToggle = true) stay active until explicitly deactivated.
 */
export class BaseEffect {
  constructor() {
    this.active = false;
    this.startTime = 0;
    this.duration = 1000;
    this.isToggle = false;
  }

  trigger(timestamp, ...args) {
    this.active = true;
    this.startTime = timestamp;
    this.onTrigger(timestamp, ...args);
  }

  onTrigger() {}

  deactivate() {
    this.active = false;
    this.onDeactivate();
  }

  onDeactivate() {}

  update(ctx, timestamp, w, h) {
    if (!this.active) return;
    if (this.isToggle) {
      this.render(ctx, 0, timestamp - this.startTime, w, h);
      return;
    }
    const elapsed = timestamp - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);
    this.render(ctx, progress, elapsed, w, h);
    if (progress >= 1) this.active = false;
  }

  render() {}
}
