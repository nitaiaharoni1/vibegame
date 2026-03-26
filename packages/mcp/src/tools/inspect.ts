import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const InspectInputSchema = z.object({
  action: z.enum(['screenshot', 'world_state', 'schemas', 'systems']),
});

export type InspectResult = string | { type: 'image'; data: string; mimeType: string };

export async function inspectTool(input: z.infer<typeof InspectInputSchema>, bridge: GameBridge): Promise<InspectResult> {
  if (input.action === 'screenshot') {
    const dataUrl = await bridge.send<string>('inspect:screenshot', {});
    // Return as base64 image
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    return { type: 'image', data: base64, mimeType: 'image/png' };
  }
  const result = await bridge.send<unknown>('inspect', input);
  return JSON.stringify(result, null, 2);
}
