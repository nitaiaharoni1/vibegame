import { parseDataUrl } from '@vigame/protocol';
import type { BridgeServer } from '../bridge-server.js';

/** Raw screenshot response from the bridge runtime */
interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Take a single screenshot of the running game.
 * Returns an MCP image content block (base64).
 */
export async function screenshot(
  bridge: BridgeServer,
  args: { quality?: number; maxWidth?: number; maxHeight?: number },
): Promise<{ type: 'image'; data: string; mimeType: string }> {
  const sendArgs: Record<string, unknown> = {};
  if (args.quality !== undefined) sendArgs.quality = args.quality;
  if (args.maxWidth !== undefined) sendArgs.maxWidth = args.maxWidth;
  if (args.maxHeight !== undefined) sendArgs.maxHeight = args.maxHeight;
  const result = (await bridge.send('screenshot', sendArgs)) as ScreenshotResult;

  const parsed = parseDataUrl(result.dataUrl);
  if (!parsed) {
    throw new Error('Screenshot returned invalid data URL');
  }
  return { type: 'image', data: parsed.base64, mimeType: parsed.mimeType };
}

export interface WatchFrame {
  timestamp: number;
  elapsed: number;
  image: { type: 'image'; data: string; mimeType: string };
}

/**
 * Watch the game by taking periodic screenshots over a time window.
 * Returns an array of frames with timestamps and base64 image data.
 */
export async function watch(
  bridge: BridgeServer,
  args: {
    seconds: number;
    interval?: number;
    diffThreshold?: number;
    maxWidth?: number;
    maxHeight?: number;
  },
): Promise<WatchFrame[]> {
  const sendArgs: Record<string, unknown> = {
    seconds: args.seconds,
    intervalMs: args.interval ?? 1000,
  };
  if (args.diffThreshold !== undefined) sendArgs.diffThreshold = args.diffThreshold;
  if (args.maxWidth !== undefined) sendArgs.maxWidth = args.maxWidth;
  if (args.maxHeight !== undefined) sendArgs.maxHeight = args.maxHeight;

  const timeoutMs = args.seconds * 1000 + 10000;
  const result = (await bridge.send('watch', sendArgs, timeoutMs)) as {
    frames: Array<{
      timestamp: number;
      elapsed: number;
      dataUrl: string;
      width: number;
      height: number;
    }>;
  };

  return result.frames.map((f) => {
    const parsed = parseDataUrl(f.dataUrl);
    if (!parsed) {
      throw new Error('Watch frame returned invalid data URL');
    }
    return {
      timestamp: f.timestamp,
      elapsed: f.elapsed,
      image: { type: 'image' as const, data: parsed.base64, mimeType: parsed.mimeType },
    };
  });
}

/**
 * Take an annotated debug screenshot with overlay: bounding boxes, labels, optional grid.
 */
export async function debug_screenshot(
  bridge: BridgeServer,
  args: { boundingBoxes?: boolean; properties?: string[]; grid?: boolean; quality?: number },
): Promise<{ type: 'image'; data: string; mimeType: string }> {
  const sendArgs: Record<string, unknown> = {};
  if (args.boundingBoxes !== undefined) sendArgs.boundingBoxes = args.boundingBoxes;
  if (args.properties !== undefined) sendArgs.properties = args.properties;
  if (args.grid !== undefined) sendArgs.grid = args.grid;
  if (args.quality !== undefined) sendArgs.quality = args.quality;

  const result = (await bridge.send('debug_screenshot', sendArgs)) as ScreenshotResult;
  const parsed = parseDataUrl(result.dataUrl);
  if (!parsed) {
    throw new Error('Debug screenshot returned invalid data URL');
  }
  return { type: 'image', data: parsed.base64, mimeType: parsed.mimeType };
}

/** Tool definitions for registration */
export const visualToolDefs = [
  {
    name: 'screenshot',
    description:
      'Take a screenshot of the currently running game. Returns a WebP image (falls back to JPEG). Use maxWidth/maxHeight to downscale for smaller context usage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        quality: {
          type: 'number',
          description: 'Image quality from 0 to 1 (default 0.85)',
          minimum: 0,
          maximum: 1,
        },
        maxWidth: {
          type: 'number',
          description: 'Downscale to this max width in pixels (preserves aspect ratio)',
          minimum: 64,
        },
        maxHeight: {
          type: 'number',
          description: 'Downscale to this max height in pixels (preserves aspect ratio)',
          minimum: 64,
        },
      },
    },
  },
  {
    name: 'watch',
    description:
      'Watch the game by capturing screenshots at a regular interval for a set number of seconds. Useful for observing gameplay or animations over time.',
    inputSchema: {
      type: 'object' as const,
      required: ['seconds'],
      properties: {
        seconds: {
          type: 'number',
          description: 'How long to watch (in seconds)',
          minimum: 1,
        },
        interval: {
          type: 'number',
          description: 'Milliseconds between screenshots (default 1000)',
          minimum: 100,
        },
        diffThreshold: {
          type: 'number',
          description:
            'Skip frames where less than this fraction of pixels changed (0–1, default 0.05). Reduces context usage on static screens.',
          minimum: 0,
          maximum: 1,
        },
        maxWidth: {
          type: 'number',
          description: 'Downscale frames to this max width in pixels',
          minimum: 64,
        },
        maxHeight: {
          type: 'number',
          description: 'Downscale frames to this max height in pixels',
          minimum: 64,
        },
      },
    },
  },
  {
    name: 'debug_screenshot',
    description:
      'Take an annotated screenshot with debug overlays drawn on top of the game view: labeled bounding boxes around scene objects, optional coordinate grid, and property value labels. Combines screenshot + scene_graph understanding into one image.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        boundingBoxes: {
          type: 'boolean',
          description: 'Draw labeled bounding boxes around scene objects (default true)',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property names to show as labels on objects (e.g. ["position", "health"])',
        },
        grid: {
          type: 'boolean',
          description: 'Draw a coordinate grid overlay',
        },
        quality: {
          type: 'number',
          description: 'Image quality from 0 to 1 (default 0.9)',
          minimum: 0,
          maximum: 1,
        },
      },
    },
  },
] as const;
