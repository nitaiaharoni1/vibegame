import type {
  ControlMapping,
  DiscoverControlsArgs,
  DiscoverControlsResult,
} from '@vigame/protocol';
import { simulateInputSequence } from './input-simulator.js';
import { inspectPath, mutatePath } from './mutator.js';

const DEFAULT_KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'w',
  'a',
  's',
  'd',
  'Space',
  'Enter',
];

/** Candidate sub-paths to probe on each registered root. */
const POSITION_SUB_PATHS = ['position.x', 'position.y', 'position.z', 'x', 'y'];

/** Top-level property names that are matrix-related and should be skipped. */
const MATRIX_PROP_PATTERN = /^(matrix|matrixWorld|modelViewMatrix|normalMatrix)/i;

/** Keys that lead to engine internals — never recurse into these. */
const WALK_SKIP_KEYS = new Set([
  'scene',
  'parentContainer',
  'renderFlags',
  'cameraFilter',
  'game',
  'sys',
  'anims',
  'input',
  'events',
  'cache',
  'textures',
  'sound',
  'plugins',
]);

let cachedResult: DiscoverControlsResult | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PrimitiveValue = number | boolean | string;

/**
 * Recursively walk an object tree, collecting primitive properties into `snapshot`.
 * Uses direct property access (not inspectPath) for performance.
 */
function walkPrimitiveProps(
  path: string,
  obj: unknown,
  depth: number,
  budget: { count: number },
  snapshot: Record<string, PrimitiveValue>,
): void {
  if (depth <= 0 || budget.count >= 200) return;
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (budget.count >= 200) return;
    if (key.startsWith('_')) continue;
    if (MATRIX_PROP_PATTERN.test(key)) continue;
    if (WALK_SKIP_KEYS.has(key)) continue;

    try {
      const value = record[key];
      const fullPath = `${path}.${key}`;

      if (typeof value === 'number' && !Number.isNaN(value)) {
        snapshot[fullPath] = value;
        budget.count++;
      } else if (typeof value === 'boolean') {
        snapshot[fullPath] = value;
        budget.count++;
      } else if (typeof value === 'string' && value.length <= 50) {
        snapshot[fullPath] = value;
        budget.count++;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        walkPrimitiveProps(fullPath, value, depth - 1, budget, snapshot);
      }
    } catch {
      // Getter threw — skip
    }
  }
}

/**
 * Snapshot primitive properties from all registered roots.
 * Returns a flat dict like { "player.position.x": 100, "player.paused": false, ... }
 */
function snapshotProps(
  registeredRoots: Map<string, unknown>,
  depth: number = 3,
): Record<string, PrimitiveValue> {
  const snapshot: Record<string, PrimitiveValue> = {};

  const budget = { count: 0 };

  for (const [rootName, rootValue] of registeredRoots) {
    // Probe well-known position sub-paths (fast + targeted via inspectPath)
    for (const subPath of POSITION_SUB_PATHS) {
      const fullPath = `${rootName}.${subPath}`;
      try {
        const result = inspectPath(fullPath, registeredRoots);
        if (typeof result.value === 'number' && !Number.isNaN(result.value)) {
          snapshot[fullPath] = result.value;
        }
      } catch {
        // Path does not exist on this root — skip
      }
    }

    // Recursive walk for everything else
    walkPrimitiveProps(rootName, rootValue, depth, budget, snapshot);
  }

  return snapshot;
}

/**
 * Describe the set of nonzero deltas as a human-readable string.
 */
function describeDeltas(deltas: Record<string, PrimitiveValue>): string {
  const parts: string[] = [];
  for (const [path, delta] of Object.entries(deltas)) {
    if (typeof delta === 'number') {
      if (delta > 0) {
        parts.push(`${path} increases by ~${Math.round(delta)}`);
      } else {
        parts.push(`${path} decreases by ~${Math.round(Math.abs(delta))}`);
      }
    } else if (typeof delta === 'boolean') {
      parts.push(`${path} becomes ${delta}`);
    } else {
      parts.push(`${path} changes to "${delta}"`);
    }
  }
  if (parts.length === 0) return 'no observable effect';
  return parts.join('; ');
}

/**
 * Determine which registered root had the most changed properties.
 * Returns the root name, or null if no changes were observed.
 */
