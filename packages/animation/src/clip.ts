import type { World, EntityId } from '@vigame/core';
import { defineSystem } from '@vigame/core';
import type { EasingFn } from './easing.js';
import { Easing } from './easing.js';

export interface Keyframe {
  time: number;   // 0..1 normalized
  value: number;
}

export interface Track {
  componentName: string;  // e.g. 'Transform3D'
  property: string;       // e.g. 'px'
  keyframes: Keyframe[];
  easing?: EasingFn;
}

export interface AnimationClip {
  name: string;
  duration: number; // seconds
  tracks: Track[];
}

interface ActiveClip {
  eid: EntityId;
  clip: AnimationClip;
  elapsed: number;
  loop: boolean;
  done: boolean;
  onComplete: (() => void) | undefined;
}

const clipRegistry = new WeakMap<World, Set<ActiveClip>>();

function getClips(world: World): Set<ActiveClip> {
  let s = clipRegistry.get(world);
  if (!s) {
    s = new Set();
    clipRegistry.set(world, s);
  }
  return s;
}

export function playClip(
  world: World,
  eid: EntityId,
  clip: AnimationClip,
  options?: { loop?: boolean; onComplete?: () => void },
): { stop: () => void } {
  const active: ActiveClip = {
    eid,
    clip,
    elapsed: 0,
    loop: options?.loop ?? false,
    done: false,
    onComplete: options?.onComplete,
  };
  getClips(world).add(active);
  return { stop: () => { active.done = true; } };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleTrack(track: Track, progress: number): number {
  const kfs = track.keyframes;
  if (kfs.length === 0) return 0;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (progress <= first.time) return first.value;
  if (progress >= last.time) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (a === undefined || b === undefined) continue;
    if (progress >= a.time && progress <= b.time) {
      const localT = (progress - a.time) / (b.time - a.time);
      const eased = (track.easing ?? Easing.linear)(localT);
      return lerp(a.value, b.value, eased);
    }
  }
  return last.value;
}

export const AnimationClipSystem = defineSystem({
  name: 'AnimationClipSystem',
  phase: 1, // Update
  execute(world: World, delta: number) {
    const active = getClips(world);
    for (const a of active) {
      if (a.done) {
        active.delete(a);
        continue;
      }
      a.elapsed += delta;
      const progress = Math.min(a.elapsed / a.clip.duration, 1);

      // Apply tracks
      for (const track of a.clip.tracks) {
        const value = sampleTrack(track, progress);
        const store = (world.components as Map<string, Map<EntityId, Record<string, unknown>>>).get(track.componentName);
        if (store?.has(a.eid)) {
          const data = store.get(a.eid);
          if (data !== undefined) {
            data[track.property] = value;
          }
        }
      }

      if (a.elapsed >= a.clip.duration) {
        if (a.loop) {
          a.elapsed -= a.clip.duration;
        } else {
          a.done = true;
          active.delete(a);
          a.onComplete?.();
        }
      }
    }
  },
});
