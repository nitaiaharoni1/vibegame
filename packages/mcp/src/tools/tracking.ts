import type { TrackArgsWire, TrackResultWire } from '@vigame/protocol';
import type { BridgeServer } from '../bridge-server.js';
import { TIMED_INPUT_EVENT_ITEM_SCHEMA } from './schema/input-event.js';

export type TrackArgs = TrackArgsWire;
export type TrackResult = TrackResultWire;

export async function track(bridge: BridgeServer, args: TrackArgs): Promise<TrackResult> {
  const timeoutMs = args.duration_ms + 10000;
  return (await bridge.send(
    'track',
    args as unknown as Record<string, unknown>,
    timeoutMs,
  )) as TrackResult;
}

export const trackingToolDefs = [
  {
    name: 'track',
    description:
      'Track object properties over time and compute velocity/trajectory stats. Returns raw samples + computed analytics. Useful for tuning jump arcs, ball speed, camera smoothing without repeated screenshot cycles.',
    inputSchema: {
      type: 'object' as const,
      required: ['paths', 'duration_ms'],
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property paths to sample (e.g. ["player.position", "ball.velocity"])',
        },
        duration_ms: {
          type: 'number',
          description: 'Tracking duration in ms (100-60000)',
          minimum: 100,
          maximum: 60000,
        },
        sample_rate: {
          type: 'number',
          description: 'Samples per second (default 60, max 120)',
          minimum: 1,
          maximum: 120,
        },
        inputs: {
          type: 'array',
          description: 'Timed input events to fire during tracking',
          items: TIMED_INPUT_EVENT_ITEM_SCHEMA,
        },
      },
    },
  },
] as const;
