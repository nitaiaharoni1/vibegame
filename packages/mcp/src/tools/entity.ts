import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const EntityInputSchema = z.object({
  action: z.enum(['create', 'delete', 'clone', 'find', 'list', 'rename']),
  name: z.string().optional().describe('Entity name'),
  newName: z.string().optional().describe('New name (for rename action)'),
  tags: z.array(z.string()).optional().describe('Tags for the new entity'),
});

export async function entityTool(input: z.infer<typeof EntityInputSchema>, bridge: GameBridge): Promise<string> {
  const result = await bridge.send<unknown>('entity', input);
  return JSON.stringify(result, null, 2);
}
