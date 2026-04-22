/**
 * Wire types for run_policy — autonomous game-playing loop where an AI-written
 * JS policy function executes at game speed on the bridge side.
 */

export interface RunPolicyArgs {
  /** JS expression evaluated as: (state: Record<string, unknown>) => string (action name) */
  policy: string;
  /** JS expression evaluated as: (state: Record<string, unknown>, prev: Record<string, unknown>) => number */
  reward: string;
  /** Dot-paths to read from the game each frame (e.g. "player.position.x") */
  state_spec: string[];
  /** Maps action name to list of key names to HOLD while action is active */
  actions: Record<string, string[]>;
  /** How long to run the episode in milliseconds */
  duration_ms: number;
  /** Optional JS expression with 'state' in scope — stops episode when truthy */
  done_condition?: string;
  /** How often to sample into episode_log (ms). Default: 500 */
  log_interval_ms?: number;
  /** Delay between frames (ms). 0 = max speed. Default: 16 */
  frame_interval_ms?: number;
  /** 'hold' (default) keeps keys pressed until action changes. 'tap' presses and releases each frame. */
  input_mode?: 'hold' | 'tap';
  /** Duration of each tap in ms (only used when input_mode is 'tap'). Default: 50 */
  tap_duration_ms?: number;
  /** Also log whenever a state_spec value changes (default true). Captures score/health transitions the fixed-interval log misses. */
  log_state_changes?: boolean;
  /** Frames of unchanged state before emitting a stale warning. Default: 60 */
  stale_warn_frames?: number;
  /** Frames of unchanged state before aborting the episode. Default: 300 */
  stale_abort_frames?: number;
}

export interface EpisodeLogEntry {
  t: number;
  frame: number;
  state: Record<string, unknown>;
  action: string;
  reward: number;
  cumulative_reward: number;
}

export interface RunPolicyResult {
  total_reward: number;
  frames_executed: number;
  elapsed_ms: number;
  final_state: Record<string, unknown>;
  /** How many times each action was selected */
  action_counts: Record<string, number>;
  /** Cumulative reward sampled once per second */
  reward_curve: number[];
  /** Sampled state+action log at log_interval_ms rate */
  episode_log: EpisodeLogEntry[];
  /** State-change-driven log entries (emitted when a state_spec value changes) */
  state_change_log?: StateChangeEntry[];
  /** Human-readable event descriptions (e.g. "score increased at t=2000") */
  events: string[];
  errors: string[];
  diagnostics?: {
    unresolved_paths: string[];
    available_roots: string[];
    policy_return_type?: string;
  };
}

export interface StateChangeEntry {
  t: number;
  frame: number;
  path: string;
  old_value: unknown;
  new_value: unknown;
  action: string;
  reward: number;
}

/**
 * Wire types for observe — structured game state snapshot without screenshots.
 */

export interface ObserveArgs {
  /** Specific dot-paths to read (e.g. ["player.health", "score"]) */
  paths?: string[];
  /** Walk registeredRoots + their children to find all game entities */
  auto_discover?: boolean;
  /** Compute pairwise distances between positioned entities */
  spatial?: boolean;
  /** Max depth for auto_discover entity walk (default 3, max 5) */
  max_depth?: number;
  /** Compute velocity vectors for positioned entities by comparing to previous observation */
  compute_velocity?: boolean;
}

export interface ObservedEntity {
  name: string;
  type: string;
  position?: { x: number; y: number; z?: number };
  /** Velocity vector computed from position delta between consecutive observe() calls */
  velocity?: { x: number; y: number; z?: number };
  /** Primitive properties only (string | number | boolean) */
  properties: Record<string, string | number | boolean>;
}

export interface SpatialRelation {
  from: string;
  to: string;
  distance: number;
}

export interface ObserveResult {
  /** Values for explicitly requested paths */
  state: Record<string, unknown>;
  entities?: ObservedEntity[];
  spatial?: SpatialRelation[];
  registered_roots: string[];
  fps: number;
  /** True when auto_discover hit the entity budget cap and stopped early */
  budget_exceeded?: boolean;
}

/**
 * Wire types for discover_controls — auto-discovers what each input does.
 */

export interface DiscoverControlsArgs {
  /** Force re-scan even if cached results exist */
  rescan?: boolean;
  /** Custom keys to test beyond the default set */
  extra_keys?: string[];
  /** How long to wait after each keypress for game to react (ms). Default: 200. Increase for physics-heavy games. */
  probe_delay_ms?: number;
  /** Max depth for recursive property probing. Default: 3 */
  probe_depth?: number;
}

export interface ControlMapping {
  input: string;
  effect: string;
  target: string | null;
  /** Raw property deltas observed */
  deltas: Record<string, unknown>;
}

export interface DiscoverControlsResult {
  controls: ControlMapping[];
  summary: string;
  cached: boolean;
  /** Set when results may be unreliable (e.g. 'background_tab') */
  warning?: string;
}
