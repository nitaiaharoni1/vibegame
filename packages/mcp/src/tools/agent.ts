import type {
  DiscoverControlsArgs,
  DiscoverControlsResult,
  ObserveArgs,
  ObserveResult,
  RunPolicyArgs,
  RunPolicyResult,
} from '@vigame/protocol';
import type { BridgeServer } from '../bridge-server.js';

/**
 * Run an autonomous policy episode.
 * The AI sends a JS policy + reward function; the bridge executes them at game speed
 * for the specified duration, then returns aggregated results.
 */
export async function run_policy(
  bridge: BridgeServer,
  args: RunPolicyArgs,
): Promise<RunPolicyResult> {
  // Estimate timeout: episode duration + 30s buffer + frame overhead
  const timeoutMs = args.duration_ms + 30_000;
  const result = (await bridge.send(
    'run_policy',
    args as unknown as Record<string, unknown>,
    timeoutMs,
  )) as RunPolicyResult;
  return result;
}

/**
 * Observe current game state as structured data (no screenshots).
 * Returns entity positions, properties, spatial relations, and FPS.
 */
export async function observe(bridge: BridgeServer, args: ObserveArgs): Promise<ObserveResult> {
  const result = (await bridge.send(
    'observe',
    args as unknown as Record<string, unknown>,
  )) as ObserveResult;
  return result;
}

/**
 * Discover what each input key does by systematically testing them.
 * Results are cached — call with rescan:true to re-test.
 */
export async function discover_controls(
  bridge: BridgeServer,
  args: DiscoverControlsArgs,
): Promise<DiscoverControlsResult> {
  // ~10 keys × 400ms each = ~4s; add buffer
  const result = (await bridge.send(
    'discover_controls',
    args as unknown as Record<string, unknown>,
    30_000,
  )) as DiscoverControlsResult;
  return result;
}

/** Tool definitions for MCP registration */
export const agentToolDefs = [
  {
    name: 'run_policy',
    description:
      '**Primary gameplay tool.** Run an autonomous game-playing episode. The AI provides a JavaScript policy function and reward function as strings; the bridge executes them at game speed (up to 60fps) for the specified duration without any MCP round-trips. The policy function receives the current game state and returns an action name (e.g. "jump", "move_right"). Actions are mapped to keys to hold. Returns episode results: total reward, action distribution, sampled state log, events, and errors. Use this to autonomously play and test the game at full speed.',
    inputSchema: {
      type: 'object' as const,
      required: ['policy', 'reward', 'state_spec', 'actions', 'duration_ms'],
      properties: {
        policy: {
          type: 'string',
          description:
            'JavaScript expression evaluated as a function: (state) => actionName. state is a flat object with your state_spec paths as keys. Return one of the keys in the actions map, or empty string for idle.',
        },
        reward: {
          type: 'string',
          description:
            'JavaScript expression evaluated as a function: (state, prev) => number. Return the reward for this frame. Use state.score - prev.score to reward score gains, or -1 if state.health < prev.health for health loss.',
        },
        state_spec: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dot-paths to read from the game each frame (e.g. ["player.position.x", "player.health", "score"]). These become keys in the state object passed to policy and reward.',
        },
        actions: {
          type: 'object',
          description:
            'Maps action name to list of key names to HOLD while that action is active (e.g. {"move_right": ["ArrowRight"], "jump": ["Space"], "idle": []}). Keys are held down between frames until the action changes.',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        duration_ms: {
          type: 'number',
          description: 'How long to run the episode in milliseconds (e.g. 10000 for 10 seconds).',
          minimum: 100,
        },
        done_condition: {
          type: 'string',
          description:
            'Optional JS expression with state in scope that stops the episode early when truthy (e.g. "state[\'player.health\'] <= 0").',
        },
        log_interval_ms: {
          type: 'number',
          description: 'How often to sample into episode_log (ms). Default: 500.',
          minimum: 100,
        },
        frame_interval_ms: {
          type: 'number',
          description:
            'Delay between frames (ms). 0 = max speed (as fast as possible). 16 = real-time 60fps. Default: 16.',
          minimum: 0,
        },
      },
    },
  },
  {
    name: 'observe',
    description:
      '**Start here.** Get current game state as structured data without screenshots. Much faster than screenshot + inspect. Returns entity positions/properties, registered root values, spatial distances, and FPS. Use auto_discover to automatically find all game entities. Use paths to read specific property values.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific dot-paths to read (e.g. ["player.health", "score", "player.position.x"]).',
        },
        auto_discover: {
          type: 'boolean',
          description:
            'Walk all registered roots and their immediate children to discover game entities with their positions and properties. Good for initial game exploration.',
        },
        spatial: {
          type: 'boolean',
          description:
            'Compute pairwise distances between all entities that have positions. Helps understand proximity and spatial layout.',
        },
      },
    },
  },
  {
    name: 'discover_controls',
    description:
      '**Call once at session start** before using `run_policy`. Automatically discover what each keyboard input does by systematically testing keys and observing state changes. Tests ArrowUp/Down/Left/Right, WASD, Space, and Enter. Returns a control map (e.g. "ArrowRight: player.position.x increases by ~5"). Results are cached; pass rescan:true to re-test.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        rescan: {
          type: 'boolean',
          description: 'Force re-scan even if cached results exist.',
        },
        extra_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional key names to test beyond the default set.',
        },
      },
    },
  },
] as const;
