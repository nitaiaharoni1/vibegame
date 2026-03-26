import type { BridgeServer } from '../bridge-server.js';

export interface PerfSnapshot {
  fps: number;
  memoryMB?: number;
  drawCalls?: number;
  timestamp: number;
}

/**
 * Request a performance snapshot from the running game.
 * The bridge runtime is expected to collect renderer stats and return them.
 */
export async function perf_snapshot(bridge: BridgeServer): Promise<PerfSnapshot> {
  const raw = (await bridge.send('perf', {})) as Omit<PerfSnapshot, 'timestamp'>;
  return { ...raw, timestamp: Date.now() };
}

/** Tool definitions for registration */
export const perfToolDefs = [
  {
    name: 'perf_snapshot',
    description:
      'Retrieve a performance snapshot from the running game: FPS, memory usage (MB), and renderer draw call count.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
] as const;
