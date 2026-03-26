import { describe, it, expect } from 'vitest';
import { createWorld } from '@vigame/core';
import {
  InputPlugin,
  getInputState,
  isKeyDown,
  isKeyJustPressed,
  isKeyJustReleased,
  getMousePosition,
  getMouseDelta,
} from '../input-plugin.js';

function createTestWorld() {
  const plugin = InputPlugin();
  const world = createWorld({ plugins: [plugin] });
  return { world, plugin };
}

describe('InputPlugin', () => {
  it('returns undefined state for world without plugin', () => {
    const world = createWorld();
    expect(getInputState(world)).toBeUndefined();
  });

  it('returns InputState after plugin setup', () => {
    const { world } = createTestWorld();
    expect(getInputState(world)).toBeDefined();
  });

  it('isKeyDown returns false initially', () => {
    const { world } = createTestWorld();
    expect(isKeyDown(world, 'KeyA')).toBe(false);
  });

  it('isKeyJustPressed returns false initially', () => {
    const { world } = createTestWorld();
    expect(isKeyJustPressed(world, 'KeyA')).toBe(false);
  });

  it('isKeyJustReleased returns false initially', () => {
    const { world } = createTestWorld();
    expect(isKeyJustReleased(world, 'KeyA')).toBe(false);
  });

  it('isKeyDown returns true after manually setting key in state', () => {
    const { world } = createTestWorld();
    const state = getInputState(world)!;
    state.keysDown.add('KeyA');
    expect(isKeyDown(world, 'KeyA')).toBe(true);
  });

  it('isKeyJustPressed returns true then false after flush', () => {
    const { world } = createTestWorld();
    const state = getInputState(world)!;
    state.keysDown.add('Space');
    state.keysJustPressed.add('Space');

    expect(isKeyJustPressed(world, 'Space')).toBe(true);

    // Run the flush system manually
    const plugin = world.plugins.find(p => p.name === 'InputPlugin')!;
    const systems = plugin.systems!(world);
    const flushSystem = systems.find(s => s.name === 'InputFlush')!;
    flushSystem.execute(world, 1 / 60);

    expect(isKeyJustPressed(world, 'Space')).toBe(false);
    // key is still held down
    expect(isKeyDown(world, 'Space')).toBe(true);
  });

  it('isKeyJustReleased is true after key up, false after flush', () => {
    const { world } = createTestWorld();
    const state = getInputState(world)!;
    // Simulate key down then up
    state.keysDown.add('ArrowUp');
    state.keysDown.delete('ArrowUp');
    state.keysJustReleased.add('ArrowUp');

    expect(isKeyJustReleased(world, 'ArrowUp')).toBe(true);
    expect(isKeyDown(world, 'ArrowUp')).toBe(false);

    const plugin = world.plugins.find(p => p.name === 'InputPlugin')!;
    const systems = plugin.systems!(world);
    const flushSystem = systems.find(s => s.name === 'InputFlush')!;
    flushSystem.execute(world, 1 / 60);

    expect(isKeyJustReleased(world, 'ArrowUp')).toBe(false);
  });

  it('getMousePosition returns {x:0,y:0} when no state', () => {
    const world = createWorld();
    expect(getMousePosition(world)).toEqual({ x: 0, y: 0 });
  });

  it('getMouseDelta returns {x:0,y:0} when no state', () => {
    const world = createWorld();
    expect(getMouseDelta(world)).toEqual({ x: 0, y: 0 });
  });

  it('getMousePosition returns current position from state', () => {
    const { world } = createTestWorld();
    const state = getInputState(world)!;
    state.mouseX = 100;
    state.mouseY = 200;
    expect(getMousePosition(world)).toEqual({ x: 100, y: 200 });
  });
});
