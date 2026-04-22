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
 * Build a human-readable summary of a run_policy episode result.
 */
export function summarizeRunPolicy(result: RunPolicyResult): string {
  const lines: string[] = [];

  // Header
  const elapsed = (result.elapsed_ms / 1000).toFixed(1);
  const actionNames = Object.keys(result.action_counts);
  lines.push(
    `Episode: ${elapsed}s, ${result.frames_executed} frames, ${actionNames.length} action(s) used`,
  );

  // Actions breakdown
  if (actionNames.length > 0) {
    const parts = actionNames.map((a) => `${a}: ${result.action_counts[a]}`);
    lines.push(`Actions: ${parts.join(', ')}`);
  }

  // State changes
  if (result.state_change_log && result.state_change_log.length > 0) {
    const pathChanges = new Map<string, { first: unknown; last: unknown }>();
    for (const entry of result.state_change_log) {
      const existing = pathChanges.get(entry.path);
      if (!existing) {
        pathChanges.set(entry.path, { first: entry.old_value, last: entry.new_value });
      } else {
        existing.last = entry.new_value;
      }
    }
    const changeParts: string[] = [];
    for (const [path, { first, last }] of pathChanges) {
      changeParts.push(`${path}: ${JSON.stringify(first)} → ${JSON.stringify(last)}`);
    }
    if (changeParts.length > 0) {
      lines.push(`State changes: ${changeParts.join(', ')}`);
    }
  }

  // Reward
  lines.push(`Reward: ${result.total_reward.toFixed(1)} total`);
  if (result.reward_curve.length > 0) {
    lines.push(`Reward curve: [${result.reward_curve.map((r) => r.toFixed(1)).join(', ')}]`);
  }

  // Diagnostics
  const diag = result.diagnostics;
  if (diag?.unresolved_paths && diag.unresolved_paths.length > 0) {
    lines.push(`Unresolved paths: ${diag.unresolved_paths.join(', ')}`);
    lines.push(`  Available roots: ${diag.available_roots?.join(', ') ?? 'unknown'}`);
  }
  if (diag?.policy_return_type && diag.policy_return_type !== 'string') {
    lines.push(`Policy returned ${diag.policy_return_type} instead of string`);
  }

  // Errors
  if (result.errors.length > 0) {
    lines.push(`Errors (${result.errors.length}):`);
    for (const err of result.errors.slice(0, 5)) {
      lines.push(`  - ${err}`);
    }
    if (result.errors.length > 5) lines.push(`  ... and ${result.errors.length - 5} more`);
  }

  // Events (warnings only)
  const warnings = result.events.filter((e) => e.includes('WARNING') || e.includes('ABORTED'));
  if (warnings.length > 0) {
    lines.push(`Warnings: ${warnings.join('; ')}`);
  }

  return lines.join('\n');
}

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
        input_mode: {
          type: 'string',
          enum: ['hold', 'tap'],
          description:
            "'hold' (default) keeps keys pressed until action changes — good for movement. 'tap' presses and releases each frame — needed for games with discrete key presses (serve, interact, menu).",
        },
        tap_duration_ms: {
          type: 'number',
          description:
            'Duration of each tap in ms (only used when input_mode is "tap"). Default: 50.',
          minimum: 10,
        },
        log_state_changes: {
          type: 'boolean',
          description:
            'Also emit a log entry whenever a state_spec value changes (default true). Captures score/health transitions the fixed-interval log misses. Entries appear in state_change_log.',
        },
        stale_warn_frames: {
          type: 'number',
          description:
            'Frames of unchanged state before emitting a stale warning event. Default: 60.',
          minimum: 10,
        },
        stale_abort_frames: {
          type: 'number',
          description:
            'Frames of unchanged state before aborting the episode. Default: 300. Set to 0 to disable stale abort.',
          minimum: 0,
        },
      },
    },
  },
  {
    name: 'observe',
    description:
      '**Start here.** Get current game state as structured data without screenshots. Much faster than screenshot + inspect. Returns entity positions/properties, velocity vectors, registered root values, spatial distances, and FPS. Use auto_discover to recursively find all game entities (configurable depth). Use compute_velocity to track entity movement between calls. Use paths to read specific property values.',
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
            'Walk all registered roots and their children recursively to discover game entities with their positions and properties. Good for initial game exploration.',
        },
        spatial: {
          type: 'boolean',
          description:
            'Compute pairwise distances between all entities that have positions. Helps understand proximity and spatial layout.',
        },
        max_depth: {
          type: 'number',
          description:
            'Max depth for auto_discover entity walk. Default: 3, max: 5. Higher values find deeply nested entities but take longer.',
          minimum: 1,
          maximum: 5,
        },
        compute_velocity: {
          type: 'boolean',
          description:
            'Compute velocity vectors for positioned entities by comparing to the previous observe() call. Requires two consecutive calls to produce data.',
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
        probe_delay_ms: {
          type: 'number',
          description:
            'How long to wait after each keypress for the game to react (ms). Default: 200. Increase for physics-heavy games that need more frames.',
          minimum: 50,
        },
        probe_depth: {
          type: 'number',
          description:
            'Max depth for recursive property probing. Default: 3. Higher values detect effects on deeply nested physics state.',
          minimum: 1,
          maximum: 5,
        },
      },
    },
  },
] as const;
