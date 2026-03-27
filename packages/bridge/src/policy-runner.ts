import type { EpisodeLogEntry, RunPolicyArgs, RunPolicyResult } from '@vigame/protocol';
import type { ErrorInterceptor } from './error-interceptor.js';
import { simulateInputSequence } from './input-simulator.js';
import { inspectPath } from './mutator.js';

export type { EpisodeLogEntry, RunPolicyArgs, RunPolicyResult };

type PolicyFn = (state: Record<string, unknown>) => string;
type RewardFn = (state: Record<string, unknown>, prev: Record<string, unknown>) => number;
type DoneConditionFn = (state: Record<string, unknown>) => unknown;

function compileExpression<T>(code: string, paramNames: string[]): T {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(...paramNames, `return (${code})`) as T;
  } catch {
    // eslint-disable-next-line no-new-func
    return new Function(...paramNames, code) as T;
  }
}

function readState(
  stateSpec: string[],
  registeredRoots: Map<string, unknown>,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const path of stateSpec) {
    try {
      state[path] = inspectPath(path, registeredRoots).value;
    } catch {
      state[path] = undefined;
    }
  }
  return state;
}

export async function runPolicy(
  args: RunPolicyArgs,
  registeredRoots: Map<string, unknown>,
  errorInterceptor: ErrorInterceptor,
): Promise<RunPolicyResult> {
  const frameIntervalMs = args.frame_interval_ms ?? 16;
  const logIntervalMs = args.log_interval_ms ?? 500;

  // Compile policy, reward, and optional done_condition once before the loop
  const policyFn = compileExpression<PolicyFn>(args.policy, ['state']);
  const rewardFn = compileExpression<RewardFn>(args.reward, ['state', 'prev']);
  const doneFn =
    args.done_condition !== undefined
      ? compileExpression<DoneConditionFn>(args.done_condition, ['state'])
      : null;

  const episodeLog: EpisodeLogEntry[] = [];
  const rewardCurve: number[] = [];
  const events: string[] = [];
  const errors: string[] = [];
  const actionCounts: Record<string, number> = {};

  let totalReward = 0;
  let framesExecuted = 0;
  let prevAction = '';
  let prevState: Record<string, unknown> = {};

  const start = Date.now();
  let lastLogTime = start;
  let lastRewardCurveTime = start;

  // Clear any stale errors before starting
  errorInterceptor.getAndClear();

  while (true) {
    const now = Date.now();
    const elapsed = now - start;

    if (elapsed >= args.duration_ms) break;

    // Read current state
    const state = readState(args.state_spec, registeredRoots);

    // Call policy function
    let action = '';
    try {
      const result: unknown = policyFn(state);
      action = typeof result === 'string' ? result : '';
    } catch (err) {
      errors.push(
        `policy error at frame ${framesExecuted}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Validate action: if not in actions map, treat as idle (no keys)
    const actionKeys = action !== '' && action in args.actions ? action : '';

    // Key state transitions: release old keys, press new keys
    if (actionKeys !== prevAction) {
      const oldKeys: string[] = prevAction !== '' ? (args.actions[prevAction] ?? []) : [];
      const newKeys: string[] = actionKeys !== '' ? (args.actions[actionKeys] ?? []) : [];

      // Release keys that are in old but not new
      for (const key of oldKeys) {
        if (!newKeys.includes(key)) {
          try {
            await simulateInputSequence([{ type: 'keyup', key }]);
          } catch (err) {
            errors.push(
              `keyup error (${key}): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      // Press keys that are in new but not old
      for (const key of newKeys) {
        if (!oldKeys.includes(key)) {
          try {
            await simulateInputSequence([{ type: 'keydown', key }]);
          } catch (err) {
            errors.push(
              `keydown error (${key}): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      if (actionKeys !== prevAction) {
        events.push(
          `t=${elapsed}ms frame=${framesExecuted}: action changed '${prevAction}' → '${actionKeys}'`,
        );
      }
      prevAction = actionKeys;
    }

    // Compute reward
    let frameReward = 0;
    try {
      const result: unknown = rewardFn(state, prevState);
      frameReward = typeof result === 'number' ? result : 0;
    } catch (err) {
      errors.push(
        `reward error at frame ${framesExecuted}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    totalReward += frameReward;

    // Track action counts (use the raw action string from policy, not the validated one)
    if (action !== '') {
      actionCounts[action] = (actionCounts[action] ?? 0) + 1;
    }

    // Check done condition
    if (doneFn !== null) {
      let done = false;
      try {
        done = Boolean(doneFn(state));
      } catch {
        // treat errors as false
      }
      if (done) {
        events.push(`t=${elapsed}ms frame=${framesExecuted}: done_condition triggered`);
        prevState = state;
        framesExecuted++;
        break;
      }
    }

    // Add to episode log at log_interval_ms rate
    if (now - lastLogTime >= logIntervalMs) {
      episodeLog.push({
        t: elapsed,
        frame: framesExecuted,
        state: { ...state },
        action,
        reward: frameReward,
        cumulative_reward: totalReward,
      });
      lastLogTime = now;
    }

    // Add to reward_curve once per second
    if (now - lastRewardCurveTime >= 1000) {
      rewardCurve.push(totalReward);
      lastRewardCurveTime = now;
    }

    prevState = state;
    framesExecuted++;

    await new Promise<void>((r) => setTimeout(r, frameIntervalMs));
  }

  // Release all currently held keys on loop end
  if (prevAction !== '') {
    const heldKeys = args.actions[prevAction] ?? [];
    for (const key of heldKeys) {
      try {
        await simulateInputSequence([{ type: 'keyup', key }]);
      } catch {
        // best-effort cleanup
      }
    }
  }

  // Read final state
  const finalState = readState(args.state_spec, registeredRoots);

  // Collect errors from interceptor
  const capturedErrors = errorInterceptor.getAndClear();
  for (const e of capturedErrors) {
    errors.push(`[${e.type}] ${e.message}`);
  }

  return {
    total_reward: totalReward,
    frames_executed: framesExecuted,
    elapsed_ms: Date.now() - start,
    final_state: finalState,
    action_counts: actionCounts,
    reward_curve: rewardCurve,
    episode_log: episodeLog,
    events,
    errors,
  };
}
