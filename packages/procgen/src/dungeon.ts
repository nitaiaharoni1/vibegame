export interface Room {
  x: number; y: number;
  width: number; height: number;
}

export interface Dungeon {
  width: number;
  height: number;
  grid: Uint8Array; // 0 = wall, 1 = floor, 2 = door
  rooms: Room[];
  corridors: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface DungeonOptions {
  width?: number;
  height?: number;
  minRoomSize?: number;
  maxRoomSize?: number;
  maxRooms?: number;
  seed?: number;
}

// Simple LCG RNG for seeded generation
class RNG {
  private s: number;
  constructor(seed: number) { this.s = seed | 0; }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) & 0xffffffff;
    return (this.s >>> 0) / 0xffffffff;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

export function generateDungeon(opts: DungeonOptions = {}): Dungeon {
  const {
    width = 80, height = 50,
    minRoomSize = 4, maxRoomSize = 12,
    maxRooms = 20, seed = 42,
  } = opts;

  const rng = new RNG(seed);
  const grid = new Uint8Array(width * height); // all walls
  const rooms: Room[] = [];
  const corridors: Dungeon['corridors'] = [];

  function carve(x: number, y: number): void {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y * width + x] = 1;
  }

  function carveRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        carve(x, y);
      }
    }
  }

  function carveCorridor(x1: number, y1: number, x2: number, y2: number): void {
    let x = x1; let y = y1;
    // L-shaped corridor
    while (x !== x2) { carve(x, y); x += x < x2 ? 1 : -1; }
    while (y !== y2) { carve(x, y); y += y < y2 ? 1 : -1; }
    corridors.push({ x1, y1, x2, y2 });
  }

  for (let attempt = 0; attempt < maxRooms * 3; attempt++) {
    if (rooms.length >= maxRooms) break;
    const w = rng.nextInt(minRoomSize, maxRoomSize);
    const h = rng.nextInt(minRoomSize, maxRoomSize);
    const x = rng.nextInt(1, width - w - 2);
    const y = rng.nextInt(1, height - h - 2);
    const room: Room = { x, y, width: w, height: h };

    // Check overlap
    const overlaps = rooms.some(r =>
      room.x < r.x + r.width + 1 && room.x + room.width > r.x - 1 &&
      room.y < r.y + r.height + 1 && room.y + room.height > r.y - 1
    );
    if (overlaps) continue;

    carveRoom(room);

    // Connect to previous room
    if (rooms.length > 0) {
      const prev = rooms[rooms.length - 1]!;
      const cx1 = Math.floor(prev.x + prev.width / 2);
      const cy1 = Math.floor(prev.y + prev.height / 2);
      const cx2 = Math.floor(room.x + room.width / 2);
      const cy2 = Math.floor(room.y + room.height / 2);
      carveCorridor(cx1, cy1, cx2, cy2);
    }

    rooms.push(room);
  }

  return { width, height, grid, rooms, corridors };
}

export function dungeonToVGX(dungeon: Dungeon, tileSize = 1): string {
  const lines = ['<world renderer="three">'];
  lines.push('  <config gravity="0 -9.81 0" clear-color="#111111" />');

  // Add floor tiles for rooms
  for (const room of dungeon.rooms) {
    const cx = (room.x + room.width / 2) * tileSize;
    const cz = (room.y + room.height / 2) * tileSize;
    const w = room.width * tileSize;
    const h = room.height * tileSize;
    const idx = dungeon.rooms.indexOf(room);
    lines.push(`  <entity name="room_${idx}">`);
    lines.push(`    <transform pos="${cx.toFixed(1)} 0 ${cz.toFixed(1)}" />`);
    lines.push(`    <mesh shape="box" size="${w.toFixed(1)} 0.1 ${h.toFixed(1)}" color="#555555" />`);
    lines.push(`  </entity>`);
  }

  lines.push('</world>');
  return lines.join('\n');
}
