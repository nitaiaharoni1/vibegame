/**
 * Wire JSON for `act_and_observe` / `watch_for` (browser bridge ↔ MCP).
 * `inputs` matches the serialized form of bridge input-event arrays.
 */
export interface BridgeInputEventWire {
  type: string;
  key?: string;
  button?: number;
  x?: number;
  y?: number;
  duration?: number;
}

export interface ActAndObserveArgs {
  mutations?: Array<{ path: string; value: unknown }>;
  eval?: string;
  inputs?: BridgeInputEventWire[];
  wait_ms?: number;
  screenshot?: boolean | { quality?: number };
  inspect?: string[];
  scene_graph?: { depth?: number };
}

export interface WatchForArgs {
  condition: string;
  timeout_ms: number;
  capture?: {
    screenshot?: boolean;
    inspect?: string[];
    scene_graph?: { depth?: number };
  };
}

export interface WatchForResult {
  triggered: boolean;
  elapsed_ms: number;
  screenshot?: { dataUrl: string; width: number; height: number };
  inspections?: Record<string, { value: unknown; type: string }>;
  scene_graph?: unknown;
}

export interface ActAndObserveWireResult {
  mutations?: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
  eval?: { result: unknown; error?: string };
  inputs?: { executed: number };
  screenshot?: { dataUrl: string; width: number; height: number };
  inspections?: Record<string, { value: unknown; type: string }>;
  scene_graph?: unknown;
  errors: Array<{ type: string; message: string; stack?: string; timestamp: number }>;
  elapsed_ms: number;
}
