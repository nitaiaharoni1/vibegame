import { describe, it, expect, vi } from 'vitest';
import { createWorld, addEntity, addComponent, on, stepWorld } from '@vigame/core';
import { Health, Score, Collectible, Inventory } from '../components.js';
import { HealthRegenSystem } from '../systems.js';
import {
  damage,
  heal,
  isAlive,
  collect,
  addScore,
  DamageEvent,
  DeathEvent,
} from '../api.js';

function makeWorld() {
  return createWorld();
}

describe('damage()', () => {
  it('reduces health by the given amount', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 100, max: 100 });
    damage(world, eid, 30);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(70);
  });

  it('cannot reduce health below 0', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 20, max: 100 });
    damage(world, eid, 999);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(0);
  });

  it('does nothing when entity has no Health component', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    expect(() => damage(world, eid, 10)).not.toThrow();
  });

  it('does nothing when entity is invincible', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 100, max: 100, invincible: true });
    damage(world, eid, 50);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(100);
  });
});

describe('heal()', () => {
  it('increases health', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 50, max: 100 });
    heal(world, eid, 30);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(80);
  });

  it('does not exceed max health', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 90, max: 100 });
    heal(world, eid, 50);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(100);
  });
});

describe('isAlive()', () => {
  it('returns false when health is 0', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 0, max: 100 });
    expect(isAlive(world, eid)).toBe(false);
  });

  it('returns true when health is > 0', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 1, max: 100 });
    expect(isAlive(world, eid)).toBe(true);
  });

  it('returns true for entities without Health', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    expect(isAlive(world, eid)).toBe(true);
  });
});

describe('collect()', () => {
  it('marks collectible as collected and adds score', () => {
    const world = makeWorld();
    const player = addEntity(world);
    const coin = addEntity(world);
    addComponent(world, player, Score, { value: 0, multiplier: 1 });
    addComponent(world, coin, Collectible, { type: 'coin', value: 10, collected: false });

    const result = collect(world, player, coin);
    expect(result).toBe(true);

    const c = world.components.get('Collectible')?.get(coin) as { collected: boolean } | undefined;
    expect(c?.collected).toBe(true);

    const s = world.components.get('Score')?.get(player) as { value: number } | undefined;
    expect(s?.value).toBe(10);
  });

  it('returns false if already collected', () => {
    const world = makeWorld();
    const player = addEntity(world);
    const coin = addEntity(world);
    addComponent(world, coin, Collectible, { type: 'coin', value: 5, collected: true });

    const result = collect(world, player, coin);
    expect(result).toBe(false);
  });

  it('adds gold to inventory when type is coin', () => {
    const world = makeWorld();
    const player = addEntity(world);
    const coin = addEntity(world);
    addComponent(world, player, Inventory, { capacity: 10, gold: 5 });
    addComponent(world, coin, Collectible, { type: 'coin', value: 3, collected: false });

    collect(world, player, coin);

    const inv = world.components.get('Inventory')?.get(player) as { gold: number } | undefined;
    expect(inv?.gold).toBe(8);
  });
});

describe('addScore()', () => {
  it('applies multiplier when adding score', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Score, { value: 0, multiplier: 2 });
    addScore(world, eid, 10);
    const s = world.components.get('Score')?.get(eid) as { value: number } | undefined;
    expect(s?.value).toBe(20);
  });
});

describe('HealthRegenSystem', () => {
  it('regenerates health over time', () => {
    const world = makeWorld();
    world.systems.push(HealthRegenSystem);
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 50, max: 100, regenRate: 10 });
    stepWorld(world, 1); // 1 second
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBeCloseTo(60);
  });

  it('does not exceed max health', () => {
    const world = makeWorld();
    world.systems.push(HealthRegenSystem);
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 95, max: 100, regenRate: 10 });
    stepWorld(world, 1);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(100);
  });

  it('does not regen when regenRate is 0', () => {
    const world = makeWorld();
    world.systems.push(HealthRegenSystem);
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 50, max: 100, regenRate: 0 });
    stepWorld(world, 1);
    const h = world.components.get('Health')?.get(eid) as { current: number } | undefined;
    expect(h?.current).toBe(50);
  });
});

describe('Events', () => {
  it('DamageEvent fires on damage', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 100, max: 100 });

    const handler = vi.fn();
    on(world, DamageEvent, handler);
    damage(world, eid, 25);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ target: eid, amount: 25 }));
  });

  it('DeathEvent fires when health reaches 0', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 10, max: 100 });

    const deathHandler = vi.fn();
    on(world, DeathEvent, deathHandler);
    damage(world, eid, 10);

    expect(deathHandler).toHaveBeenCalledOnce();
    expect(deathHandler).toHaveBeenCalledWith(expect.objectContaining({ entity: eid }));
  });

  it('DeathEvent does NOT fire when health is > 0 after damage', () => {
    const world = makeWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Health, { current: 100, max: 100 });

    const deathHandler = vi.fn();
    on(world, DeathEvent, deathHandler);
    damage(world, eid, 50);

    expect(deathHandler).not.toHaveBeenCalled();
  });
});
