import { defineComponent, Type } from '@vigame/core';

export const AudioSource = defineComponent('AudioSource', {
  src: Type.String({ default: '' }),
  volume: Type.Number({ default: 1.0, min: 0, max: 2 }),
  loop: Type.Boolean({ default: false }),
  autoPlay: Type.Boolean({ default: false }),
  spatial: Type.Boolean({ default: false }),
  maxDistance: Type.Number({ default: 100 }),
  rolloffFactor: Type.Number({ default: 1 }),
});

export const AudioListener = defineComponent('AudioListener', {
  active: Type.Boolean({ default: true }),
});
