import type { World } from '@vigame/core';
import { getThreeState } from './renderer-plugin.js';

/**
 * Capture the current WebGL frame as a base64 PNG data URL.
 * Returns null if the renderer is not initialised.
 */
export function captureScreenshot(world: World): string | null {
  const state = getThreeState(world);
  if (!state) return null;
  const { renderer, scene, camera } = state;
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}
