import { DEFAULT_BRIDGE_PORT } from '@vigame/protocol';
import { type ActAndObserveArgs, actAndObserve } from './compound.js';
import { captureDebugScreenshot } from './debug-overlay.js';
import { createErrorInterceptor } from './error-interceptor.js';
import { type FuzzArgs, fuzzTest } from './fuzzer.js';
import { frameDiff } from './image-diff.js';
import { type InputEvent, simulateInputSequence } from './input-simulator.js';
import { inspectPath, mutatePath } from './mutator.js';
import { inspectSceneGraph } from './scene-inspector.js';
import {
  captureScreenshot,
  captureViewport,
  type ScreenshotOptions,
  type ScreenshotResult,
} from './screenshot.js';
import { type RunScriptArgs, runScript } from './script-runner.js';
import { delay, recordState } from './state-recorder.js';
import { type TrackArgs, trackObjects } from './tracker.js';
import { type WatchForArgs, watchFor } from './watcher.js';

export type { CapturedError } from './error-interceptor.js';
export type { InputEvent, InputResult } from './input-simulator.js';
export type { InspectResult, MutateResult } from './mutator.js';
export type { SceneNode } from './scene-inspector.js';
export type { ScreenshotResult } from './screenshot.js';
export type { RecordOptions, StateFrame } from './state-recorder.js';

export interface BridgeOptions {
  port?: number;
  canvas?: HTMLCanvasElement;
  autoRegisterThree?: boolean;
  autoRegisterPhaser?: boolean;
  debug?: boolean;
}

export interface Bridge {
  register(name: string, obj: unknown): void;
  disconnect(): void;
  isConnected(): boolean;
}

interface BridgeCommand {
  id: string;
  command: string;
  args?: Record<string, unknown>;
}

/** MCP → bridge frames always include `id` + `command`. Ignore handshakes like `{"type":"connected"}`. */
function isBridgeCommand(data: unknown): data is BridgeCommand {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Record<string, unknown>;
  if (o.id === undefined || o.id === null) return false;
  if (typeof o.command !== 'string' || o.command === '') return false;
  if (o.args !== undefined && (typeof o.args !== 'object' || o.args === null)) {
    return false;
  }
  return true;
}

interface BridgeResponse {
  id: string;
  result?: unknown;
  error?: string;
}

interface PerfMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

interface ExtendedPerformance extends Performance {
  memory?: PerfMemory;
}

/** Cap backoff so we never stop retrying (MCP may start after the game tab). */
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;

function createNoop(): Bridge {
  return {
    register: () => undefined,
    disconnect: () => undefined,
    isConnected: () => false,
  };
}

