import type { World } from '@vigame/core';
import { defineSystem } from '@vigame/core';
import type { EasingFn } from './easing.js';
import { Easing } from './easing.js';

export interface TweenOptions {
  duration: number; // seconds
  easing?: EasingFn;
  onUpdate?: (value: number) => void;
  onComplete?: () => void;
  loop?: boolean;
  pingPong?: boolean;
}

interface ActiveTween {
  elapsed: number;
  duration: number;
  easing: EasingFn;
  onUpdate: ((value: number) => void) | undefined;
  onComplete: (() => void) | undefined;
  loop: boolean;
  pingPong: boolean;
  done: boolean;
}

const tweenRegistry = new WeakMap<World, Set<ActiveTween>>();

function getTweens(world: World): Set<ActiveTween> {
  let s = tweenRegistry.get(world);
  if (!s) {
    s = new Set();
    tweenRegistry.set(world, s);
  }
  return s;
}

export function createTween(world: World, options: TweenOptions): { cancel: () => void } {
  const t: ActiveTween = {
    elapsed: 0,
    duration: options.duration,
    easing: options.easing ?? Easing.linear,
    onUpdate: options.onUpdate,
    onComplete: options.onComplete,
    loop: options.loop ?? false,
    pingPong: options.pingPong ?? false,
    done: false,
  };
  getTweens(world).add(t);
  return { cancel: () => { t.done = true; } };
}

export const TweenSystem = defineSystem({
  name: 'TweenSystem',
  phase: 1, // Update
  execute(world: World, delta: number) {
    const active = getTweens(world);
    for (const t of active) {
      if (t.done) {
        active.delete(t);
        continue;
      }
      t.elapsed += delta;
      let progress = Math.min(t.elapsed / t.duration, 1);
      if (t.pingPong) {
        progress = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
      }
      const value = t.easing(progress);
      t.onUpdate?.(value);
      if (t.elapsed >= t.duration) {
        if (t.loop) {
          t.elapsed -= t.duration;
        } else {
          t.done = true;
          active.delete(t);
          t.onComplete?.();
        }
      }
    }
  },
});
