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

let cachedResult: DiscoverControlsResult | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Snapshot numeric properties from all registered roots.
 * Returns a flat dict like { "player.position.x": 100, "player.y": 42, ... }
 */
function snapshotNumericProps(registeredRoots: Map<string, unknown>): Record<string, number> {
  const snapshot: Record<string, number> = {};

  for (const [rootName, rootValue] of registeredRoots) {
    // Probe well-known position sub-paths
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

    // Probe top-level numeric properties on the root object
    if (typeof rootValue === 'object' && rootValue !== null) {
      const obj = rootValue as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        // Skip matrix-related and already-covered sub-path bases
        if (MATRIX_PROP_PATTERN.test(key)) continue;
        if (key === 'position') continue;

        const fullPath = `${rootName}.${key}`;
        try {
          const result = inspectPath(fullPath, registeredRoots);
          if (typeof result.value === 'number' && !Number.isNaN(result.value)) {
            snapshot[fullPath] = result.value;
          }
        } catch {
          // Not accessible via inspectPath — skip
        }
      }
    }
  }

  return snapshot;
}

/**
 * Describe the set of nonzero deltas as a human-readable string.
 */
function describeDeltas(deltas: Record<string, number>): string {
  const parts: string[] = [];
  for (const [path, delta] of Object.entries(deltas)) {
    if (delta > 0) {
      parts.push(`${path} increases by ~${Math.round(delta)}`);
    } else {
      parts.push(`${path} decreases by ~${Math.round(Math.abs(delta))}`);
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
  deltas: Record<string, number>,
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

  const keysToTest = [...DEFAULT_KEYS, ...(args.extra_keys ?? [])];
  const controls: ControlMapping[] = [];

  for (const key of keysToTest) {
    // 1. Snapshot before
    const before = snapshotNumericProps(registeredRoots);

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
    await delay(200);

    // 4. Snapshot after
    const after = snapshotNumericProps(registeredRoots);

    // 5. Compute significant deltas
    const significantDeltas: Record<string, number> = {};
    const rawDeltas: Record<string, unknown> = {};

    for (const [path, beforeVal] of Object.entries(before)) {
      const afterVal = after[path];
      if (afterVal === undefined) continue;
      const delta = afterVal - beforeVal;
      if (Math.abs(delta) > 0.1) {
        significantDeltas[path] = delta;
        rawDeltas[path] = delta;
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
