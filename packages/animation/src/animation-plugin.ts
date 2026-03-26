import type { VibePlugin, World } from '@vigame/core';
import { TweenSystem } from './tween.js';
import { AnimationClipSystem } from './clip.js';

export function AnimationPlugin(): VibePlugin {
  return {
    name: 'AnimationPlugin',
    setup(_world: World) {},
    systems(_world: World) {
      return [TweenSystem, AnimationClipSystem];
    },
  };
}
