import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const TransformInputSchema = z.object({
  action: z.enum(['set_position', 'set_rotation', 'set_scale', 'look_at']),
  entityName: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
});

export async function transformTool(input: z.infer<typeof TransformInputSchema>, bridge: GameBridge): Promise<string> {
  const result = await bridge.send<unknown>('transform', input);
  return JSON.stringify(result, null, 2);
}
