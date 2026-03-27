import type {
  RunScriptArgs,
  RunScriptResult,
  ScriptAssertionResult,
  ScriptInspection,
  ScriptScreenshot,
  ScriptStep,
} from '@vigame/protocol';
import type { CapturedError, ErrorInterceptor } from './error-interceptor.js';
import type { InputEvent } from './input-simulator.js';
import { simulateInputSequence } from './input-simulator.js';
import { inspectPath } from './mutator.js';
import { captureScreenshot, type ScreenshotResult } from './screenshot.js';

export type { RunScriptArgs, RunScriptResult };

export async function runScript(
  args: RunScriptArgs,
  canvas: HTMLCanvasElement | null,
  registeredRoots: Map<string, unknown>,
  errorInterceptor: ErrorInterceptor,
): Promise<RunScriptResult> {
  const start = Date.now();
  errorInterceptor.getAndClear();

  const screenshots: ScriptScreenshot[] = [];
  const assertions: ScriptAssertionResult[] = [];
  const inspections: ScriptInspection[] = [];
  let stepsExecuted = 0;
  let bailed = false;

  for (let i = 0; i < args.steps.length; i++) {
    const step = args.steps[i] as ScriptStep;

    try {
      switch (step.action) {
        case 'input': {
          await simulateInputSequence(step.sequence as InputEvent[]);
          break;
        }

        case 'wait': {
          await new Promise<void>((r) => setTimeout(r, step.ms));
          break;
        }

        case 'screenshot': {
          let ss: ScreenshotResult;
          try {
            ss = captureScreenshot(canvas, 0.9);
          } catch {
            // canvas not available — skip
            break;
          }
          screenshots.push({
            label: step.label ?? `step_${i}`,
            dataUrl: ss.dataUrl,
            width: ss.width,
            height: ss.height,
            step_index: i,
          });
          break;
        }

        case 'wait_for': {
          const rootEntries = Array.from(registeredRoots.entries());
          const rootNames = rootEntries.map(([k]) => k);
          const rootValues = rootEntries.map(([, v]) => v);
          // eslint-disable-next-line no-new-func
          const condFn = new Function(...rootNames, `return (${step.condition})`);

          const waitStart = Date.now();
          let triggered = false;
          while (Date.now() - waitStart < step.timeout_ms) {
            await new Promise<void>((r) => setTimeout(r, 16));
            try {
              if (condFn(...rootValues)) {
                triggered = true;
                break;
              }
            } catch {
              // treat errors as false
            }
          }

          // If there's a label, capture a screenshot when it triggers (or times out)
          if (step.label) {
            try {
              const ss = captureScreenshot(canvas, 0.9);
              screenshots.push({
                label: step.label,
                dataUrl: ss.dataUrl,
                width: ss.width,
                height: ss.height,
                step_index: i,
              });
            } catch {
              // skip
            }
          }

          if (!triggered) {
            assertions.push({
              step_index: i,
              passed: false,
              message: `wait_for timed out after ${step.timeout_ms}ms: ${step.condition}`,
            });
            if (args.bail_on_failure) {
              stepsExecuted = i + 1;
              bailed = true;
            }
          }
          break;
        }

        case 'assert': {
          const rootEntries = Array.from(registeredRoots.entries());
          const rootNames = rootEntries.map(([k]) => k);
          const rootValues = rootEntries.map(([, v]) => v);

          try {
            // eslint-disable-next-line no-new-func
            const assertFn = new Function(...rootNames, `return (${step.condition})`);
            const actual: unknown = assertFn(...rootValues);
            const passed = Boolean(actual);
            assertions.push({
              step_index: i,
              passed,
              message: step.message ?? step.condition,
              actual,
            });
            if (!passed && args.bail_on_failure) {
              stepsExecuted = i + 1;
              bailed = true;
            }
          } catch (err) {
            assertions.push({
              step_index: i,
              passed: false,
              message: step.message ?? step.condition,
              error: err instanceof Error ? err.message : String(err),
            });
            if (args.bail_on_failure) {
              stepsExecuted = i + 1;
              bailed = true;
            }
          }
          break;
        }

        case 'eval': {
          const rootEntries = Array.from(registeredRoots.entries());
          const rootNames = rootEntries.map(([k]) => k);
          const rootValues = rootEntries.map(([, v]) => v);
          try {
            let fn: (...fnArgs: unknown[]) => unknown;
            try {
              // eslint-disable-next-line no-new-func
              fn = new Function(...rootNames, `return (${step.code})`) as typeof fn;
            } catch {
              // eslint-disable-next-line no-new-func
              fn = new Function(...rootNames, step.code) as typeof fn;
            }
            fn(...rootValues);
          } catch {
            // eval errors are non-fatal in scripts
          }
          break;
        }

        case 'inspect': {
          const values: Record<string, { value: unknown; type: string }> = {};
          for (const path of step.paths) {
            values[path] = inspectPath(path, registeredRoots);
          }
          inspections.push({
            label: step.label ?? `step_${i}`,
            step_index: i,
            values,
          });
          break;
        }
      }
    } catch {
      // Unexpected error in step execution — continue to next step
    }

    if (bailed) break;
    stepsExecuted = i + 1;
  }

  const errors: CapturedError[] = errorInterceptor.getAndClear();

  return {
    completed: !bailed && stepsExecuted === args.steps.length,
    steps_executed: stepsExecuted,
    total_steps: args.steps.length,
    elapsed_ms: Date.now() - start,
    screenshots,
    assertions,
    inspections,
    errors,
  };
}
