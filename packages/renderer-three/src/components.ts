import { defineComponent, Type } from '@vigame/core';

export const Transform3D = defineComponent('Transform3D', {
  px: Type.Number({ default: 0 }),
  py: Type.Number({ default: 0 }),
  pz: Type.Number({ default: 0 }),
  rx: Type.Number({ default: 0 }),
  ry: Type.Number({ default: 0 }),
  rz: Type.Number({ default: 0 }),
  sx: Type.Number({ default: 1 }),
  sy: Type.Number({ default: 1 }),
  sz: Type.Number({ default: 1 }),
});

export const Mesh3D = defineComponent('Mesh3D', {
  shape: Type.Enum(['box', 'sphere', 'capsule', 'cylinder', 'plane', 'cone']),
  color: Type.String({ default: '#ffffff' }),
  size: Type.String({ default: '1' }),
  wireframe: Type.Boolean({ default: false }),
  castShadow: Type.Boolean({ default: true }),
  receiveShadow: Type.Boolean({ default: true }),
});

export const Camera3D = defineComponent('Camera3D', {
  fov: Type.Number({ default: 75 }),
  near: Type.Number({ default: 0.1 }),
  far: Type.Number({ default: 1000 }),
  active: Type.Boolean({ default: true }),
});

export const CameraFollow = defineComponent('CameraFollow', {
  targetName: Type.String({ default: '' }),
  distance: Type.Number({ default: 8 }),
  height: Type.Number({ default: 5 }),
});

export const AmbientLight = defineComponent('AmbientLight', {
  color: Type.String({ default: '#ffffff' }),
  intensity: Type.Number({ default: 0.5 }),
});

export const DirectionalLight = defineComponent('DirectionalLight', {
  color: Type.String({ default: '#ffffff' }),
  intensity: Type.Number({ default: 1.0 }),
  castShadow: Type.Boolean({ default: true }),
});
