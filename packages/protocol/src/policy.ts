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
  /** Human-readable event descriptions (e.g. "score increased at t=2000") */
  events: string[];
  errors: string[];
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
}

export interface ObservedEntity {
  name: string;
  type: string;
  position?: { x: number; y: number; z?: number };
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
}

/**
 * Wire types for discover_controls — auto-discovers what each input does.
 */

export interface DiscoverControlsArgs {
  /** Force re-scan even if cached results exist */
  rescan?: boolean;
  /** Custom keys to test beyond the default set */
  extra_keys?: string[];
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
}
