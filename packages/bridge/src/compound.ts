import type { ActAndObserveArgs } from '@vigame/protocol';
import type { CapturedError, ErrorInterceptor } from './error-interceptor.js';
import type { InputEvent } from './input-simulator.js';
import { simulateInputSequence } from './input-simulator.js';
import type { InspectResult } from './mutator.js';
import { inspectPath, mutatePath } from './mutator.js';
import type { SceneNode } from './scene-inspector.js';
import { inspectSceneGraph } from './scene-inspector.js';
import type { ScreenshotResult } from './screenshot.js';
import { captureScreenshot, captureViewport } from './screenshot.js';

export type { ActAndObserveArgs };

export interface MutationResult {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ActAndObserveResult {
  mutations?: MutationResult[];
  eval?: { result: unknown; error?: string };
  inputs?: { executed: number };
  screenshot?: ScreenshotResult;
  inspections?: Record<string, InspectResult>;
  scene_graph?: SceneNode | null;
  errors: CapturedError[];
  elapsed_ms: number;
}

export async function actAndObserve(
  args: ActAndObserveArgs,
  canvas: HTMLCanvasElement | null,
  registeredRoots: Map<string, unknown>,
  errorInterceptor: ErrorInterceptor,
): Promise<ActAndObserveResult> {
  const start = Date.now();
  errorInterceptor.getAndClear();

  const result: ActAndObserveResult = { errors: [], elapsed_ms: 0 };

  // Step 1: Execute mutations
  if (args.mutations && args.mutations.length > 0) {
    const mutationResults: MutationResult[] = [];
    for (const { path, value } of args.mutations) {
      try {
        const r = mutatePath(path, value, registeredRoots);
        mutationResults.push({ path, oldValue: r.oldValue, newValue: value });
      } catch (_err) {
        mutationResults.push({ path, oldValue: undefined, newValue: value });
      }
    }
    result.mutations = mutationResults;
  }

  // Step 2: Execute eval
  if (args.eval !== undefined) {
    const code = args.eval;
    try {
      let fn: () => unknown;
      try {
        fn = new Function(`return (${code})`) as () => unknown;
      } catch {
        fn = new Function(code) as () => unknown;
      }
      result.eval = { result: fn() };
    } catch (err) {
      result.eval = {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Step 3: Execute inputs
  if (args.inputs && args.inputs.length > 0) {
    const inputResult = await simulateInputSequence(args.inputs as InputEvent[]);
    result.inputs = { executed: inputResult.executed };
  }

  // Step 4: Wait
  if (args.wait_ms && args.wait_ms > 0) {
    await new Promise<void>((r) => setTimeout(r, args.wait_ms));
  }

  // Step 5: Capture screenshot
  if (args.screenshot) {
    const ssObj = typeof args.screenshot === 'object' ? args.screenshot : {};
    const quality = ssObj.quality ?? 0.9;
    if (ssObj.mode === 'viewport') {
      result.screenshot = await captureViewport(canvas, { quality });
    } else {
      result.screenshot = captureScreenshot(canvas, quality);
    }
  }

  // Step 6: Gather inspections
  if (args.inspect && args.inspect.length > 0) {
    const inspections: Record<string, InspectResult> = {};
    for (const path of args.inspect) {
      inspections[path] = inspectPath(path, registeredRoots);
    }
    result.inspections = inspections;
  }

  // Step 7: Gather scene graph
  if (args.scene_graph) {
    result.scene_graph = inspectSceneGraph(args.scene_graph.depth ?? 5, registeredRoots);
  }

  // Step 8: Collect errors
  result.errors = errorInterceptor.getAndClear();

  // Step 9: Set elapsed time
  result.elapsed_ms = Date.now() - start;

  return result;
}
