import { defineComponent, Type } from '@vigame/core';

export const RigidBody = defineComponent('RigidBody', {
  type: { kind: 'enum' as const, values: ['dynamic', 'static', 'kinematic-position', 'kinematic-velocity'], default: 'dynamic' },
  mass: Type.Number({ default: 1.0, min: 0 }),
  gravityScale: Type.Number({ default: 1.0 }),
  linearDamping: Type.Number({ default: 0.0, min: 0 }),
  angularDamping: Type.Number({ default: 0.0, min: 0 }),
  lockRotationX: Type.Boolean({ default: false }),
  lockRotationY: Type.Boolean({ default: false }),
  lockRotationZ: Type.Boolean({ default: false }),
});

export const Collider = defineComponent('Collider', {
  shape: { kind: 'enum' as const, values: ['box', 'sphere', 'capsule', 'cylinder', 'cone'], default: 'box' },
  sizeX: Type.Number({ default: 0.5 }),
  sizeY: Type.Number({ default: 0.5 }),
  sizeZ: Type.Number({ default: 0.5 }),
  friction: Type.Number({ default: 0.5, min: 0 }),
  restitution: Type.Number({ default: 0.0, min: 0, max: 1 }),
  isSensor: Type.Boolean({ default: false }),
  density: Type.Number({ default: 1.0, min: 0 }),
});
