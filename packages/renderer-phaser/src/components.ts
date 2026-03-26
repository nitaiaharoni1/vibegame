import { defineComponent, Type } from '@vigame/core';

export const Transform2D = defineComponent('Transform2D', {
  x: Type.Number({ default: 0 }),
  y: Type.Number({ default: 0 }),
  rotation: Type.Number({ default: 0 }),  // radians
  scaleX: Type.Number({ default: 1 }),
  scaleY: Type.Number({ default: 1 }),
});

export const Sprite2D = defineComponent('Sprite2D', {
  texture: Type.String({ default: 'default' }),
  frame: Type.String({ default: '' }),
  tint: Type.Number({ default: 0xffffff }),
  alpha: Type.Number({ default: 1, min: 0, max: 1 }),
  visible: Type.Boolean({ default: true }),
  depth: Type.Number({ default: 0 }),
  flipX: Type.Boolean({ default: false }),
  flipY: Type.Boolean({ default: false }),
});

export const Camera2D = defineComponent('Camera2D', {
  zoom: Type.Number({ default: 1 }),
  active: Type.Boolean({ default: true }),
  followTarget: Type.String({ default: '' }), // entity name to follow
  lerpX: Type.Number({ default: 1 }),
  lerpY: Type.Number({ default: 1 }),
});

export const ArcadeBody2D = defineComponent('ArcadeBody2D', {
  isStatic: Type.Boolean({ default: false }),
  velocityX: Type.Number({ default: 0 }),
  velocityY: Type.Number({ default: 0 }),
  gravityY: Type.Number({ default: 300 }),
  bounceX: Type.Number({ default: 0 }),
  bounceY: Type.Number({ default: 0 }),
  collideWorldBounds: Type.Boolean({ default: false }),
});

export const TileMap2D = defineComponent('TileMap2D', {
  key: Type.String({ default: '' }),    // Phaser tilemap key
  tilesetName: Type.String({ default: '' }),
  layerName: Type.String({ default: '' }),
});

export const Text2D = defineComponent('Text2D', {
  text: Type.String({ default: '' }),
  fontSize: Type.Number({ default: 16 }),
  color: Type.String({ default: '#ffffff' }),
  depth: Type.Number({ default: 10 }),
});
