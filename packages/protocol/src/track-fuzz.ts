/**
 * Wire types for `track` and `fuzz` bridge commands (JSON-serializable).
 */

/** Timed input for `track` — same shape as bridge dispatch, with `at` offset. */
export interface TimedInputEventWire {
  type: string;
  key?: string;
  button?: number;
  x?: number;
  y?: number;
  at: number;
}

export interface TrackArgsWire {
  paths: string[];
  duration_ms: number;
  sample_rate?: number;
  inputs?: TimedInputEventWire[];
}

export interface TrackSampleWire {
  t: number;
  values: Record<string, unknown>;
}

export interface TrackStatsWire {
  path: string;
  samples: number;
  start: unknown;
  end: unknown;
  delta?: number;
  velocity?: { avg: number; max: number };
}

export interface TrackResultWire {
  samples: TrackSampleWire[];
  stats: TrackStatsWire[];
  duration_ms: number;
  inputs_fired: number;
}

export interface FuzzArgsWire {
  duration_ms: number;
  input_rate?: number;
  keys?: string[];
  include_mouse?: boolean;
  watch_paths?: string[];
}

export type FuzzIssueTypeWire = 'error' | 'nan' | 'out_of_bounds' | 'fps_drop';

export interface FuzzIssueWire {
  type: FuzzIssueTypeWire;
  timestamp: number;
  details: string;
}

/** `first_issue_screenshot` is a full data URL when present (MCP may strip for images). */
export interface FuzzResultWire {
  duration_ms: number;
  inputs_dispatched: number;
  issues: FuzzIssueWire[];
  first_issue_screenshot?: string;
  fps_min: number;
  fps_avg: number;
}
