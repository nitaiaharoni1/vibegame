import { defineComponent, Type } from '@vigame/core';

export const NPCController = defineComponent('NPCController', {
  state: Type.String({ default: 'idle' }),        // current state name
  moveSpeed: Type.Number({ default: 3 }),
  turnSpeed: Type.Number({ default: 5 }),
  detectionRadius: Type.Number({ default: 10 }),
  attackRadius: Type.Number({ default: 2 }),
  targetEntityName: Type.String({ default: '' }), // entity name of current target
  wanderAngle: Type.Number({ default: 0 }),
});

export const Waypoints = defineComponent('Waypoints', {
  // Serialized as JSON string since we can't have arrays directly
  points: Type.String({ default: '[]' }), // JSON array of {x,y,z} points
  currentIndex: Type.Number({ default: 0 }),
  loop: Type.Boolean({ default: true }),
  arriveRadius: Type.Number({ default: 0.5 }),
});
