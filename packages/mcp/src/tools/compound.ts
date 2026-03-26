import {
  type ActAndObserveArgs,
  type ActAndObserveWireResult,
  parseDataUrl,
  type WatchForArgs,
  type WatchForResult,
} from '@vigame/protocol';
import type { BridgeServer } from '../bridge-server.js';
import { INPUT_EVENT_ITEM_SCHEMA } from './schema/input-event.js';

export async function act_and_observe(
  bridge: BridgeServer,
  args: ActAndObserveArgs,
): Promise<{ textContent: string; imageData?: { data: string; mimeType: string } }> {
  const timeoutMs = (args.wait_ms ?? 0) + 15000;
  const raw = (await bridge.send(
    'act_and_observe',
    args as unknown as Record<string, unknown>,
    timeoutMs,
  )) as ActAndObserveWireResult;

  const { screenshot, ...textParts } = raw;
  const textContent = JSON.stringify(textParts, null, 2);

  if (screenshot) {
    const parsed = parseDataUrl(screenshot.dataUrl);
    if (parsed) {
      return { textContent, imageData: { data: parsed.base64, mimeType: parsed.mimeType } };
    }
  }

  return { textContent };
}

export async function watch_for(
  bridge: BridgeServer,
  args: WatchForArgs,
): Promise<{ textContent: string; imageData?: { data: string; mimeType: string } }> {
  const timeoutMs = args.timeout_ms + 5000;
  const raw = (await bridge.send(
    'watch_for',
    args as unknown as Record<string, unknown>,
    timeoutMs,
  )) as WatchForResult;

  const { screenshot, ...textParts } = raw;
  const textContent = JSON.stringify(textParts, null, 2);

  if (screenshot) {
    const parsed = parseDataUrl(screenshot.dataUrl);
    if (parsed) {
      return { textContent, imageData: { data: parsed.base64, mimeType: parsed.mimeType } };
    }
  }

  return { textContent };
}

export const compoundToolDefs = [
  {
    name: 'act_and_observe',
    description:
      'Execute mutations, eval JS, and simulate inputs, then observe via screenshot/inspect/scene_graph — all in one call. Replaces 3-6 sequential tool calls. Accepts any combination of operations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mutations: {
          type: 'array',
          description: 'Property mutations to apply: [{ path, value }]',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Dot-notation path (e.g. "player.position.x")' },
              value: { description: 'New value to set' },
            },
          },
        },
        eval: {
          type: 'string',
          description: 'JavaScript expression to evaluate in the game context',
        },
        inputs: {
          type: 'array',
          description: 'Input events to simulate',
          items: INPUT_EVENT_ITEM_SCHEMA,
        },
        wait_ms: {
          type: 'number',
          description: 'Wait this many ms after inputs before observing (0-30000)',
          minimum: 0,
          maximum: 30000,
        },
        screenshot: {
          description:
            'Capture screenshot after waiting. true = default quality, or { quality: 0-1 }',
        },
        inspect: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property paths to inspect after waiting',
        },
        scene_graph: {
          type: 'object',
          description: 'Capture scene graph with optional depth',
          properties: { depth: { type: 'number', minimum: 1, maximum: 10 } },
        },
      },
    },
  },
  {
    name: 'watch_for',
    description:
      'Wait for a JavaScript condition to become true, then capture observations. More efficient than polling. Useful for waiting until a ball scores, animation completes, health drops, etc.',
    inputSchema: {
      type: 'object' as const,
      required: ['condition', 'timeout_ms'],
      properties: {
        condition: {
          type: 'string',
          description:
            'JS expression that returns truthy when the event occurs (e.g. "ball.position.x < 0")',
        },
        timeout_ms: {
          type: 'number',
          description: 'Max wait time in ms (100-60000)',
          minimum: 100,
          maximum: 60000,
        },
        capture: {
          type: 'object',
          description: 'What to capture when condition triggers',
          properties: {
            screenshot: { type: 'boolean' },
            inspect: { type: 'array', items: { type: 'string' } },
            scene_graph: { type: 'object', properties: { depth: { type: 'number' } } },
          },
        },
      },
    },
  },
] as const;
