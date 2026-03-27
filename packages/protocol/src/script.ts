/**
 * Wire types for `run_script` — a multi-step playtest script that executes
 * entirely on the bridge side. The AI sends one call; the bridge runs the
 * full sequence and returns all screenshots + assertion results.
 */
import type { BridgeInputEventWire } from './compound.js';

// ── Step types ──────────────────────────────────────────────────────────────

export interface ScriptStepInput {
  action: 'input';
  sequence: BridgeInputEventWire[];
}

export interface ScriptStepWait {
  action: 'wait';
  ms: number;
}

export interface ScriptStepScreenshot {
  action: 'screenshot';
  label?: string;
}

export interface ScriptStepWaitFor {
  action: 'wait_for';
  condition: string;
  timeout_ms: number;
  label?: string;
}

export interface ScriptStepAssert {
  action: 'assert';
  condition: string;
  message?: string;
}

export interface ScriptStepEval {
  action: 'eval';
  code: string;
}

export interface ScriptStepInspect {
  action: 'inspect';
  paths: string[];
  label?: string;
}

export type ScriptStep =
  | ScriptStepInput
  | ScriptStepWait
  | ScriptStepScreenshot
  | ScriptStepWaitFor
  | ScriptStepAssert
  | ScriptStepEval
  | ScriptStepInspect;

// ── Args / Result ───────────────────────────────────────────────────────────

export interface RunScriptArgs {
  steps: ScriptStep[];
  /** Stop executing remaining steps when an assertion fails (default: false). */
  bail_on_failure?: boolean;
}

export interface ScriptScreenshot {
  label: string;
  dataUrl: string;
  width: number;
  height: number;
  step_index: number;
}

export interface ScriptAssertionResult {
  step_index: number;
  passed: boolean;
  message: string;
  actual?: unknown;
  error?: string;
}

export interface ScriptInspection {
  label: string;
  step_index: number;
  values: Record<string, { value: unknown; type: string }>;
}

export interface RunScriptResult {
  completed: boolean;
  steps_executed: number;
  total_steps: number;
  elapsed_ms: number;
  screenshots: ScriptScreenshot[];
  assertions: ScriptAssertionResult[];
  inspections: ScriptInspection[];
  errors: Array<{ type: string; message: string; stack?: string; timestamp: number }>;
}
