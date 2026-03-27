import {
  type BridgeInputEventWire,
  type FuzzArgsWire,
  type FuzzResultWire,
  omitUndefined,
  type RunScriptArgs,
  type RunScriptResult,
} from '@vigame/protocol';
import type { BridgeServer } from '../bridge-server.js';
import { INPUT_EVENT_ITEM_SCHEMA } from './schema/input-event.js';
import { screenshot } from './visual.js';

/** Wire shape for `input` / `simulate_input` (matches bridge input events). */
export type InputEvent = BridgeInputEventWire;

export interface AssertionResult {
  assertion: string;
  passed: boolean;
  actual?: unknown;
  error?: string;
}

/**
 * Simulate a sequence of user input events in the running game.
 * Returns the number of events successfully dispatched.
 */
export async function simulate_input(
  bridge: BridgeServer,
  args: { sequence: InputEvent[] },
): Promise<{ executed: number }> {
  const result = (await bridge.send('input', { sequence: args.sequence })) as {
    executed: number;
  };
  return result;
}

export interface RecordFrame {
  timestamp: number;
  elapsed: number;
  screenshot?: string;
  sceneGraph?: unknown;
}

/**
 * Record game activity for a number of seconds.
 * Returns an array of frames containing timestamps, optional screenshots, and scene graph snapshots.
 */
export async function record(
  bridge: BridgeServer,
  args: { seconds: number; screenshotInterval?: number; diffThreshold?: number },
): Promise<{ frames: RecordFrame[] }> {
  const result = (await bridge.send('record', {
    seconds: args.seconds,
    screenshotInterval: args.screenshotInterval ?? null,
    ...(args.diffThreshold !== undefined ? { diffThreshold: args.diffThreshold } : {}),
  })) as { frames: RecordFrame[] };
  return result;
}

/**
 * Run an automated playtest: execute input events, take a screenshot, and evaluate
 * optional JavaScript assertions. Returns pass/fail status with evidence.
 */
