import type { EpisodeLogEntry, RunPolicyArgs, RunPolicyResult } from '@vigame/protocol';
import type { ErrorInterceptor } from './error-interceptor.js';
import { SPECIAL_KEY_CODES, SPECIAL_KEY_CODES_TO_CODE } from './input-simulator.js';

export type { EpisodeLogEntry, RunPolicyArgs, RunPolicyResult };

/**
 * Detect arrow-function expressions and wrap them so they are
 * invoked with the correct parameter names instead of returning
 * the function object.
 *
 * "(s) => s.x > 5 ? 'right' : 'left'"  →  "((s) => s.x > 5 ? 'right' : 'left')(state)"
 * "(s, p) => s.score - p.score"         →  "((s, p) => s.score - p.score)(state, prev)"
 */
export function wrapIfArrowFunction(code: string, paramNames: string[]): string {
  const trimmed = code.trim();
  // Match: optional parens around params, =>, body
  // e.g. "(s) => ...", "s => ...", "(state, prev) => ..."
  if (/^\(?\s*[\w$,\s]+\)?\s*=>/.test(trimmed)) {
    return `(${trimmed})(${paramNames.join(', ')})`;
  }
  return trimmed;
}

declare const window: Window & {
  __VIGAME_POLICY_RESULT__?: RunPolicyResult | null;
  __VIGAME_POLICY_ABORT__?: boolean;
};

/**
 * Convert state_spec paths into direct JS property access lines.
 * e.g. "scene.playerScore" → `try { s['scene.playerScore'] = scene.playerScore; } catch(e) { s['scene.playerScore'] = undefined; }`
 *
 * This works because registered root names (scene, game, etc.) are injected
 * as function parameters when the script is executed.
 */
function buildStateReaders(stateSpec: string[]): string {
  return stateSpec
    .map((path) => {
      const key = JSON.stringify(path);
      return `    try { s[${key}] = ${path}; } catch(e) { s[${key}] = undefined; }`;
    })
    .join('\n');
}

/**
 * Build a self-contained IIFE that hooks into requestAnimationFrame,
 * runs the policy at native game speed, and stores results on a global.
 */
