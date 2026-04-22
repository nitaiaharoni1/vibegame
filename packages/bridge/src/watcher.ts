import type { WatchForArgs, WatchForResult } from '@vigame/protocol';
import { inspectPath } from './mutator.js';
import { inspectSceneGraph } from './scene-inspector.js';
import { captureScreenshot } from './screenshot.js';

export type { WatchForArgs, WatchForResult } from '@vigame/protocol';

export async function watchFor(
  args: WatchForArgs,
  canvas: HTMLCanvasElement | null,
  registeredRoots: Map<string, unknown>,
): Promise<WatchForResult> {
  const rootEntries = Array.from(registeredRoots.entries());
  const rootNames = rootEntries.map(([k]) => k);
  const rootObj: Record<string, unknown> = {};
  for (const [k, v] of rootEntries) rootObj[k] = v;
  const preamble =
    rootNames.length > 0 ? `var {${rootNames.join(',')}} = __roots__;\n` : '';

  // eslint-disable-next-line no-new-func
  const condFn = new Function('__roots__', `${preamble}return (${args.condition})`);

  const start = Date.now();
  let triggered = false;

  while (true) {
    await new Promise<void>((r) => setTimeout(r, 16));

    const elapsed = Date.now() - start;

    let condResult = false;
    try {
      condResult = Boolean(condFn(rootObj));
    } catch {
      // treat condition errors as false
    }

    if (condResult) {
      triggered = true;
      break;
    }

    if (elapsed >= args.timeout_ms) {
      triggered = false;
      break;
    }
  }

  const elapsed_ms = Date.now() - start;
  const result: WatchForResult = { triggered, elapsed_ms };

  if (args.capture?.screenshot === true) {
    try {
      result.screenshot = captureScreenshot(canvas, 0.9);
    } catch {
      // screenshot unavailable — skip
    }
  }

  if (args.capture?.inspect !== undefined && args.capture.inspect.length > 0) {
    const inspections: Record<string, { value: unknown; type: string }> = {};
    for (const path of args.capture.inspect) {
      inspections[path] = inspectPath(path, registeredRoots);
    }
    result.inspections = inspections;
  }

  if (args.capture?.scene_graph !== undefined) {
    const depth = args.capture.scene_graph.depth ?? 5;
    result.scene_graph = inspectSceneGraph(depth, registeredRoots);
  }

  return result;
}