export async function run_playtest(
  bridge: BridgeServer,
  args: {
    name?: string;
    spec: {
      inputs: InputEvent[];
      assertions?: string[];
    };
  },
): Promise<{
  name: string;
  passed: boolean;
  screenshots: Array<{ data: string; mimeType: string }>;
  results: AssertionResult[];
}> {
  const name = args.name ?? 'Unnamed Playtest';

  // Execute the input sequence
  await simulate_input(bridge, { sequence: args.spec.inputs });

  // Take a post-playtest screenshot
  const img = await screenshot(bridge, { quality: 0.85 });
  const screenshots = [{ data: img.data, mimeType: img.mimeType }];

  // Evaluate assertions
  const results: AssertionResult[] = [];
  for (const assertion of args.spec.assertions ?? []) {
    try {
      const evalResult = (await bridge.send('eval', { code: assertion })) as {
        result: unknown;
        error?: string;
      };
      if (evalResult.error) {
        results.push({ assertion, passed: false, error: evalResult.error });
      } else {
        const passed = Boolean(evalResult.result);
        results.push({ assertion, passed, actual: evalResult.result });
      }
    } catch (err) {
      results.push({
        assertion,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.every((r) => r.passed);
  return { name, passed, screenshots, results };
}

/**
 * Run a multi-step playtest script entirely on the bridge side.
 * The AI sends one call; the bridge runs inputs, waits, screenshots,
 * assertions, and evals — then returns the full report.
 */
export async function run_script(
  bridge: BridgeServer,
  args: RunScriptArgs,
): Promise<RunScriptResult> {
  // Estimate a generous timeout: sum of all wait/timeout steps + 30s buffer
  let estimatedMs = 30_000;
  for (const step of args.steps) {
    if (step.action === 'wait') estimatedMs += step.ms;
    if (step.action === 'wait_for') estimatedMs += step.timeout_ms;
    if (step.action === 'input') {
      for (const evt of step.sequence) {
        if (evt.duration) estimatedMs += evt.duration;
      }
    }
  }
  return (await bridge.send(
    'run_script',
    args as unknown as Record<string, unknown>,
    estimatedMs,
  )) as RunScriptResult;
}

export type FuzzResult = FuzzResultWire;

/**
 * Run random inputs for a duration and report crashes, NaN values, out-of-bounds objects, FPS drops.
 */
export async function fuzz_test(bridge: BridgeServer, args: FuzzArgsWire): Promise<FuzzResult> {
  const timeoutMs = args.duration_ms + 10000;
  return (await bridge.send(
    'fuzz',
    omitUndefined({
      duration_ms: args.duration_ms,
      input_rate: args.input_rate,
      keys: args.keys,
      include_mouse: args.include_mouse,
      watch_paths: args.watch_paths,
    }) as Record<string, unknown>,
    timeoutMs,
  )) as FuzzResult;
}

/** Tool definitions for registration */
export const testingToolDefs = [
  {
    name: 'simulate_input',
    description:
      'Simulate a sequence of user input events (keyboard, mouse) in the running game. Useful for automated testing or scripted gameplay.',
    inputSchema: {
      type: 'object' as const,
      required: ['sequence'],
      properties: {
        sequence: {
          type: 'array',
          description: 'Array of input events to dispatch in order',
          items: INPUT_EVENT_ITEM_SCHEMA,
        },
      },
    },
  },
  {
    name: 'record',
    description:
      'Record game activity for a set number of seconds, capturing scene graph snapshots and optional periodic screenshots.',
    inputSchema: {
      type: 'object' as const,
      required: ['seconds'],
      properties: {
        seconds: { type: 'number', description: 'Duration to record in seconds', minimum: 1 },
        screenshotInterval: {
          type: 'number',
          description: 'Capture a screenshot every N milliseconds (omit to skip screenshots)',
          minimum: 100,
        },
        diffThreshold: {
          type: 'number',
          description:
            'Skip screenshots where less than this fraction of pixels changed vs the previous frame (0–1, default 0 = include all). Reduces context usage.',
          minimum: 0,
          maximum: 1,
        },
      },
    },
  },
  {
    name: 'run_playtest',
    description:
      'Run a full automated playtest: dispatch input events, take a screenshot, and evaluate JavaScript assertions. Returns pass/fail with evidence.',
    inputSchema: {
      type: 'object' as const,
      required: ['spec'],
      properties: {
        name: { type: 'string', description: 'Human-readable name for this playtest run' },
        spec: {
          type: 'object',
          required: ['inputs'],
          properties: {
            inputs: {
              type: 'array',
              description: 'Input events to execute',
              items: INPUT_EVENT_ITEM_SCHEMA,
            },
            assertions: {
              type: 'array',
              description:
                'JavaScript expressions that should evaluate to truthy for the test to pass',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'fuzz_test',
    description:
      'Run random inputs for a duration and automatically report any crashes, runtime errors, NaN values, out-of-bounds objects, or FPS drops. Finds robustness issues the AI would never discover through manual testing.',
    inputSchema: {
      type: 'object' as const,
      required: ['duration_ms'],
      properties: {
        duration_ms: {
          type: 'number',
          description: 'How long to fuzz in milliseconds (1000-60000)',
          minimum: 1000,
          maximum: 60000,
        },
        input_rate: {
          type: 'number',
          description: 'Random inputs per second (default 10)',
          minimum: 1,
          maximum: 60,
        },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed keyboard keys (default: arrow keys, WASD, Space, Enter)',
        },
        include_mouse: {
          type: 'boolean',
          description: 'Include random mouse click events (default true)',
        },
        watch_paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Property paths to monitor for NaN / out-of-bounds values (e.g. ["player.position"])',
        },
      },
    },
  },
  {
    name: 'run_script',
    description:
      'Run a multi-step playtest script autonomously. Define a sequence of inputs, waits, screenshots, assertions, eval, and inspections — the bridge executes them all and returns the full report with labeled screenshots and assertion results. No AI round-trips needed between steps.',
    inputSchema: {
      type: 'object' as const,
      required: ['steps'],
      properties: {
        steps: {
          type: 'array',
          description: 'Ordered list of steps to execute',
          items: {
            type: 'object',
            required: ['action'],
            properties: {
              action: {
                type: 'string',
                description: 'Step type: input, wait, screenshot, wait_for, assert, eval, inspect',
              },
              sequence: {
                type: 'array',
                description: '(input) Array of input events',
                items: INPUT_EVENT_ITEM_SCHEMA,
              },
              ms: {
                type: 'number',
                description: '(wait) Milliseconds to wait',
                minimum: 0,
              },
              label: {
                type: 'string',
                description: '(screenshot/wait_for/inspect) Label for this capture',
              },
              condition: {
                type: 'string',
                description: '(wait_for/assert) JS expression',
              },
              timeout_ms: {
                type: 'number',
                description: '(wait_for) Max wait time in ms',
                minimum: 100,
                maximum: 120000,
              },
              message: {
                type: 'string',
                description: '(assert) Human-readable assertion message',
              },
              code: {
                type: 'string',
                description: '(eval) JS code to execute',
              },
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: '(inspect) Property paths to read',
              },
            },
          },
        },
        bail_on_failure: {
          type: 'boolean',
          description: 'Stop executing remaining steps when an assertion fails (default: false)',
        },
      },
    },
  },
] as const;