export function injectBridge(options: BridgeOptions = {}): Bridge {
  if (typeof WebSocket === 'undefined') {
    console.warn('[vigame/bridge] WebSocket not available — bridge is a no-op');
    return createNoop();
  }

  const {
    port = DEFAULT_BRIDGE_PORT,
    canvas = null,
    autoRegisterThree = true,
    autoRegisterPhaser = true,
    debug = false,
  } = options;

  const registeredRoots = new Map<string, unknown>();
  const errorInterceptor = createErrorInterceptor();
  let ws: WebSocket | null = null;
  let connected = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disconnectRequested = false;

  // FPS tracking
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;

  function countFrame(): void {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFpsTime;
    if (elapsed >= 1000) {
      currentFps = Math.round((frameCount * 1000) / elapsed);
      frameCount = 0;
      lastFpsTime = now;
    }
    requestAnimationFrame(countFrame);
  }

  // Start FPS counter if in browser context
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(countFrame);
  }

  function log(...args: unknown[]): void {
    if (debug) console.log('[vigame/bridge]', ...args);
  }

  function tryAutoRegister(): void {
    if (typeof window === 'undefined') return;
    const win = window as unknown as Record<string, unknown>;
    if (autoRegisterThree && win.__THREE_SCENE__ !== undefined) {
      registeredRoots.set('scene', win.__THREE_SCENE__);
      log('Auto-registered __THREE_SCENE__ as "scene"');
    }
    if (autoRegisterPhaser && win.__PHASER_GAME__ !== undefined) {
      registeredRoots.set('game', win.__PHASER_GAME__);
      log('Auto-registered __PHASER_GAME__ as "game"');
    }
  }

  async function handleCommand(cmd: BridgeCommand): Promise<BridgeResponse> {
    log('Received command:', cmd.command, cmd.args);
    const rid = String(cmd.id);
    try {
      const result = await executeCommand(cmd.command, cmd.args ?? {});
      return { id: rid, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { id: rid, error: message };
    }
  }

  async function executeCommand(command: string, args: Record<string, unknown>): Promise<unknown> {
    switch (command) {
      case 'screenshot': {
        const ssOpts: ScreenshotOptions = {};
        if (typeof args.quality === 'number') ssOpts.quality = args.quality;
        if (typeof args.maxWidth === 'number') ssOpts.maxWidth = args.maxWidth;
        if (typeof args.maxHeight === 'number') ssOpts.maxHeight = args.maxHeight;
        if (args.mode === 'viewport') {
          return captureViewport(canvas, ssOpts);
        }
        return captureScreenshot(canvas, ssOpts);
      }

      case 'scene_graph': {
        tryAutoRegister();
        const depth = typeof args.depth === 'number' ? args.depth : 5;
        const graph = inspectSceneGraph(depth, registeredRoots);
        if (graph === null) {
          throw new Error(
            'No scene graph found. Set window.__THREE_SCENE__ or window.__PHASER_GAME__',
          );
        }
        return graph;
      }

      case 'inspect': {
        const path = String(args.path ?? '');
        if (path === '') throw new Error('Missing required arg: path');
        tryAutoRegister();
        return inspectPath(path, registeredRoots);
      }

      case 'mutate': {
        const path = String(args.path ?? '');
        if (path === '') throw new Error('Missing required arg: path');
        tryAutoRegister();
        return mutatePath(path, args.value, registeredRoots);
      }

      case 'eval': {
        const code = String(args.code ?? '');
        if (code === '') throw new Error('Missing required arg: code');
        tryAutoRegister();
        try {
          // Inject registered roots as named variables (same as watchFor)
          const rootNames = [...registeredRoots.keys()];
          const rootValues = rootNames.map((n) => registeredRoots.get(n));
          // Try expression mode first (auto-return), fall back to statement mode
          let fn: (...fnArgs: unknown[]) => unknown;
          try {
            // eslint-disable-next-line no-new-func
            fn = new Function(...rootNames, `return (${code})`) as typeof fn;
          } catch {
            // eslint-disable-next-line no-new-func
            fn = new Function(...rootNames, code) as typeof fn;
          }
          const result: unknown = fn(...rootValues);
          return { result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: message };
        }
      }

      case 'input': {
        const sequence = args.sequence;
        if (!Array.isArray(sequence)) throw new Error('Missing required arg: sequence (array)');
        return simulateInputSequence(sequence as InputEvent[]);
      }

      case 'perf': {
        const perf: {
          fps: number;
          memory?: PerfMemory;
          drawCalls?: number;
        } = {
          fps:
            typeof window !== 'undefined'
              ? (((window as unknown as Record<string, unknown>).__VIGAME_FPS__ as
                  | number
                  | undefined) ?? currentFps)
              : currentFps,
        };

        const extPerf = performance as ExtendedPerformance;
        if (extPerf.memory !== undefined) {
          perf.memory = {
            usedJSHeapSize: extPerf.memory.usedJSHeapSize,
            totalJSHeapSize: extPerf.memory.totalJSHeapSize,
          };
        }

        return perf;
      }

      case 'watch': {
        const seconds = typeof args.seconds === 'number' ? args.seconds : 5;
        const intervalMs = typeof args.intervalMs === 'number' ? args.intervalMs : 1000;
        const diffThreshold = typeof args.diffThreshold === 'number' ? args.diffThreshold : 0.05;
        const useViewport = args.mode === 'viewport';
        const ssOpts: ScreenshotOptions = {};
        if (typeof args.quality === 'number') ssOpts.quality = args.quality;
        if (typeof args.maxWidth === 'number') ssOpts.maxWidth = args.maxWidth;
        if (typeof args.maxHeight === 'number') ssOpts.maxHeight = args.maxHeight;

        const frames: Array<{
          timestamp: number;
          elapsed: number;
          dataUrl: string;
          width: number;
          height: number;
        }> = [];
        const start = Date.now();
        const end = start + seconds * 1000;
        let prevDataUrl: string | null = null;

        while (Date.now() < end) {
          const elapsed = Date.now() - start;
          let result: ScreenshotResult;
          try {
            result = useViewport
              ? await captureViewport(canvas, ssOpts)
              : captureScreenshot(canvas, ssOpts);
          } catch {
            // canvas not available — wait and retry
            const remaining = end - Date.now();
            if (remaining <= 0) break;
            await delay(Math.min(intervalMs, remaining));
            continue;
          }

          const diff = prevDataUrl !== null ? await frameDiff(prevDataUrl, result.dataUrl) : 1;
          if (diff >= diffThreshold) {
            frames.push({
              timestamp: Date.now(),
              elapsed,
              dataUrl: result.dataUrl,
              width: result.width,
              height: result.height,
            });
            prevDataUrl = result.dataUrl;
          }

          const remaining = end - Date.now();
          if (remaining <= 0) break;
          await delay(Math.min(intervalMs, remaining));
        }

        return { frames };
      }

      case 'record': {
        const seconds = typeof args.seconds === 'number' ? args.seconds : 1;
        const screenshotInterval =
          typeof args.screenshotInterval === 'number' ? args.screenshotInterval : 500;
        const diffThreshold = typeof args.diffThreshold === 'number' ? args.diffThreshold : 0;
        return recordState({ seconds, screenshotInterval, diffThreshold }, canvas, registeredRoots);
      }

      case 'get_errors': {
        return { errors: errorInterceptor.peek() };
      }

      case 'act_and_observe': {
        tryAutoRegister();
        return actAndObserve(args as ActAndObserveArgs, canvas, registeredRoots, errorInterceptor);
      }

      case 'debug_screenshot': {
        tryAutoRegister();
        const overlayOptions = {
          ...(typeof args.boundingBoxes === 'boolean' ? { boundingBoxes: args.boundingBoxes } : {}),
          ...(Array.isArray(args.properties) ? { properties: args.properties as string[] } : {}),
          ...(typeof args.grid === 'boolean' ? { grid: args.grid } : {}),
        };
        return captureDebugScreenshot(
          canvas,
          overlayOptions,
          registeredRoots,
          typeof args.quality === 'number' ? args.quality : undefined,
          args.mode === 'viewport' ? 'viewport' : undefined,
        );
      }

      case 'track': {
        tryAutoRegister();
        return trackObjects(args as unknown as TrackArgs, registeredRoots);
      }

      case 'watch_for': {
        tryAutoRegister();
        return watchFor(args as unknown as WatchForArgs, canvas, registeredRoots);
      }

      case 'fuzz': {
        tryAutoRegister();
        return fuzzTest(args as unknown as FuzzArgs, canvas, registeredRoots, errorInterceptor);
      }

      case 'run_script': {
        tryAutoRegister();
        return runScript(
          args as unknown as RunScriptArgs,
          canvas,
          registeredRoots,
          errorInterceptor,
        );
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  function send(data: BridgeResponse): void {
    if (ws !== null && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function connect(): void {
    if (disconnectRequested) return;

    const url = `ws://localhost:${port}`;
    log(`Connecting to ${url} (attempt ${retryCount + 1})`);

    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      connected = true;
      retryCount = 0;
      log('Connected');
      tryAutoRegister();
    });

    ws.addEventListener('close', () => {
      connected = false;
      ws = null;
      if (!disconnectRequested) {
        scheduleReconnect();
      }
    });

    ws.addEventListener('error', (evt) => {
      log('WebSocket error:', evt);
    });

    ws.addEventListener('message', (evt: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(evt.data));
      } catch {
        log('Failed to parse message:', evt.data);
        return;
      }
      if (!isBridgeCommand(parsed)) {
        log('Ignoring non-command WebSocket frame:', parsed);
        return;
      }
      const cmd = parsed;

      void handleCommand(cmd).then(send, (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        send({ id: String(cmd.id), error: message });
      });
    });
  }

  function scheduleReconnect(): void {
    if (disconnectRequested) return;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.min(retryCount, 16), MAX_BACKOFF_MS);
    retryCount++;
    log(`Reconnecting in ${backoff}ms...`);
    retryTimer = setTimeout(() => {
      connect();
    }, backoff);
  }

  connect();

  const bridge: Bridge = {
    register(name: string, obj: unknown): void {
      registeredRoots.set(name, obj);
      log(`Registered root: "${name}"`);
    },
    disconnect(): void {
      disconnectRequested = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (ws !== null) {
        ws.close();
        ws = null;
      }
      errorInterceptor.destroy();
      connected = false;
      log('Disconnected');
    },
    isConnected(): boolean {
      return connected;
    },
  };

  return bridge;
}
