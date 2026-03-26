import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const RuntimeInputSchema = z.object({
  action: z.enum(['play', 'pause', 'step', 'stop', 'reset']),
});

export async function runtimeTool(input: z.infer<typeof RuntimeInputSchema>, bridge: GameBridge): Promise<string> {
  await bridge.send('runtime', input);
  return `Runtime action "${input.action}" executed`;
}
