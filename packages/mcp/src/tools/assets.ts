import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PlaceholderAssetResult {
  dataUrl: string;
  width: number;
  height: number;
  format: 'svg';
}

/**
 * Generate an SVG placeholder asset as a data URL.
 * No canvas or native dependencies required.
 */
export function placeholder_asset(args: {
  type: 'texture' | 'sprite';
  width: number;
  height: number;
  color?: string;
  label?: string;
}): PlaceholderAssetResult {
  const { width, height } = args;
  const color = args.color ?? '#cc66ff';
  const label = args.label ?? args.type;

  // Checkerboard pattern for textures, solid fill for sprites
  const isTexture = args.type === 'texture';
  const checkerSize = Math.max(Math.floor(Math.min(width, height) / 8), 4);

  const patternDef = isTexture
    ? `
  <defs>
    <pattern id="checker" x="0" y="0" width="${checkerSize * 2}" height="${checkerSize * 2}" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="${checkerSize}" height="${checkerSize}" fill="${color}" opacity="0.8"/>
      <rect x="${checkerSize}" y="${checkerSize}" width="${checkerSize}" height="${checkerSize}" fill="${color}" opacity="0.8"/>
      <rect x="${checkerSize}" y="0" width="${checkerSize}" height="${checkerSize}" fill="${color}" opacity="0.4"/>
      <rect x="0" y="${checkerSize}" width="${checkerSize}" height="${checkerSize}" fill="${color}" opacity="0.4"/>
    </pattern>
  </defs>`
    : '';

  const background = isTexture
    ? `<rect width="${width}" height="${height}" fill="url(#checker)"/>`
    : `<rect width="${width}" height="${height}" fill="${color}" opacity="0.85"/>`;

  const fontSize = Math.max(10, Math.min(20, Math.floor(Math.min(width, height) / 5)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${patternDef}
  ${background}
  <rect width="${width}" height="${height}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5"/>
  <text x="${width / 2}" y="${height / 2 + fontSize / 3}" font-family="monospace" font-size="${fontSize}" fill="#ffffff" text-anchor="middle" opacity="0.9">${escapeXml(label)}</text>
  <text x="${width / 2}" y="${height / 2 + fontSize * 1.5}" font-family="monospace" font-size="${Math.max(8, fontSize - 4)}" fill="#ffffff" text-anchor="middle" opacity="0.6">${width}x${height}</text>
</svg>`;

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { dataUrl, width, height, format: 'svg' };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface AssetEntry {
  path: string;
  type: string;
  size: number;
  isPlaceholder: boolean;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a']);
const MODEL_EXTS = new Set(['.glb', '.gltf', '.fbx', '.obj']);
const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function detectType(ext: string): string {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (MODEL_EXTS.has(ext)) return 'model';
  if (FONT_EXTS.has(ext)) return 'font';
  return 'other';
}

function scanDir(dir: string, projectDir: string, results: AssetEntry[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // Skip symlinks to prevent infinite loops on cyclic symlink structures
      continue;
    }
    if (entry.isDirectory()) {
      scanDir(full, projectDir, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const type = detectType(ext);
      if (type === 'other' && ext !== '.placeholder') continue;
      const stat = fs.statSync(full);
      const isPlaceholder =
        entry.name.endsWith('.placeholder') || entry.name.includes('.placeholder.');
      results.push({
        path: path.relative(projectDir, full),
        type,
        size: stat.size,
        isPlaceholder,
      });
    }
  }
}

/**
 * Scan common asset directories in a project and return a manifest of found files.
 */
export function asset_manifest(args: { projectDir?: string }): {
  assets: AssetEntry[];
} {
  const projectDir = args.projectDir ?? process.cwd();
  const searchDirs = ['assets', 'public', 'src/assets', 'static'].map((d) =>
    path.join(projectDir, d),
  );

  const results: AssetEntry[] = [];
  for (const dir of searchDirs) {
    scanDir(dir, projectDir, results);
  }

  return { assets: results };
}

/** Tool definitions for registration */
export const assetToolDefs = [
  {
    name: 'placeholder_asset',
    description:
      'Generate a placeholder texture or sprite as an SVG data URL. No canvas dependency required. Useful for mocking assets before real art is available.',
    inputSchema: {
      type: 'object' as const,
      required: ['type', 'width', 'height'],
      properties: {
        type: {
          type: 'string',
          enum: ['texture', 'sprite'],
          description: 'Whether to generate a checkerboard texture or a solid sprite',
        },
        width: { type: 'number', description: 'Width in pixels', minimum: 1 },
        height: { type: 'number', description: 'Height in pixels', minimum: 1 },
        color: { type: 'string', description: 'Hex or CSS color (default #cc66ff)' },
        label: { type: 'string', description: 'Text label overlaid on the asset' },
      },
    },
  },
  {
    name: 'asset_manifest',
    description:
      'Scan the project for asset files (images, audio, models, fonts) in common locations and return a manifest.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectDir: {
          type: 'string',
          description: 'Project root directory (default: current working directory)',
        },
      },
    },
  },
] as const;
