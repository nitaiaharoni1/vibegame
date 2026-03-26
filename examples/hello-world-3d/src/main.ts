import { createWorld, startWorld } from '@vigame/core';
import { ThreeRendererPlugin } from '@vigame/renderer-three';
import { parseVGX, hydrateScene } from '@vigame/scene';
import sceneSource from './scene.vgx?raw';

// Parse the VGX scene
const vgxWorld = parseVGX(sceneSource);

// Create the ECS world with three.js renderer
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const world = createWorld({
  plugins: [
    ThreeRendererPlugin({
      canvas,
      antialias: true,
      shadows: true,
      clearColor: vgxWorld.config.clearColor,
    }),
  ],
});

// Hydrate the scene — apply VGX entities to the ECS world
hydrateScene(vgxWorld, world);

// Start the game loop
startWorld(world);
