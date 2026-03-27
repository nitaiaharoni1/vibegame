import type { BridgeServer } from '../bridge-server.js';

/** Result of a scene_graph call */
export interface SceneGraphResult {
  nodes: unknown;
}

/** Result of an inspect call */
export interface InspectResult {
  path: string;
  value: unknown;
  type: string;
}

/** Result of a mutate call */
export interface MutateResult {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Retrieve the full scene graph from the running game.
 * Returns the raw JSON representation, optionally limited to a depth.
 */
export async function scene_graph(bridge: BridgeServer, args: { depth?: number }): Promise<string> {
  const result = await bridge.send('scene_graph', { depth: args.depth ?? null });
  return JSON.stringify(result, null, 2);
}

/**
 * Inspect a specific property path in the running game (e.g. "scene.children[0].position").
 * Returns the value and its JavaScript type.
 */
export async function inspect(
  bridge: BridgeServer,
  args: { path: string },
): Promise<InspectResult> {
  const result = (await bridge.send('inspect', { path: args.path })) as InspectResult;
  return result;
}

/**
 * Mutate a specific property path in the running game.
 * Returns the old and new values for confirmation.
 */
export async function mutate(
  bridge: BridgeServer,
  args: { path: string; value: unknown },
): Promise<MutateResult> {
  const raw = (await bridge.send('mutate', {
    path: args.path,
    value: args.value,
  })) as { success: true; oldValue: unknown };
  return { path: args.path, oldValue: raw.oldValue, newValue: args.value };
}

/**
 * Mutate multiple property paths in the running game in one call.
 * All mutations are sent concurrently. Returns old and new values for each.
 */
export async function mutate_many(
  bridge: BridgeServer,
  args: { mutations: Array<{ path: string; value: unknown }> },
): Promise<MutateResult[]> {
  return Promise.all(args.mutations.map((m) => mutate(bridge, { path: m.path, value: m.value })));
}

/**
 * Evaluate arbitrary JavaScript in the context of the running game.
 * The code has access to the game's global scope (e.g. `scene`, `camera`, `game`).
 * Returns the result or an error message.
 */
export async function eval_js(
  bridge: BridgeServer,
  args: { code: string },
): Promise<{ result: unknown; error?: string }> {
  const result = (await bridge.send('eval', { code: args.code })) as {
    result: unknown;
    error?: string;
  };
  return result;
}

export interface ErrorsResult {
  errors: Array<{ type: string; message: string; stack?: string; timestamp: number }>;
}

/**
 * Get all runtime errors captured by the bridge since it started.
 * Includes uncaught exceptions, unhandled rejections, and console.error calls.
 */
export async function get_errors(bridge: BridgeServer): Promise<ErrorsResult> {
  const result = (await bridge.send('get_errors', {})) as ErrorsResult;
  return result;
}

/** Tool definitions for registration */
export const inspectToolDefs = [
  {
    name: 'scene_graph',
    description:
      "Retrieve the full scene graph from the running game as formatted JSON. Use this to understand the game's object hierarchy. Returns raw engine hierarchy. For semantic game state with roles and properties, prefer `observe(auto_discover:true)`.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        depth: {
          type: 'number',
          description: 'Maximum depth to traverse (omit for full tree)',
          minimum: 1,
        },
      },
    },
  },
  {
    name: 'inspect',
    description:
      'Inspect a specific property path in the running game (e.g. "scene.children[0].position.x"). Returns the value and its JavaScript type. For reading multiple paths at once, prefer `observe(paths:[...])` which is faster and more structured.',
    inputSchema: {
      type: 'object' as const,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Dot/bracket notation path to the property',
        },
      },
    },
  },
  {
    name: 'mutate',
    description:
      'Set a property at a specific path in the running game. Returns old and new values.',
    inputSchema: {
      type: 'object' as const,
      required: ['path', 'value'],
      properties: {
        path: {
          type: 'string',
          description: 'Dot/bracket notation path to the property',
        },
        value: {
          description: 'The new value to set (any JSON-serializable value)',
        },
      },
    },
  },
  {
    name: 'mutate_many',
    description:
      'Set multiple property paths in the running game in one call. All mutations are applied concurrently. Use instead of multiple mutate calls to set game state in bulk (e.g. reset player position, health, score at once).',
    inputSchema: {
      type: 'object' as const,
      required: ['mutations'],
      properties: {
        mutations: {
          type: 'array',
          description: 'Array of { path, value } pairs to set',
          items: {
            type: 'object',
            required: ['path', 'value'],
            properties: {
              path: { type: 'string', description: 'Dot/bracket notation path to the property' },
              value: { description: 'The new value to set (any JSON-serializable value)' },
            },
          },
        },
      },
    },
  },
  {
    name: 'eval_js',
    description:
      'Evaluate arbitrary JavaScript in the context of the running game. Useful for spawning objects, changing game state, or calling game functions. Has full access to the game global scope.',
    inputSchema: {
      type: 'object' as const,
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to evaluate in the game context',
        },
      },
    },
  },
  {
    name: 'get_errors',
    description:
      'Get all runtime errors captured by the bridge: uncaught exceptions, unhandled promise rejections, and console.error calls. Returns empty array when no errors occurred.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
] as const;
