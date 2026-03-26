import { createWorld, startWorld } from '@vigame/core';
import { ThreeRendererPlugin } from '@vigame/renderer-three';
import { parseVGX, hydrateScene } from '@vigame/scene';
import { InputPlugin, isKeyDown } from '@vigame/input';
import { GameplayPlugin } from '@vigame/gameplay';
import { VigameBridgePlugin } from '@vigame/mcp';
import sceneSource from './scene.vgx?raw';

// Parse the VGX scene
const vgxWorld = parseVGX(sceneSource);

// Create the ECS world with three.js renderer and input
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const world = createWorld({
  plugins: [
    ThreeRendererPlugin({
      canvas,
      antialias: true,
      shadows: true,
      clearColor: vgxWorld.config.clearColor,
    }),
    InputPlugin(canvas),
    GameplayPlugin(),
    ...(import.meta.env.DEV ? [VigameBridgePlugin()] : []),
  ],
});

// Hydrate the scene — apply VGX entities to the ECS world
hydrateScene(vgxWorld, world);

// Log input state for demonstration (press WASD or arrow keys)
console.log('[vigame] Input plugin active. Press W/A/S/D to see key state.');
setInterval(() => {
  if (isKeyDown(world, 'KeyW')) console.log('[input] W is held');
  if (isKeyDown(world, 'KeyA')) console.log('[input] A is held');
  if (isKeyDown(world, 'KeyS')) console.log('[input] S is held');
  if (isKeyDown(world, 'KeyD')) console.log('[input] D is held');
}, 200);

// Start the game loop
startWorld(world);
