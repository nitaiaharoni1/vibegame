import type { SceneNode } from './scene-inspector.js';
import { inspectSceneGraph } from './scene-inspector.js';
import type { ScreenshotResult } from './screenshot.js';
import { captureScreenshot } from './screenshot.js';

export interface OverlayOptions {
  boundingBoxes?: boolean;
  properties?: string[];
  grid?: boolean;
}

function mat4El(a: Float32Array, i: number): number {
  const v = a[i];
  if (v === undefined) {
    throw new Error('expected 4x4 matrix');
  }
  return v;
}

function visitNodes(node: SceneNode, depth: number, visit: (node: SceneNode) => void): void {
  if (depth <= 0) return;
  visit(node);
  if (node.children) {
    for (const child of node.children) {
      visitNodes(child, depth - 1, visit);
    }
  }
}

function projectToScreen(
  px: number,
  py: number,
  pz: number,
  camera: Record<string, unknown>,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const projMatrix = camera.projectionMatrix as { elements?: number[] } | undefined;
  const viewMatrix = camera.matrixWorldInverse as { elements?: number[] } | undefined;
  if (!projMatrix?.elements || !viewMatrix?.elements) return null;

  const vm = Float32Array.from(viewMatrix.elements);
  const pm = Float32Array.from(projMatrix.elements);
  if (vm.length < 16 || pm.length < 16) return null;

  const vx = mat4El(vm, 0) * px + mat4El(vm, 4) * py + mat4El(vm, 8) * pz + mat4El(vm, 12);
  const vy = mat4El(vm, 1) * px + mat4El(vm, 5) * py + mat4El(vm, 9) * pz + mat4El(vm, 13);
  const vz = mat4El(vm, 2) * px + mat4El(vm, 6) * py + mat4El(vm, 10) * pz + mat4El(vm, 14);
  const vw = mat4El(vm, 3) * px + mat4El(vm, 7) * py + mat4El(vm, 11) * pz + mat4El(vm, 15);

  const cx = mat4El(pm, 0) * vx + mat4El(pm, 4) * vy + mat4El(pm, 8) * vz + mat4El(pm, 12) * vw;
  const cy = mat4El(pm, 1) * vx + mat4El(pm, 5) * vy + mat4El(pm, 9) * vz + mat4El(pm, 13) * vw;
  const cw = mat4El(pm, 3) * vx + mat4El(pm, 7) * vy + mat4El(pm, 11) * vz + mat4El(pm, 15) * vw;

  if (Math.abs(cw) < 0.0001) return null;

  const ndcX = cx / cw;
  const ndcY = cy / cw;

  if (ndcX < -1.1 || ndcX > 1.1 || ndcY < -1.1 || ndcY > 1.1) return null;

  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  };
}

export function captureDebugScreenshot(
  canvas: HTMLCanvasElement | null,
  options: OverlayOptions,
  registeredRoots: Map<string, unknown>,
  quality?: number,
): ScreenshotResult {
  const result = captureScreenshot(canvas, quality ?? 0.9);

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = result.width;
    offscreen.height = result.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return result;

    const gameCanvas = canvas ?? document.querySelector('canvas');
    if (gameCanvas) {
      ctx.drawImage(gameCanvas, 0, 0);
    } else {
      return result;
    }

    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};

    const isThree = win.__THREE_SCENE__ !== undefined || registeredRoots.has('scene');
    const isPhaser = win.__PHASER_GAME__ !== undefined || registeredRoots.has('game');

    const sceneGraph = inspectSceneGraph(4, registeredRoots);

    let camera: Record<string, unknown> | null = null;
    if (isThree) {
      const camRoot = registeredRoots.get('camera');
      if (camRoot && typeof camRoot === 'object') {
        camera = camRoot as Record<string, unknown>;
      } else if (win.__THREE_CAMERA__ && typeof win.__THREE_CAMERA__ === 'object') {
        camera = win.__THREE_CAMERA__ as Record<string, unknown>;
      } else {
        // Traverse the actual Three.js scene object to find a camera by type string
        const threeScene =
          (win.__THREE_SCENE__ as Record<string, unknown> | undefined) ??
          (registeredRoots.get('scene') as Record<string, unknown> | undefined);
        if (threeScene) {
          const findCameraInScene = (
            obj: Record<string, unknown>,
          ): Record<string, unknown> | null => {
            const type = obj.type;
            if (typeof type === 'string' && type.toLowerCase().includes('camera')) return obj;
            const children = obj.children;
            if (Array.isArray(children)) {
              for (const child of children) {
                if (child && typeof child === 'object') {
                  const found = findCameraInScene(child as Record<string, unknown>);
                  if (found) return found;
                }
              }
            }
            return null;
          };
          camera = findCameraInScene(threeScene);
        }
      }
    }

    const { width, height } = offscreen;

    if (options.grid === true) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px monospace';
      for (let x = 100; x < width; x += 100) ctx.fillText(String(x), x + 2, 10);
      for (let y = 100; y < height; y += 100) ctx.fillText(String(y), 2, y - 2);
    }

    if (options.boundingBoxes !== false && sceneGraph) {
      visitNodes(sceneGraph, 4, (node) => {
        if (!node.position) return;

        let screenPos: { x: number; y: number } | null = null;

        if (isThree && !isPhaser && camera) {
          screenPos = projectToScreen(
            node.position.x,
            node.position.y,
            node.position.z ?? 0,
            camera,
            width,
            height,
          );
        } else {
          screenPos = { x: node.position.x, y: node.position.y };
        }

        if (!screenPos) return;

        const { x, y } = screenPos;
        const label = node.name || node.type;

        ctx.font = '11px monospace';
        const textWidth = ctx.measureText(label).width;

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 20, y - 20, 40, 40);

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x - 20, y - 30, textWidth + 4, 16);

        ctx.fillStyle = '#00ff00';
        ctx.fillText(label, x - 18, y - 18);
      });
    }

    const raw = offscreen.toDataURL('image/webp', quality ?? 0.85);
    const composited = raw.startsWith('data:image/webp')
      ? raw
      : offscreen.toDataURL('image/jpeg', quality ?? 0.85);
    return { dataUrl: composited, width: offscreen.width, height: offscreen.height };
  } catch {
    return result;
  }
}