function buildPolicyScript(
  args: RunPolicyArgs,
  invalidPaths: string[],
  rootNamesList: string[],
): string {
  const duration = args.duration_ms;
  const logInterval = args.log_interval_ms ?? 500;
  const tapMode = args.input_mode === 'tap';
  const tapDuration = args.tap_duration_ms ?? 50;
  const warnFrames = args.stale_warn_frames ?? 60;
  const abortFrames = args.stale_abort_frames ?? 300;
  const stateReaders = buildStateReaders(args.state_spec);
  const actionsJson = JSON.stringify(args.actions);
  const keyCodes = JSON.stringify(SPECIAL_KEY_CODES);
  const codesToCode = JSON.stringify(SPECIAL_KEY_CODES_TO_CODE);
  const invalidPathsJson = JSON.stringify(invalidPaths);
  const rootNamesJson = JSON.stringify(rootNamesList);

  // Wrap policy/reward/done as function expressions
  // They may be arrow functions "(state) => ..." or statement blocks "if (...) return ..."
  const policyCode = wrapIfArrowFunction(args.policy, ['state']);
  const rewardCode = wrapIfArrowFunction(args.reward, ['state', 'prev']);
  const doneCode = args.done_condition ? wrapIfArrowFunction(args.done_condition, ['state']) : '';

  return `(function() {
  var DURATION = ${duration};
  var LOG_INTERVAL = ${logInterval};
  var TAP_MODE = ${tapMode};
  var TAP_DURATION = ${tapDuration};
  var STALE_WARN = ${warnFrames};
  var STALE_ABORT = ${abortFrames};
  var LOG_STATE_CHANGES = ${args.log_state_changes !== false};
  var INVALID_PATHS = ${invalidPathsJson};
  var ROOT_NAMES = ${rootNamesJson};
  var ACTIONS = ${actionsJson};

  // --- Key dispatch (serialized from input-simulator.ts) ---
  var SKC = ${keyCodes};
  var SCC = ${codesToCode};

  function resolveKeyCode(key) {
    if (key.length === 1) return key.toUpperCase().charCodeAt(0);
    return SKC[key] || 0;
  }
  function resolveCode(key) {
    if (key.length === 1) {
      var ch = key.toUpperCase();
      if (ch >= '0' && ch <= '9') return 'Digit' + ch;
      return 'Key' + ch;
    }
    return SCC[key] || key;
  }
  function dispatchKey(type, key) {
    var kc = resolveKeyCode(key);
    var evt = new KeyboardEvent(type, {
      key: key === 'Space' ? ' ' : key,
      code: resolveCode(key),
      keyCode: kc, which: kc,
      bubbles: true, cancelable: true
    });
    var canvas = document.querySelector('canvas');
    if (canvas) canvas.dispatchEvent(evt);
    document.dispatchEvent(evt);
    window.dispatchEvent(evt);
  }

  // --- State reading (direct property access) ---
  function readState() {
    var s = {};
${stateReaders}
    return s;
  }

  // --- Policy / reward / done ---
  var policyFn;
  try { policyFn = new Function('state', 'return (' + ${JSON.stringify(policyCode)} + ')'); } catch(e) {
    try { policyFn = new Function('state', ${JSON.stringify(policyCode)}); } catch(e2) {
      policyFn = function() { return ''; };
    }
  }
  var rewardFn;
  try { rewardFn = new Function('state', 'prev', 'return (' + ${JSON.stringify(rewardCode)} + ')'); } catch(e) {
    try { rewardFn = new Function('state', 'prev', ${JSON.stringify(rewardCode)}); } catch(e2) {
      rewardFn = function() { return 0; };
    }
  }
  var doneFn = null;
  ${
    doneCode
      ? `try { doneFn = new Function('state', 'return (' + ${JSON.stringify(doneCode)} + ')'); } catch(e) {
    try { doneFn = new Function('state', ${JSON.stringify(doneCode)}); } catch(e2) { doneFn = null; }
  }`
      : ''
  }

  // --- Tracking state ---
  var episodeLog = [];
  var rewardCurve = [];
  var events = [];
  var errors = [];
  var actionCounts = {};
  var unknownActions = {};
  var firstFrameState = null;
  var firstPolicyReturnType = null;

  // --- Compile-time validation (after errors array is declared) ---
  (function validatePolicy() {
    try {
      var testState = {};
      var stateSpec = ${JSON.stringify(args.state_spec)};
      for (var i = 0; i < stateSpec.length; i++) testState[stateSpec[i]] = 0;
      var testResult = policyFn(testState);
      if (typeof testResult !== 'string') {
        errors.push('POLICY VALIDATION: policy returned ' + typeof testResult + ' (' + String(testResult).substring(0, 100) + ') instead of action name string. If you passed an arrow function like (s) => ..., the auto-wrapper may have failed — try using state[...] expressions directly.');
      }
    } catch(e) {
      errors.push('POLICY VALIDATION: first-call error: ' + (e.message || e));
    }
  })();
  var totalReward = 0;
  var framesExecuted = 0;
  var prevAction = '';
  var prevState = {};
  var staleFrames = 0;
  var staleWarned = false;
  var heldKeys = [];
  var start = Date.now();
  var lastLogTime = start;
  var lastRewardCurveTime = start;
  var rafId = null;
  var stateChangeLog = [];
  var dynamicKeys = {};
  var hashRing = [];
  var loopWarned = false;

  // --- Background tab warning ---
  var bgWarned = false;
  var onVisChange = function() {
    if (document.hidden && !bgWarned) {
      events.push('t=' + (Date.now() - start) + 'ms: WARNING — tab is in background, RAF throttled to ~1fps. Keep tab in foreground for accurate policy execution.');
      bgWarned = true;
    }
  };
  document.addEventListener('visibilitychange', onVisChange);

  function cleanup(reason) {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener('visibilitychange', onVisChange);
    for (var i = 0; i < heldKeys.length; i++) {
      try { dispatchKey('keyup', heldKeys[i]); } catch(e) {}
    }
    heldKeys = [];
    var finalState = readState();
    window.__VIGAME_POLICY_RESULT__ = {
      total_reward: totalReward,
      frames_executed: framesExecuted,
      elapsed_ms: Date.now() - start,
      final_state: finalState,
      action_counts: actionCounts,
      reward_curve: rewardCurve,
      episode_log: episodeLog,
      state_change_log: stateChangeLog,
      events: events,
      errors: errors,
      diagnostics: {
        unresolved_paths: (function() {
          var up = [];
          var fs = firstFrameState || {};
          for (var k in fs) { if (fs[k] === undefined) up.push(k); }
          return up;
        })(),
        available_roots: ROOT_NAMES,
        policy_return_type: firstPolicyReturnType || 'unknown'
      }
    };
    try { window.dispatchEvent(new CustomEvent('vigame:policy-done')); } catch(e) {}
  }

  function tick() {
    // Abort signal from bridge
    if (window.__VIGAME_POLICY_ABORT__) { cleanup('abort'); return; }

    var now = Date.now();
    var elapsed = now - start;
    if (elapsed >= DURATION) { cleanup('duration'); return; }

    var state = readState();

    // First-frame diagnostics
    if (framesExecuted === 0) {
      firstFrameState = Object.assign({}, state);
      var undefinedPaths = [];
      for (var k in state) { if (state[k] === undefined) undefinedPaths.push(k); }
      if (undefinedPaths.length > 0) {
        events.push('DIAGNOSTIC: state_spec paths resolved to undefined on first frame: ' + undefinedPaths.join(', ') + ' — available roots: ' + ROOT_NAMES.join(', '));
      }
    }

    // Stale detection — only check dynamic keys (keys that have ever changed)
    if (framesExecuted > 0) {
      for (var k in state) { if (state[k] !== prevState[k]) dynamicKeys[k] = true; }
      var hasDynamic = false;
      for (var dk in dynamicKeys) { hasDynamic = true; break; }
      var same = true;
      if (hasDynamic) {
        for (var dk in dynamicKeys) { if (state[dk] !== prevState[dk]) { same = false; break; } }
      } else {
        for (var k in prevState) { if (state[k] !== prevState[k]) { same = false; break; } }
      }
      if (same) {
        staleFrames++;
        if (staleFrames === STALE_WARN && !staleWarned) {
          events.push('t=' + elapsed + 'ms frame=' + framesExecuted + ': WARNING — state unchanged for ' + STALE_WARN + ' frames');
          staleWarned = true;
        }
        if (STALE_ABORT > 0 && staleFrames >= STALE_ABORT) {
          events.push('t=' + elapsed + 'ms frame=' + framesExecuted + ': ABORTED — state unchanged for ' + STALE_ABORT + ' frames');
          cleanup('stale'); return;
        }
      } else { staleFrames = 0; }

      // Oscillation detection via hash ring
      var hashVal = 0;
      for (var k in state) { var v = state[k]; if (typeof v === 'number') hashVal += (v | 0); }
      hashRing.push(hashVal);
      if (hashRing.length > 30) hashRing.shift();
      if (!loopWarned && hashRing.length === 30) {
        var counts = {};
        for (var i = 0; i < hashRing.length; i++) {
          var h = hashRing[i];
          counts[h] = (counts[h] || 0) + 1;
          if (counts[h] > 8) {
            events.push('t=' + elapsed + 'ms frame=' + framesExecuted + ': WARNING — oscillation loop detected in state values');
            loopWarned = true;
            break;
          }
        }
      }
    }

    // Policy
    var action = '';
    try {
      var result = policyFn(state);
      if (firstPolicyReturnType === null) firstPolicyReturnType = typeof result;
      action = typeof result === 'string' ? result : '';
    } catch(e) {
      errors.push('policy error at frame ' + framesExecuted + ': ' + (e.message || e));
    }

    if (action !== '' && !ACTIONS[action] && !unknownActions[action]) {
      unknownActions[action] = true;
      errors.push('UNKNOWN ACTION "' + action + '" at frame ' + framesExecuted + '. Valid actions: ' + Object.keys(ACTIONS).join(', '));
    }

    var actionKeys = (action !== '' && ACTIONS[action]) ? action : '';

    // Input dispatch
    if (TAP_MODE) {
      var keys = actionKeys !== '' ? (ACTIONS[actionKeys] || []) : [];
      for (var i = 0; i < keys.length; i++) {
        try { dispatchKey('keydown', keys[i]); } catch(e) {}
      }
      if (keys.length > 0) {
        (function(ks) {
          setTimeout(function() {
            for (var j = 0; j < ks.length; j++) {
              try { dispatchKey('keyup', ks[j]); } catch(e) {}
            }
          }, TAP_DURATION);
        })(keys.slice());
      }
      if (actionKeys !== prevAction) {
        events.push('t=' + elapsed + 'ms frame=' + framesExecuted + ': action ' + prevAction + ' -> ' + actionKeys);
        prevAction = actionKeys;
      }
    } else {
      // Hold mode
      if (actionKeys !== prevAction) {
        var oldKeys = prevAction !== '' ? (ACTIONS[prevAction] || []) : [];
        var newKeys = actionKeys !== '' ? (ACTIONS[actionKeys] || []) : [];
        for (var i = 0; i < oldKeys.length; i++) {
          if (newKeys.indexOf(oldKeys[i]) === -1) {
            try { dispatchKey('keyup', oldKeys[i]); } catch(e) {}
          }
        }
        for (var i = 0; i < newKeys.length; i++) {
          if (oldKeys.indexOf(newKeys[i]) === -1) {
            try { dispatchKey('keydown', newKeys[i]); } catch(e) {}
          }
        }
        heldKeys = newKeys.slice();
        events.push('t=' + elapsed + 'ms frame=' + framesExecuted + ': action ' + prevAction + ' -> ' + actionKeys);
        prevAction = actionKeys;
      }
    }

    // Reward
    var frameReward = 0;
    try {
      var r = rewardFn(state, prevState);
      frameReward = typeof r === 'number' ? r : 0;
    } catch(e) {
      errors.push('reward error at frame ' + framesExecuted + ': ' + (e.message || e));
    }
    totalReward += frameReward;

    if (action !== '') { actionCounts[action] = (actionCounts[action] || 0) + 1; }

    // State change logging
    if (LOG_STATE_CHANGES && framesExecuted > 0 && stateChangeLog.length < 500) {
      for (var k in state) {
        if (state[k] !== prevState[k]) {
          stateChangeLog.push({t: elapsed, frame: framesExecuted, path: k, old_value: prevState[k], new_value: state[k], action: action, reward: frameReward});
          if (stateChangeLog.length >= 500) break;
        }
      }
    }

    // Done condition
    if (doneFn !== null) {
      try {
        if (doneFn(state)) {
          events.push('t=' + elapsed + 'ms frame=' + framesExecuted + ': done_condition triggered');
          prevState = state; framesExecuted++;
          cleanup('done'); return;
        }
      } catch(e) {}
    }

    // Logging
    if (now - lastLogTime >= LOG_INTERVAL) {
      episodeLog.push({ t: elapsed, frame: framesExecuted, state: Object.assign({}, state), action: action, reward: frameReward, cumulative_reward: totalReward });
      lastLogTime = now;
    }
    if (now - lastRewardCurveTime >= 1000) {
      rewardCurve.push(totalReward);
      lastRewardCurveTime = now;
    }

    prevState = state;
    framesExecuted++;
    rafId = requestAnimationFrame(tick);
  }

  // Start
  window.__VIGAME_POLICY_RESULT__ = null;
  window.__VIGAME_POLICY_ABORT__ = false;
  rafId = requestAnimationFrame(tick);
})();`;
}

