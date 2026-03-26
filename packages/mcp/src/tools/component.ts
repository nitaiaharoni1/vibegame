import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const ComponentInputSchema = z.object({
  action: z.enum(['add', 'remove', 'set', 'get', 'list_available']),
  entityName: z.string().optional(),
  component: z.string().optional().describe('Component type name'),
  props: z.record(z.unknown()).optional().describe('Component properties'),
});

export async function componentTool(input: z.infer<typeof ComponentInputSchema>, bridge: GameBridge): Promise<string> {
  const result = await bridge.send<unknown>('component', input);
  return JSON.stringify(result, null, 2);
}
