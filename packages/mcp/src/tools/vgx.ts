import { z } from 'zod';
import { parseVGX } from '@vigame/scene';
import type { GameBridge } from '../bridge.js';

export const VgxInputSchema = z.object({
  action: z.enum(['parse', 'serialize', 'validate', 'patch']),
  vgx: z.string().optional(),
  patch: z.string().optional().describe('VGX patch to apply to running scene'),
});

export async function vgxTool(input: z.infer<typeof VgxInputSchema>, bridge: GameBridge): Promise<string> {
  switch (input.action) {
    case 'parse': {
      if (!input.vgx) throw new Error('vgx required');
      const world = parseVGX(input.vgx);
      return JSON.stringify(world, null, 2);
    }
    case 'validate': {
      if (!input.vgx) throw new Error('vgx required');
      try {
        parseVGX(input.vgx);
        return 'Valid VGX';
      } catch (e) {
        return `Invalid VGX: ${(e as Error).message}`;
      }
    }
    case 'serialize': {
      // Get current scene from bridge and serialize
      const vgx = await bridge.send<string>('scene:save', {});
      return vgx;
    }
    case 'patch': {
      if (!input.patch) throw new Error('patch required');
      await bridge.send('scene:patch', { vgx: input.patch });
      return 'Patch applied';
    }
  }
}
