import type { VibePlugin, World, EntityId } from '@vigame/core';
import { addComponent } from '@vigame/core';
import { HealthRegenSystem } from './systems.js';
import { Health, Inventory, Score, Collectible } from './components.js';

function coerceNum(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

export function GameplayPlugin(): VibePlugin {
  return {
    name: 'GameplayPlugin',
    setup(_world: World) {},
    systems(_world: World) {
      return [HealthRegenSystem];
    },
    vgxTags() {
      return {
        health(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Health, {
            current: coerceNum(attrs['current'], 100),
            max: coerceNum(attrs['max'], 100),
            regenRate: coerceNum(attrs['regen-rate'], 0),
          });
        },
        inventory(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Inventory, {
            capacity: coerceNum(attrs['capacity'], 10),
            gold: coerceNum(attrs['gold'], 0),
          });
        },
        score(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Score, {
            value: coerceNum(attrs['value'], 0),
            multiplier: coerceNum(attrs['multiplier'], 1),
          });
        },
        collectible(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Collectible, {
            type: attrs['type'] ?? 'generic',
            value: coerceNum(attrs['value'], 1),
          });
        },
      };
    },
  };
}
