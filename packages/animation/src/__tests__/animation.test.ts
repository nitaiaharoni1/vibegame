import { describe, it, expect, vi } from 'vitest';
import { createWorld, addEntity, stepWorld } from '@vigame/core';
import { Easing } from '../easing.js';
import { createTween, TweenSystem } from '../tween.js';
import { playClip, AnimationClipSystem } from '../clip.js';
import type { AnimationClip } from '../clip.js';
import { AnimationPlugin } from '../animation-plugin.js';

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------
describe('Easing functions', () => {
  const fns = [
    'linear',
    'easeIn',
    'easeOut',
    'easeInOut',
    'easeInCubic',
    'easeOutCubic',
    'easeInOutCubic',
    'bounce',
  ] as const;

  for (const name of fns) {
    it(`${name}(0) === 0`, () => {
      expect(Easing[name](0)).toBeCloseTo(0, 5);
    });
    it(`${name}(1) === 1`, () => {
      expect(Easing[name](1)).toBeCloseTo(1, 5);
    });
  }
});

// ---------------------------------------------------------------------------
// createTween
// ---------------------------------------------------------------------------
describe('createTween', () => {
  function makeWorld() {
    const world = createWorld();
    world.systems.push(TweenSystem);
    return world;
  }

  it('calls onUpdate on each tick', () => {
    const world = makeWorld();
    const updates: number[] = [];
    createTween(world, {
      duration: 1,
      onUpdate: (v) => updates.push(v),
    });
    stepWorld(world, 0.5);
    expect(updates.length).toBe(1);
    expect(updates[0]).toBeCloseTo(0.5, 5);
  });

  it('progresses from 0 to 1 over duration', () => {
    const world = makeWorld();
    const values: number[] = [];
    createTween(world, {
      duration: 1,
      onUpdate: (v) => values.push(v),
    });
    stepWorld(world, 0);
    stepWorld(world, 0.25);
    stepWorld(world, 0.25);
    stepWorld(world, 0.25);
    stepWorld(world, 0.25);
    // Should reach 1 at the end
    expect(values[values.length - 1]).toBeCloseTo(1, 5);
  });

  it('fires onComplete when tween finishes', () => {
    const world = makeWorld();
    const complete = vi.fn();
    createTween(world, { duration: 0.5, onComplete: complete });
    stepWorld(world, 0.5);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('cancel() stops the tween from advancing', () => {
    const world = makeWorld();
    const updates: number[] = [];
    const { cancel } = createTween(world, {
      duration: 1,
      onUpdate: (v) => updates.push(v),
    });
    stepWorld(world, 0.3);
    cancel();
    stepWorld(world, 0.3);
    // After cancel the tween is removed; no further updates
    expect(updates.length).toBe(1);
  });

  it('loop resets elapsed after duration', () => {
    const world = makeWorld();
    const values: number[] = [];
    createTween(world, {
      duration: 1,
      loop: true,
      onUpdate: (v) => values.push(v),
    });
    // First full loop
    stepWorld(world, 1);
    // Second half of second loop
    stepWorld(world, 0.5);
    // After 1.5s total the progress in second loop should be ~0.5
    const last = values[values.length - 1];
    expect(last).toBeCloseTo(0.5, 5);
  });

  it('applies custom easing', () => {
    const world = makeWorld();
    const values: number[] = [];
    createTween(world, {
      duration: 1,
      easing: Easing.easeIn,
      onUpdate: (v) => values.push(v),
    });
    stepWorld(world, 0.5);
    // easeIn(0.5) = 0.25
    expect(values[0]).toBeCloseTo(0.25, 5);
  });

  it('pingPong reaches peak at mid-point', () => {
    const world = makeWorld();
    const values: number[] = [];
    createTween(world, {
      duration: 1,
      pingPong: true,
      onUpdate: (v) => values.push(v),
    });
    stepWorld(world, 0.5);
    // At 0.5 progress with pingPong, mapped progress = 1.0
    expect(values[0]).toBeCloseTo(1, 5);
  });

  it('does not call onComplete when cancelled', () => {
    const world = makeWorld();
    const complete = vi.fn();
    const { cancel } = createTween(world, { duration: 0.5, onComplete: complete });
    cancel();
    stepWorld(world, 1);
    expect(complete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// playClip
// ---------------------------------------------------------------------------
describe('playClip', () => {
  function makeWorld() {
    const world = createWorld();
    world.systems.push(AnimationClipSystem);
    return world;
  }

  function makeEntityWithComponent(world: ReturnType<typeof makeWorld>) {
    const eid = addEntity(world);
    const store = new Map<number, Record<string, unknown>>();
    store.set(eid, { px: 0 });
    world.components.set('Transform3D', store);
    return eid;
  }

  const simpleClip: AnimationClip = {
    name: 'move',
    duration: 1,
    tracks: [
      {
        componentName: 'Transform3D',
        property: 'px',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 100 },
        ],
      },
    ],
  };

  it('applies track value at mid-point', () => {
    const world = makeWorld();
    const eid = makeEntityWithComponent(world);
    playClip(world, eid, simpleClip);
    stepWorld(world, 0.5);
    const data = world.components.get('Transform3D')?.get(eid);
    expect(data?.['px']).toBeCloseTo(50, 5);
  });

  it('reaches final value at end of clip', () => {
    const world = makeWorld();
    const eid = makeEntityWithComponent(world);
    playClip(world, eid, simpleClip);
    stepWorld(world, 1);
    const data = world.components.get('Transform3D')?.get(eid);
    expect(data?.['px']).toBeCloseTo(100, 5);
  });

  it('fires onComplete when clip ends', () => {
    const world = makeWorld();
    const eid = makeEntityWithComponent(world);
    const complete = vi.fn();
    playClip(world, eid, simpleClip, { onComplete: complete });
    stepWorld(world, 1);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('loop: replays after duration', () => {
    const world = makeWorld();
    const eid = makeEntityWithComponent(world);
    playClip(world, eid, simpleClip, { loop: true });
    // Two separate steps: after the first full loop, a second partial step should re-animate
    stepWorld(world, 1);  // completes first loop, resets elapsed to 0
    stepWorld(world, 0.5); // 0.5 into second loop -> value ~50
    const data = world.components.get('Transform3D')?.get(eid);
    expect(data?.['px']).toBeCloseTo(50, 5);
  });

  it('stop() halts further updates', () => {
    const world = makeWorld();
    const eid = makeEntityWithComponent(world);
    const { stop } = playClip(world, eid, simpleClip);
    stepWorld(world, 0.2);
    const valueBefore = (world.components.get('Transform3D')?.get(eid) ?? {})['px'] as number;
    stop();
    stepWorld(world, 0.5);
    const valueAfter = (world.components.get('Transform3D')?.get(eid) ?? {})['px'] as number;
    expect(valueBefore).toBeCloseTo(valueAfter, 5);
  });

  it('does nothing for missing component store', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    // No store registered for this entity
    expect(() => {
      playClip(world, eid, simpleClip);
      stepWorld(world, 0.5);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AnimationPlugin
// ---------------------------------------------------------------------------
describe('AnimationPlugin', () => {
  it('has correct name', () => {
    const plugin = AnimationPlugin();
    expect(plugin.name).toBe('AnimationPlugin');
  });

  it('returns TweenSystem and AnimationClipSystem', () => {
    const world = createWorld();
    const plugin = AnimationPlugin();
    const systems = plugin.systems?.(world) ?? [];
    expect(systems.map((s) => s.name)).toContain('TweenSystem');
    expect(systems.map((s) => s.name)).toContain('AnimationClipSystem');
  });
});
