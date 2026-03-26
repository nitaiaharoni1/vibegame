import { frameDiff } from './image-diff.js';
import { inspectSceneGraph, type SceneNode } from './scene-inspector.js';
import { captureScreenshot } from './screenshot.js';

export interface StateFrame {
  timestamp: number;
  /** Base64 data URL, or null if canvas was not available at capture time. */
  screenshot: string | null;
  sceneGraph: SceneNode | null;
}

export interface RecordOptions {
  seconds: number;
  screenshotInterval?: number;
  diffThreshold?: number;
}

export async function recordState(
  options: RecordOptions,
  canvas: HTMLCanvasElement | null,
  registeredRoots: Map<string, unknown>,
): Promise<StateFrame[]> {
  const { seconds, screenshotInterval = 500, diffThreshold = 0 } = options;
  const frames: StateFrame[] = [];
  const endTime = Date.now() + seconds * 1000;
  let prevDataUrl: string | null = null;

  while (Date.now() < endTime) {
    const timestamp = Date.now();
    let screenshot: string | null = null;
    try {
      const result = captureScreenshot(canvas);
      screenshot = result.dataUrl;
    } catch {
      // Canvas not available — caller can check screenshot === null
    }

    // Apply diff threshold: null out screenshot if too similar to previous
    if (screenshot !== null && prevDataUrl !== null && diffThreshold > 0) {
      const diff = await frameDiff(prevDataUrl, screenshot);
      if (diff < diffThreshold) {
        screenshot = null;
      }
    }

    // Update prevDataUrl only when screenshot is included
    if (screenshot !== null) {
      prevDataUrl = screenshot;
    }

    const sceneGraph = inspectSceneGraph(5, registeredRoots);
    frames.push({ timestamp, screenshot, sceneGraph });

    const remaining = endTime - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(screenshotInterval, remaining));
  }

  return frames;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
