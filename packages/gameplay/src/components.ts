import { defineComponent, Type } from '@vigame/core';

export const Health = defineComponent('Health', {
  current: Type.Number({ default: 100, min: 0 }),
  max: Type.Number({ default: 100, min: 1 }),
  regenRate: Type.Number({ default: 0 }),      // HP/second, 0 = no regen
  invincible: Type.Boolean({ default: false }),
});

export const Inventory = defineComponent('Inventory', {
  capacity: Type.Number({ default: 10, min: 1 }),
  gold: Type.Number({ default: 0, min: 0 }),
});

export const Score = defineComponent('Score', {
  value: Type.Number({ default: 0, min: 0 }),
  multiplier: Type.Number({ default: 1 }),
});

export const Collectible = defineComponent('Collectible', {
  type: Type.String({ default: 'generic' }),
  value: Type.Number({ default: 1 }),
  collected: Type.Boolean({ default: false }),
});