export async function runPolicy(
  args: RunPolicyArgs,
  registeredRoots: Map<string, unknown>,
  errorInterceptor: ErrorInterceptor,
): Promise<RunPolicyResult> {
  errorInterceptor.getAndClear();

  // Abort any existing policy run
  if (typeof window !== 'undefined') {
    window.__VIGAME_POLICY_ABORT__ = true;
    // Brief wait for cleanup
    await new Promise<void>((r) => setTimeout(r, 100));
    window.__VIGAME_POLICY_RESULT__ = null;
    window.__VIGAME_POLICY_ABORT__ = false;
  }

  // Build and inject the script
  const rootNames = [...registeredRoots.keys()];

  // Validate state_spec paths against registered roots
  const invalidPaths: string[] = [];
  for (const path of args.state_spec) {
    const firstSegment = path.split('.')[0];
    if (firstSegment !== undefined && !rootNames.includes(firstSegment)) {
      invalidPaths.push(path);
    }
  }

  const script = buildPolicyScript(args, invalidPaths, rootNames);
  const rootObj: Record<string, unknown> = {};
  for (const n of rootNames) rootObj[n] = registeredRoots.get(n);
  const preamble =
    rootNames.length > 0 ? `var {${rootNames.join(',')}} = __roots__;\n` : '';

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('__roots__', preamble + script);
    fn(rootObj);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      total_reward: 0,
      frames_executed: 0,
      elapsed_ms: 0,
      final_state: {},
      action_counts: {},
      reward_curve: [],
      episode_log: [],
      events: [],
      errors: [`Script injection failed: ${message}`],
    };
  }

  // Wait for completion via event + polling fallback
  return new Promise<RunPolicyResult>((resolve) => {
    let resolved = false;

    function collectResult(): RunPolicyResult | null {
      if (typeof window === 'undefined') return null;
      const result = window.__VIGAME_POLICY_RESULT__;
      if (result === null || result === undefined) return null;
      const capturedErrors = errorInterceptor.getAndClear();
      for (const e of capturedErrors) {
        result.errors.push(`[${e.type}] ${e.message}`);
      }
      window.__VIGAME_POLICY_RESULT__ = null;
      return result;
    }

    function finish(result: RunPolicyResult): void {
      if (resolved) return;
      resolved = true;
      clearInterval(pollId);
      clearTimeout(maxTimeout);
      window.removeEventListener('vigame:policy-done', onDone);
      resolve(result);
    }

    function onDone(): void {
      const result = collectResult();
      if (result) finish(result);
    }

    window.addEventListener('vigame:policy-done', onDone);

    // Polling fallback (in case event doesn't fire)
    const pollId = setInterval(() => {
      const result = collectResult();
      if (result) finish(result);
    }, 500);

    // Max timeout
    const maxTimeout = setTimeout(() => {
      if (resolved) return;
      if (typeof window !== 'undefined') {
        window.__VIGAME_POLICY_ABORT__ = true;
      }
      setTimeout(() => {
        const fallback = collectResult();
        finish(
          fallback ?? {
            total_reward: 0,
            frames_executed: 0,
            elapsed_ms: args.duration_ms,
            final_state: {},
            action_counts: {},
            reward_curve: [],
            episode_log: [],
            events: ['ABORTED: poll timeout'],
            errors: [],
          },
        );
      }, 200);
    }, args.duration_ms + 5000);
  });
}
