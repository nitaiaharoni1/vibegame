import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const QueryInputSchema = z.object({
  by: z.enum(['component', 'tag', 'name', 'all']),
  value: z.string().optional().describe('Component name, tag, or entity name to filter by'),
});

export async function queryTool(input: z.infer<typeof QueryInputSchema>, bridge: GameBridge): Promise<string> {
  const result = await bridge.send<unknown>('query', input);
  return JSON.stringify(result, null, 2);
}
