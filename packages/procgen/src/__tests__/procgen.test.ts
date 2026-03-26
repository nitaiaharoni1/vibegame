import { describe, it, expect } from 'vitest';
import { SimplexNoise } from '../noise.js';
import { generateHeightmap, getHeight } from '../terrain.js';
import { generateDungeon, dungeonToVGX } from '../dungeon.js';

describe('SimplexNoise', () => {
  it('noise2D returns values in [-1, 1] range', () => {
    const noise = new SimplexNoise(42);
    for (let i = 0; i < 100; i++) {
      const val = noise.noise2D(i * 0.1, i * 0.07);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('same seed produces same values', () => {
    const a = new SimplexNoise(123);
    const b = new SimplexNoise(123);
    expect(a.noise2D(1.5, 2.3)).toBe(b.noise2D(1.5, 2.3));
    expect(a.noise2D(99.1, 0.5)).toBe(b.noise2D(99.1, 0.5));
  });

  it('different seeds produce different values', () => {
    const a = new SimplexNoise(1);
    const b = new SimplexNoise(2);
    // At least some values should differ
    let differs = false;
    for (let i = 0; i < 10; i++) {
      if (a.noise2D(i, i) !== b.noise2D(i, i)) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('fbm returns values (smoke test)', () => {
    const noise = new SimplexNoise(0);
    const val = noise.fbm(0.5, 0.5, 4, 2, 0.5);
    expect(typeof val).toBe('number');
    expect(isFinite(val)).toBe(true);
  });

  it('fbm with single octave matches scaled noise2D', () => {
    const noise = new SimplexNoise(7);
    const fbmVal = noise.fbm(1.0, 1.0, 1, 2, 0.5);
    const directVal = noise.noise2D(1.0, 1.0);
    expect(fbmVal).toBeCloseTo(directVal, 5);
  });

  it('noise2D at origin returns a valid number', () => {
    const noise = new SimplexNoise(0);
    const val = noise.noise2D(0, 0);
    expect(typeof val).toBe('number');
    expect(isFinite(val)).toBe(true);
  });
});

describe('Heightmap', () => {
  it('generateHeightmap returns correct dimensions', () => {
    const hm = generateHeightmap({ width: 32, height: 16 });
    expect(hm.width).toBe(32);
    expect(hm.height).toBe(16);
    expect(hm.data.length).toBe(32 * 16);
  });

  it('getHeight returns valid value', () => {
    const hm = generateHeightmap({ width: 16, height: 16, seed: 1 });
    const val = getHeight(hm, 5, 5);
    expect(typeof val).toBe('number');
    expect(isFinite(val)).toBe(true);
  });

  it('getHeight clamps to bounds', () => {
    const hm = generateHeightmap({ width: 8, height: 8, seed: 2 });
    const outOfBounds = getHeight(hm, 100, 100);
    const inBounds = getHeight(hm, 7, 7);
    expect(outOfBounds).toBe(inBounds);
  });

  it('heightMultiplier scales output', () => {
    const hm1 = generateHeightmap({ width: 8, height: 8, seed: 5, heightMultiplier: 1 });
    const hm2 = generateHeightmap({ width: 8, height: 8, seed: 5, heightMultiplier: 10 });
    // Values should be proportional
    const v1 = hm1.data[10] ?? 0;
    const v2 = hm2.data[10] ?? 0;
    if (v1 !== 0) {
      expect(v2 / v1).toBeCloseTo(10, 5);
    }
  });
});

describe('Dungeon', () => {
  it('generateDungeon creates rooms', () => {
    const dungeon = generateDungeon({ seed: 42 });
    expect(dungeon.rooms.length).toBeGreaterThan(0);
  });

  it('generateDungeon rooms do not overlap', () => {
    const dungeon = generateDungeon({ seed: 42 });
    const rooms = dungeon.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i]!;
        const b = rooms[j]!;
        const overlaps =
          a.x < b.x + b.width + 1 && a.x + a.width > b.x - 1 &&
          a.y < b.y + b.height + 1 && a.y + a.height > b.y - 1;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('dungeonToVGX returns valid XML string containing <world', () => {
    const dungeon = generateDungeon({ seed: 1 });
    const xml = dungeonToVGX(dungeon);
    expect(typeof xml).toBe('string');
    expect(xml).toContain('<world');
    expect(xml).toContain('</world>');
  });

  it('generateDungeon is deterministic (same seed = same result)', () => {
    const a = generateDungeon({ seed: 99 });
    const b = generateDungeon({ seed: 99 });
    expect(a.rooms.length).toBe(b.rooms.length);
    expect(a.rooms[0]).toEqual(b.rooms[0]);
  });

  it('generateDungeon respects maxRooms', () => {
    const dungeon = generateDungeon({ seed: 42, maxRooms: 5 });
    expect(dungeon.rooms.length).toBeLessThanOrEqual(5);
  });

  it('generateDungeon grid has floor tiles where rooms are', () => {
    const dungeon = generateDungeon({ seed: 42 });
    const room = dungeon.rooms[0]!;
    const cx = Math.floor(room.x + room.width / 2);
    const cy = Math.floor(room.y + room.height / 2);
    expect(dungeon.grid[cy * dungeon.width + cx]).toBe(1);
  });

  it('dungeonToVGX includes entity tags for rooms', () => {
    const dungeon = generateDungeon({ seed: 3 });
    const xml = dungeonToVGX(dungeon);
    expect(xml).toContain('<entity name="room_0">');
  });
});
