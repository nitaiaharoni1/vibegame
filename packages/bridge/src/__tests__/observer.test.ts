import { describe, expect, it } from 'vitest';
import { observeGame } from '../observer.js';

describe('observeGame', () => {
  it('should read explicit paths from registered roots', async () => {
    const roots = new Map<string, unknown>();
    roots.set('player', { x: 100, y: 200, health: 75 });

    const result = await observeGame({ paths: ['player.x', 'player.health'] }, roots);
    expect(result.state['player.x']).toBe(100);
    expect(result.state['player.health']).toBe(75);
  });

  it('should return undefined for missing paths', async () => {
    const roots = new Map<string, unknown>();
    roots.set('player', { x: 100 });

    const result = await observeGame({ paths: ['player.nonexistent'] }, roots);
    expect(result.state['player.nonexistent']).toBeUndefined();
  });

  it('should auto-discover entities with positions', async () => {
    const roots = new Map<string, unknown>();
    roots.set('scene', {
      children: [
        { x: 50, y: 60, name: 'ball', type: 'Sprite' },
        { x: 100, y: 200, name: 'player', type: 'Sprite' },
      ],
    });

    const result = await observeGame({ auto_discover: true, max_depth: 2 }, roots);
    expect(result.entities).toBeDefined();
    const names = result.entities!.map((e) => e.name);
    expect(names.some((n) => n.includes('ball'))).toBe(true);
    expect(names.some((n) => n.includes('player'))).toBe(true);
  });

  it('should discover Phaser scene named properties', async () => {
    const roots = new Map<string, unknown>();
    roots.set('scene', {
      sys: { settings: { active: true } },
      ball: { x: 50, y: 60, body: {} },
      players: [
        { x: 100, y: 200, body: {} },
        { x: 150, y: 250, body: {} },
      ],
      _internal: { x: 0, y: 0 },
    });

    const result = await observeGame({ auto_discover: true, max_depth: 2 }, roots);
    const names = result.entities!.map((e) => e.name);
    expect(names.some((n) => n === 'scene.ball')).toBe(true);
    expect(names.some((n) => n === 'scene.players[0]')).toBe(true);
    expect(names.some((n) => n === 'scene.players[1]')).toBe(true);
    expect(names.some((n) => n.includes('_internal'))).toBe(false);
  });

  it('should compute spatial distances', async () => {
    const roots = new Map<string, unknown>();
    roots.set('a', { x: 0, y: 0 });
    roots.set('b', { x: 3, y: 4 });

    const result = await observeGame({ spatial: true }, roots);
    expect(result.spatial).toBeDefined();
    expect(result.spatial?.length).toBeGreaterThan(0);
    const pair = result.spatial?.find(
      (s) => (s.from === 'a' && s.to === 'b') || (s.from === 'b' && s.to === 'a'),
    );
    expect(pair).toBeDefined();
    expect(pair?.distance).toBeCloseTo(5, 1);
  });

  it('should respect budget cap', async () => {
    const roots = new Map<string, unknown>();
    const children = Array.from({ length: 300 }, (_, i) => ({
      x: i,
      y: i,
      name: `entity${i}`,
      type: 'Sprite',
    }));
    roots.set('scene', { children });

    const result = await observeGame({ auto_discover: true, max_depth: 2 }, roots);
    expect(result.entities?.length).toBeLessThanOrEqual(200);
  });

  it('should use type-based naming for unnamed children', async () => {
    const roots = new Map<string, unknown>();
    roots.set('scene', {
      children: [
        { x: 0, y: 0, type: 'Sprite' },
        { x: 1, y: 1, type: 'Mesh' },
      ],
    });

    const result = await observeGame({ auto_discover: true, max_depth: 2 }, roots);
    const names = result.entities!.map((e) => e.name);
    expect(names.some((n) => n.includes('Sprite'))).toBe(true);
    expect(names.some((n) => n.includes('Mesh'))).toBe(true);
  });

  it('should return registered_roots in result', async () => {
    const roots = new Map<string, unknown>();
    roots.set('player', { x: 0, y: 0 });
    roots.set('scene', { children: [] });

    const result = await observeGame({}, roots);
    expect(result.registered_roots).toContain('player');
    expect(result.registered_roots).toContain('scene');
  });

  it('should return empty state when no paths requested', async () => {
    const roots = new Map<string, unknown>();
    roots.set('player', { x: 0 });

    const result = await observeGame({}, roots);
    expect(Object.keys(result.state)).toHaveLength(0);
  });

  it('should deduplicate entities that are the same object across roots', async () => {
    const ball = { x: 50, y: 60, name: 'ball', type: 'Sprite' };
    const scene = {
      sys: { settings: { active: true } },
      ball,
      children: { list: [ball] },
    };
    const roots = new Map<string, unknown>();
    roots.set('scene', scene);
    // Simulate Phaser: game root whose scene hierarchy overlaps
    roots.set('game', {
      scene: { scenes: [scene] },
    });

    const result = await observeGame({ auto_discover: true, max_depth: 3 }, roots);
    // The ball object should appear only once despite being reachable via multiple paths
    const ballEntities = result.entities!.filter(
      (e) => e.position?.x === 50 && e.position?.y === 60,
    );
    expect(ballEntities.length).toBe(1);
  });

  it('should set budget_exceeded when entity cap is hit', async () => {
    const roots = new Map<string, unknown>();
    const children = Array.from({ length: 300 }, (_, i) => ({
      x: i,
      y: i,
      name: `entity${i}`,
      type: 'Sprite',
    }));
    roots.set('scene', { children });

    const result = await observeGame({ auto_discover: true, max_depth: 2 }, roots);
    expect(result.budget_exceeded).toBe(true);
  });

  it('should not set budget_exceeded when under cap', async () => {
    const roots = new Map<string, unknown>();
    roots.set('scene', {
      children: [{ x: 1, y: 1, name: 'a', type: 'Sprite' }],
    });

    const result = await observeGame({ auto_discover: true, max_depth: 2 }, roots);
    expect(result.budget_exceeded).toBeUndefined();
  });

  it('should not produce zero-distance spatial pairs from deduplication', async () => {
    const ball = { x: 50, y: 60, name: 'ball', type: 'Sprite' };
    const player = { x: 100, y: 200, name: 'player', type: 'Sprite' };
    const scene = {
      sys: { settings: { active: true } },
      ball,
      player,
    };
    const roots = new Map<string, unknown>();
    roots.set('scene', scene);
    roots.set('game', { scene: { scenes: [scene] } });

    const result = await observeGame(
      { auto_discover: true, spatial: true, max_depth: 3 },
      roots,
    );
    const zeroPairs = (result.spatial ?? []).filter((s) => s.distance === 0);
    expect(zeroPairs.length).toBe(0);
  });
});
