import type { World, EntityId } from '@vigame/core';
import { getComponent, setComponent, hasComponent, emit, defineEvent } from '@vigame/core';
import { Health, Score, Collectible, Inventory } from './components.js';

// Events
export const DamageEvent = defineEvent<{ target: EntityId; amount: number; source?: EntityId }>('Damage');
export const HealEvent = defineEvent<{ target: EntityId; amount: number }>('Heal');
export const DeathEvent = defineEvent<{ entity: EntityId }>('Death');
export const CollectEvent = defineEvent<{ collector: EntityId; collectible: EntityId; type: string; value: number }>('Collect');

export function damage(world: World, eid: EntityId, amount: number, source?: EntityId): void {
  const h = getComponent(world, eid, Health);
  if (!h || h.invincible) return;
  const newCurrent = Math.max(0, h.current - amount);
  setComponent(world, eid, Health, { current: newCurrent });
  const damagePayload: { target: EntityId; amount: number; source?: EntityId } = { target: eid, amount };
  if (source !== undefined) damagePayload.source = source;
  emit(world, DamageEvent, damagePayload);
  if (newCurrent === 0) {
    emit(world, DeathEvent, { entity: eid });
  }
}

export function heal(world: World, eid: EntityId, amount: number): void {
  const h = getComponent(world, eid, Health);
  if (!h) return;
  const newCurrent = Math.min(h.max, h.current + amount);
  setComponent(world, eid, Health, { current: newCurrent });
  emit(world, HealEvent, { target: eid, amount });
}

export function addScore(world: World, eid: EntityId, points: number): void {
  const s = getComponent(world, eid, Score);
  if (!s) return;
  setComponent(world, eid, Score, { value: s.value + points * s.multiplier });
}

export function collect(world: World, collectorEid: EntityId, collectibleEid: EntityId): boolean {
  const c = getComponent(world, collectibleEid, Collectible);
  if (!c || c.collected) return false;
  setComponent(world, collectibleEid, Collectible, { collected: true });

  // Add score if collector has Score
  if (hasComponent(world, collectorEid, Score)) {
    addScore(world, collectorEid, c.value);
  }

  // Add gold if inventory and type is coin
  if (hasComponent(world, collectorEid, Inventory) && c.type === 'coin') {
    const inv = getComponent(world, collectorEid, Inventory)!;
    setComponent(world, collectorEid, Inventory, { gold: inv.gold + c.value });
  }

  emit(world, CollectEvent, { collector: collectorEid, collectible: collectibleEid, type: c.type, value: c.value });
  return true;
}

export function isAlive(world: World, eid: EntityId): boolean {
  const h = getComponent(world, eid, Health);
  return h ? h.current > 0 : true; // entities without health are always "alive"
}
