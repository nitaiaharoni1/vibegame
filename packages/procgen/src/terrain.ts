import { SimplexNoise } from './noise.js';

export interface HeightmapOptions {
  width: number;
  height: number;
  scale?: number;       // noise scale, higher = more zoomed in
  octaves?: number;
  lacunarity?: number;
  gain?: number;
  seed?: number;
  heightMultiplier?: number;
}

export interface Heightmap {
  width: number;
  height: number;
  data: Float32Array; // row-major, values in [-1, 1]
}

export function generateHeightmap(opts: HeightmapOptions): Heightmap {
  const { width, height, scale = 50, octaves = 4, lacunarity = 2, gain = 0.5, seed = 0, heightMultiplier = 1 } = opts;
  const noise = new SimplexNoise(seed);
  const data = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / scale;
      const ny = y / scale;
      data[y * width + x] = noise.fbm(nx, ny, octaves, lacunarity, gain) * heightMultiplier;
    }
  }

  return { width, height, data };
}

export function getHeight(hm: Heightmap, x: number, y: number): number {
  const xi = Math.max(0, Math.min(hm.width - 1, Math.floor(x)));
  const yi = Math.max(0, Math.min(hm.height - 1, Math.floor(y)));
  return hm.data[yi * hm.width + xi] ?? 0;
}
