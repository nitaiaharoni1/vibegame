import { describe, it, expect } from 'vitest';
import { createWorld } from '@vigame/core';
import { AudioSource, AudioListener } from '../components.js';
import { AudioPlugin, playSound, getAudioContext } from '../audio-plugin.js';

// ---------------------------------------------------------------------------
// Component definitions
// ---------------------------------------------------------------------------
describe('AudioSource component', () => {
  it('is defined with name AudioSource', () => {
    expect(AudioSource.name).toBe('AudioSource');
  });

  it('has a src field with default empty string', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.src).toBe('');
  });

  it('has volume field with default 1.0', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.volume).toBeCloseTo(1.0);
  });

  it('has loop field defaulting to false', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.loop).toBe(false);
  });

  it('has autoPlay field defaulting to false', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.autoPlay).toBe(false);
  });

  it('has spatial field defaulting to false', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.spatial).toBe(false);
  });

  it('has maxDistance field with default 100', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.maxDistance).toBe(100);
  });

  it('has rolloffFactor field with default 1', () => {
    const defaults = AudioSource.defaults();
    expect(defaults.rolloffFactor).toBe(1);
  });

  it('schema contains all expected keys', () => {
    const keys = Object.keys(AudioSource.schema);
    expect(keys).toContain('src');
    expect(keys).toContain('volume');
    expect(keys).toContain('loop');
    expect(keys).toContain('autoPlay');
    expect(keys).toContain('spatial');
    expect(keys).toContain('maxDistance');
    expect(keys).toContain('rolloffFactor');
  });
});

describe('AudioListener component', () => {
  it('is defined with name AudioListener', () => {
    expect(AudioListener.name).toBe('AudioListener');
  });

  it('has active field defaulting to true', () => {
    const defaults = AudioListener.defaults();
    expect(defaults.active).toBe(true);
  });

  it('schema contains active key', () => {
    expect(Object.keys(AudioListener.schema)).toContain('active');
  });
});

// ---------------------------------------------------------------------------
// AudioPlugin
// ---------------------------------------------------------------------------
describe('AudioPlugin', () => {
  it('has correct name', () => {
    const plugin = AudioPlugin();
    expect(plugin.name).toBe('AudioPlugin');
  });

  it('returns empty systems array (event-driven)', () => {
    const world = createWorld();
    const plugin = AudioPlugin();
    const systems = plugin.systems?.(world) ?? [];
    expect(systems).toHaveLength(0);
  });

  it('setup does not throw in Node environment', () => {
    const world = createWorld();
    const plugin = AudioPlugin();
    expect(() => plugin.setup(world)).not.toThrow();
  });

  it('getAudioContext returns undefined in Node environment', () => {
    const world = createWorld();
    const plugin = AudioPlugin();
    plugin.setup(world);
    // AudioContext is not available in Node; should be undefined
    expect(getAudioContext(world)).toBeUndefined();
  });

  it('teardown does not throw when no AudioContext', () => {
    const world = createWorld();
    const plugin = AudioPlugin();
    plugin.setup(world);
    expect(() => plugin.teardown?.(world)).not.toThrow();
  });

  it('vgxTags returns audio-source and audio-listener handlers', () => {
    const plugin = AudioPlugin();
    const tags = plugin.vgxTags?.() ?? {};
    expect(tags).toHaveProperty('audio-source');
    expect(tags).toHaveProperty('audio-listener');
  });
});

// ---------------------------------------------------------------------------
// playSound
// ---------------------------------------------------------------------------
describe('playSound', () => {
  it('is graceful (does not throw) when called in Node with no AudioContext', async () => {
    const world = createWorld();
    // AudioContext is not available in Node; playSound should return early
    await expect(playSound(world, 'test.mp3')).resolves.toBeUndefined();
  });

  it('accepts optional volume and loop params without throwing', async () => {
    const world = createWorld();
    await expect(
      playSound(world, 'test.mp3', { volume: 0.5, loop: true }),
    ).resolves.toBeUndefined();
  });
});
