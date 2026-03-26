import { defineComponent, Type } from '@vigame/core';

export const UIElement = defineComponent('UIElement', {
  id: Type.String({ default: '' }),
  visible: Type.Boolean({ default: true }),
  zIndex: Type.Number({ default: 100 }),
});

export const HealthBar = defineComponent('HealthBar', {
  entityName: Type.String({ default: '' }), // entity whose Health component to track
  x: Type.Number({ default: 10 }),
  y: Type.Number({ default: 10 }),
  width: Type.Number({ default: 200 }),
  height: Type.Number({ default: 20 }),
  color: Type.String({ default: '#e74c3c' }),
  backgroundColor: Type.String({ default: '#333' }),
});

export const ScoreDisplay = defineComponent('ScoreDisplay', {
  entityName: Type.String({ default: '' }), // entity whose Score component to track
  x: Type.Number({ default: 10 }),
  y: Type.Number({ default: 40 }),
  fontSize: Type.Number({ default: 24 }),
  color: Type.String({ default: '#ffffff' }),
  prefix: Type.String({ default: 'Score: ' }),
});
