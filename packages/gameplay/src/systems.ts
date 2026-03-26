import { defineSystem, query, getComponent, setComponent } from '@vigame/core';
import { Health } from './components.js';
import type { World } from '@vigame/core';

// Health regeneration system
export const HealthRegenSystem = defineSystem({
  name: 'HealthRegen',
  phase: 1, // Update
  execute(world: World, delta: number) {
    const entities = query(world, [Health]);
    for (const eid of entities) {
      const h = getComponent(world, eid, Health);
      if (!h) continue;
      if (h.regenRate <= 0) continue;
      if (h.current >= h.max) continue;
      const newCurrent = Math.min(h.max, h.current + h.regenRate * delta);
      setComponent(world, eid, Health, { current: newCurrent });
    }
  },
});
