import { z } from 'zod';
import type { GameBridge } from '../bridge.js';

export const SceneInputSchema = z.object({
  action: z.enum(['load', 'save', 'clear', 'info']),
  vgx: z.string().optional().describe('VGX XML content (for load action)'),
});

export async function sceneTool(input: z.infer<typeof SceneInputSchema>, bridge: GameBridge): Promise<string> {
  switch (input.action) {
    case 'load': {
      if (!input.vgx) throw new Error('vgx is required for load action');
      await bridge.send('scene:load', { vgx: input.vgx });
      return 'Scene loaded successfully';
    }
    case 'save': {
      const vgx = await bridge.send<string>('scene:save', {});
      return vgx;
    }
    case 'clear': {
      await bridge.send('scene:clear', {});
      return 'Scene cleared';
    }
    case 'info': {
      const info = await bridge.send<{ entityCount: number; renderer: string }>('scene:info', {});
      return JSON.stringify(info, null, 2);
    }
  }
}
