import { defineComponent, Type } from '@vigame/core';

export const NetworkEntity = defineComponent('NetworkEntity', {
  netId: Type.String({ default: '' }),        // server-assigned network ID
  ownerId: Type.String({ default: '' }),      // client ID of owner
  isLocal: Type.Boolean({ default: false }),  // true if owned by this client
  syncRate: Type.Number({ default: 20 }),     // syncs/second
  interpolate: Type.Boolean({ default: true }),
});

export const NetworkTransform = defineComponent('NetworkTransform', {
  // Snapshot for interpolation
  prevX: Type.Number({ default: 0 }),
  prevY: Type.Number({ default: 0 }),
  prevZ: Type.Number({ default: 0 }),
  targetX: Type.Number({ default: 0 }),
  targetY: Type.Number({ default: 0 }),
  targetZ: Type.Number({ default: 0 }),
  lerpT: Type.Number({ default: 0 }),
  lerpSpeed: Type.Number({ default: 10 }),
});
