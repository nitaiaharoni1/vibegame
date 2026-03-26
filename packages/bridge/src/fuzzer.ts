import type { FuzzArgsWire, FuzzIssueWire, FuzzResultWire } from '@vigame/protocol';
import type { ErrorInterceptor } from './error-interceptor.js';
import { inspectPath } from './mutator.js';

export type FuzzArgs = FuzzArgsWire;
export type FuzzIssue = FuzzIssueWire;
export type FuzzResult = FuzzResultWire;

const DEFAULT_KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'w',
  'a',
  's',
  'd',
  'Enter',
];

const OUT_OF_BOUNDS_THRESHOLD = 100000;

function isXyzLike(value: unknown): value is { x: unknown; y: unknown; z: unknown } {
  return (
    typeof value === 'object' && value !== null && 'x' in value && 'y' in value && 'z' in value
  );
}

export async function fuzzTest(
  args: FuzzArgs,
  canvas: HTMLCanvasElement | null,
  registeredRoots: Map<string, unknown>,
  errorInterceptor: ErrorInterceptor,
): Promise<FuzzResult> {
  const keys = args.keys ?? DEFAULT_KEYS;
  const includeMouse = args.include_mouse !== false;
  const intervalMs = Math.round(1000 / (args.input_rate ?? 10));

  const issues: FuzzIssue[] = [];
  let inputsDispatched = 0;
  let firstIssueScreenshot: string | undefined;

  // FPS tracking: sample actual game FPS each second via window.__VIGAME_FPS__
  const start = Date.now();
  let lastFpsCheck = start;
  const fpsReadings: number[] = [];

  function captureFirstIssueScreenshot(): void {
    if (firstIssueScreenshot !== undefined) return;
    const dataUrl = canvas?.toDataURL('image/png');
    if (dataUrl !== undefined) {
      // Store full data URL so the MCP layer can read mimeType and strip the prefix
      firstIssueScreenshot = dataUrl;
    }
  }

  function recordIssue(issue: FuzzIssueWire): void {
    issues.push(issue);
    captureFirstIssueScreenshot();
  }

  while (true) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const now = Date.now();
    const elapsed = now - start;

    // FPS sampling: read actual game FPS once per second via window.__VIGAME_FPS__
    if (now - lastFpsCheck >= 1000) {
      const win =
        typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
      const fps = typeof win.__VIGAME_FPS__ === 'number' ? win.__VIGAME_FPS__ : null;
      if (fps !== null) fpsReadings.push(fps);
      lastFpsCheck = now;
    }

    // Generate random input
    const useKeyboard = !includeMouse || Math.random() < 0.7;

    if (useKeyboard) {
      const key = keys[Math.floor(Math.random() * keys.length)] ?? 'ArrowUp';
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    } else {
      document.dispatchEvent(
        new MouseEvent('click', {
          clientX: Math.random() * 800,
          clientY: Math.random() * 600,
          bubbles: true,
        }),
      );
    }
    inputsDispatched++;

    // Check intercepted errors
    const errors = errorInterceptor.getAndClear();
    for (const e of errors) {
      recordIssue({ type: 'error', timestamp: e.timestamp, details: e.message });
    }

    // Check watch_paths for NaN / out-of-bounds
    if (args.watch_paths !== undefined) {
      for (const path of args.watch_paths) {
        const { value } = inspectPath(path, registeredRoots);

        if (typeof value === 'number') {
          if (Number.isNaN(value)) {
            recordIssue({ type: 'nan', timestamp: now, details: path });
          } else if (Math.abs(value) > OUT_OF_BOUNDS_THRESHOLD) {
            recordIssue({
              type: 'out_of_bounds',
              timestamp: now,
              details: `${path} = ${value}`,
            });
          }
        } else if (isXyzLike(value)) {
          const { x, y, z } = value;
          for (const [axis, component] of [
            ['x', x],
            ['y', y],
            ['z', z],
          ] as const) {
            if (typeof component === 'number') {
              if (Number.isNaN(component)) {
                recordIssue({ type: 'nan', timestamp: now, details: `${path}.${axis}` });
              } else if (Math.abs(component) > OUT_OF_BOUNDS_THRESHOLD) {
                recordIssue({
                  type: 'out_of_bounds',
                  timestamp: now,
                  details: `${path}.${axis} = ${component}`,
                });
              }
            }
          }
        }
      }
    }

    if (elapsed >= args.duration_ms) break;
  }

  const fps_min = fpsReadings.length > 0 ? Math.min(...fpsReadings) : 0;
  const fps_avg =
    fpsReadings.length > 0 ? fpsReadings.reduce((sum, v) => sum + v, 0) / fpsReadings.length : 0;

  const result: FuzzResult = {
    duration_ms: Date.now() - start,
    inputs_dispatched: inputsDispatched,
    issues,
    fps_min,
    fps_avg,
  };

  if (firstIssueScreenshot !== undefined) {
    result.first_issue_screenshot = firstIssueScreenshot;
  }

  return result;
}