function dominantTarget(
  deltas: Record<string, PrimitiveValue>,
  registeredRoots: Map<string, unknown>,
): string | null {
  const counts = new Map<string, number>();

  for (const path of Object.keys(deltas)) {
    // The first segment of the path is the root name
    const dot = path.indexOf('.');
    const rootName = dot === -1 ? path : path.slice(0, dot);
    if (registeredRoots.has(rootName)) {
      counts.set(rootName, (counts.get(rootName) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }
  return best;
}

/**
 * Systematically test each common input key, observe which game properties
 * change, and return a structured control map.
 */
export async function discoverControls(
  args: DiscoverControlsArgs,
  registeredRoots: Map<string, unknown>,
): Promise<DiscoverControlsResult> {
  if (cachedResult !== null && args.rescan !== true) {
    return { ...cachedResult, cached: true };
  }

  // Fail fast if tab is in background — RAF-driven games won't update
  if (typeof document !== 'undefined' && document.hidden) {
    return {
      controls: [],
      summary:
        'FAILED: Browser tab is in the background. Game loop is throttled and controls cannot be detected. ' +
        'Please bring the game tab to the foreground and retry with rescan:true.',
      cached: false,
      warning: 'background_tab',
    };
  }

  const keysToTest = [...DEFAULT_KEYS, ...(args.extra_keys ?? [])];
  const controls: ControlMapping[] = [];

  for (const key of keysToTest) {
    // 1. Snapshot before
    const before = snapshotProps(registeredRoots, args.probe_depth ?? 3);

    // 2. Simulate keydown + keyup
    try {
      await simulateInputSequence([
        { type: 'keydown', key },
        { type: 'keyup', key },
      ]);
    } catch {
      // Input dispatch failure — still continue to observe
    }

    // 3. Wait for the game to react
    await delay(args.probe_delay_ms ?? 200);

    // 4. Snapshot after
    const after = snapshotProps(registeredRoots, args.probe_depth ?? 3);

    // 5. Compute significant deltas
    const significantDeltas: Record<string, PrimitiveValue> = {};
    const rawDeltas: Record<string, unknown> = {};

    for (const [path, beforeVal] of Object.entries(before)) {
      const afterVal = after[path];
      if (afterVal === undefined) continue;

      if (typeof beforeVal === 'number' && typeof afterVal === 'number') {
        const delta = afterVal - beforeVal;
        if (Math.abs(delta) > 0.1) {
          significantDeltas[path] = delta;
          rawDeltas[path] = delta;
        }
      } else if (beforeVal !== afterVal) {
        // Boolean or string changed
        significantDeltas[path] = afterVal;
        rawDeltas[path] = { from: beforeVal, to: afterVal };
      }
    }

    // 6. Restore changed values
    for (const [path, beforeVal] of Object.entries(before)) {
      if (path in significantDeltas) {
        try {
          mutatePath(path, beforeVal, registeredRoots);
        } catch {
          // Best-effort restore — ignore failures
        }
      }
    }

    // 7. Build the control mapping
    const effect = describeDeltas(significantDeltas);
    const target = dominantTarget(significantDeltas, registeredRoots);

    controls.push({ input: key, effect, target, deltas: rawDeltas });

    // Abort early if tab went to background during scanning
    if (
      controls.length >= 3 &&
      controls.every((c) => c.effect === 'no observable effect') &&
      typeof document !== 'undefined' &&
      document.hidden
    ) {
      return {
        controls,
        summary:
          'ABORTED: Tab went to background during discovery. Results are unreliable. ' +
          'Bring the tab to the foreground and call with rescan:true.',
        cached: false,
        warning: 'background_tab',
      };
    }
  }

  // Build summary
  const effectiveControls = controls.filter((c) => c.effect !== 'no observable effect');
  let summary: string;
  if (effectiveControls.length === 0) {
    summary = 'No keyboard inputs produced observable property changes.';
  } else {
    const descriptions = effectiveControls.map((c) => `${c.input}: ${c.effect}`);
    summary = `Discovered ${effectiveControls.length} effective control(s): ${descriptions.join('. ')}.`;
  }

  const result: DiscoverControlsResult = { controls, summary, cached: false };
  cachedResult = result;
  return result;
}
