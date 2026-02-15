import { describe, it, expect, vi } from 'vitest';
import {
  BaseEffect,
} from '../../../prototype/multi-region-art/effects/base-effect.js';

describe('BaseEffect', () => {
  it('starts inactive', () => {
    const effect = new BaseEffect();
    expect(effect.active).toBe(false);
    expect(effect.startTime).toBe(0);
    expect(effect.duration).toBe(1000);
  });

  it('becomes active after trigger()', () => {
    const effect = new BaseEffect();
    effect.trigger(100);
    expect(effect.active).toBe(true);
    expect(effect.startTime).toBe(100);
  });

  it('calls onTrigger with extra args', () => {
    const effect = new BaseEffect();
    effect.onTrigger = vi.fn();
    effect.trigger(50, 'a', 'b');
    expect(effect.onTrigger).toHaveBeenCalledWith(50, 'a', 'b');
  });

  it('calls render during update when active', () => {
    const effect = new BaseEffect();
    effect.render = vi.fn();
    effect.trigger(0);
    effect.update({}, 500, 640, 480);
    expect(effect.render).toHaveBeenCalledWith(
      {}, 0.5, 500, 640, 480
    );
  });

  it('does not call render when inactive', () => {
    const effect = new BaseEffect();
    effect.render = vi.fn();
    effect.update({}, 500, 640, 480);
    expect(effect.render).not.toHaveBeenCalled();
  });

  it('deactivates when progress reaches 1', () => {
    const effect = new BaseEffect();
    effect.trigger(0);
    effect.update({}, 1000, 640, 480);
    expect(effect.active).toBe(false);
  });

  it('deactivates when elapsed exceeds duration', () => {
    const effect = new BaseEffect();
    effect.trigger(0);
    effect.update({}, 2000, 640, 480);
    expect(effect.active).toBe(false);
  });

  it('stays active while progress < 1', () => {
    const effect = new BaseEffect();
    effect.trigger(0);
    effect.update({}, 500, 640, 480);
    expect(effect.active).toBe(true);
  });
});
