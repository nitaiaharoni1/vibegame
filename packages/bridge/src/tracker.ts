import type {
  TimedInputEventWire,
  TrackArgsWire,
  TrackResultWire,
  TrackSampleWire,
  TrackStatsWire,
} from '@vigame/protocol';
import { inspectPath } from './mutator.js';

export type TimedInputEvent = TimedInputEventWire;
export type TrackArgs = TrackArgsWire;
export type TrackSample = TrackSampleWire;
export type TrackStats = TrackStatsWire;
export type TrackResult = TrackResultWire;

function dispatchKey(type: string, key: string): void {
  document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
}

function dispatchMouse(
  type: string,
  x: number | undefined,
  y: number | undefined,
  button: number | undefined,
): void {
  document.dispatchEvent(
    new MouseEvent(type, {
      clientX: x ?? 0,
      clientY: y ?? 0,
      button: button ?? 0,
      bubbles: true,
    }),
  );
}

export async function trackObjects(
  args: TrackArgs,
  registeredRoots: Map<string, unknown>,
): Promise<TrackResult> {
  const intervalMs = Math.round(1000 / Math.min(args.sample_rate ?? 60, 120));
  const sortedInputs = [...(args.inputs ?? [])].sort((a, b) => a.at - b.at);

  const samples: TrackSample[] = [];
  const start = Date.now();
  let inputIdx = 0;
  let inputsFired = 0;

  while (true) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const elapsed = Date.now() - start;

    // Sample all paths
    const values: Record<string, unknown> = {};
    for (const path of args.paths) {
      values[path] = inspectPath(path, registeredRoots).value;
    }
    samples.push({ t: elapsed, values });

    // Fire any inputs whose at <= elapsed
    while (inputIdx < sortedInputs.length) {
      const evt = sortedInputs[inputIdx];
      if (evt === undefined || evt.at > elapsed) break;

      const evtType = evt.type;
      if (evtType === 'keydown' || evtType === 'keyup' || evtType === 'keypress') {
        dispatchKey(evtType, evt.key ?? '');
      } else {
        dispatchMouse(evtType, evt.x, evt.y, evt.button);
      }

      inputIdx++;
      inputsFired++;
    }

    if (elapsed >= args.duration_ms) break;
  }

  // Compute stats per path
  const stats: TrackStats[] = args.paths.map((path) => {
    const pathSamples = samples.map((s) => s.values[path]);
    const startVal = pathSamples[0];
    const endVal = pathSamples[pathSamples.length - 1];

    const stat: TrackStats = {
      path,
      samples: pathSamples.length,
      start: startVal,
      end: endVal,
    };

    if (typeof startVal === 'number' && typeof endVal === 'number') {
      stat.delta = endVal - startVal;
    }

    // Velocity from x,y,z objects
    if (pathSamples.length >= 2) {
      const velocities: number[] = [];

      for (let i = 0; i < pathSamples.length - 1; i++) {
        const a = pathSamples[i];
        const b = pathSamples[i + 1];
        const tA = samples[i]?.t;
        const tB = samples[i + 1]?.t;

        if (isXyz(a) && isXyz(b) && tA !== undefined && tB !== undefined) {
          const dt = (tB - tA) / 1000;
          if (dt > 0) {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dz = b.z - a.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            velocities.push(dist / dt);
          }
        }
      }

      if (velocities.length > 0) {
        const avg = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
        const max = Math.max(...velocities);
        stat.velocity = { avg, max };
      }
    }

    return stat;
  });

  return {
    samples,
    stats,
    duration_ms: Date.now() - start,
    inputs_fired: inputsFired,
  };
}

function isXyz(value: unknown): value is { x: number; y: number; z: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    'z' in value &&
    typeof (value as Record<string, unknown>).x === 'number' &&
    typeof (value as Record<string, unknown>).y === 'number' &&
    typeof (value as Record<string, unknown>).z === 'number'
  );
}
