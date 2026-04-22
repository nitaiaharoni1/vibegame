import type { ObserveArgs, ObservedEntity, ObserveResult, SpatialRelation } from '@vigame/protocol';
import { inspectPath } from './mutator.js';

export type { ObserveArgs, ObserveResult };

let prevObservation: {
  entities: Map<string, { x: number; y: number; z?: number }>;
  timestamp: number;
} | null = null;

const SKIP_SCENE_PROPERTIES = new Set([
  'sys',
  'game',
  'anims',
  'cache',
  'registry',
  'sound',
  'textures',
  'events',
  'cameras',
  'add',
  'make',
  'scene',
  'children',
  'lights',
  'data',
  'input',
  'load',
  'time',
  'tweens',
  'physics',
  'matter',
  'impact',
  'plugins',
  'renderer',
  'scale',
  'facebook',
]);

function isLikelyPhaserScene(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  // Phaser scenes have a .sys property with scene manager
  return typeof rec.sys === 'object' && rec.sys !== null;
}

function isLikelyGameObject(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  // Game objects have x/y coordinates or a body (physics)
  return (
    (typeof rec.x === 'number' && typeof rec.y === 'number') ||
    (typeof rec.body === 'object' && rec.body !== null)
  );
}

const SKIP_PROPERTIES = new Set([
  'matrix',
  'matrixWorld',
  'quaternion',
  'uuid',
  'layers',
  'renderOrder',
  'frustumCulled',
  'castShadow',
  'receiveShadow',
  '_events',
  'scene',
  'parentContainer',
  'renderFlags',
  'cameraFilter',
]);

const INTERESTING_PROPERTIES = new Set([
  'health',
  'score',
  'damage',
  'speed',
  'playerScore',
  'aiScore',
  'serving',
  'paused',
  'rallyCount',
  'lives',
  'level',
  'energy',
  'mana',
  'points',
]);

function isPrimitive(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function extractPrimitiveProperties(obj: unknown): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (typeof obj !== 'object' || obj === null) return result;

  let count = 0;
  try {
    for (const key of Object.keys(obj)) {
      if (count >= 20) break;
      if (SKIP_PROPERTIES.has(key)) continue;
      try {
        const v = (obj as Record<string, unknown>)[key];
        if (isPrimitive(v)) {
          result[key] = v;
          count++;
        }
      } catch {
        // skip inaccessible properties
      }
    }
  } catch {
    // Object.keys may throw on exotic objects
  }
  return result;
}

function extractPosition(obj: unknown): { x: number; y: number; z?: number } | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;

  try {
    // Three.js: .position.x/.y/.z
    const asRecord = obj as Record<string, unknown>;
    const pos = asRecord.position;
    if (typeof pos === 'object' && pos !== null) {
      const posRecord = pos as Record<string, unknown>;
      const x = posRecord.x;
      const y = posRecord.y;
      const z = posRecord.z;
      if (typeof x === 'number' && typeof y === 'number') {
        return { x, y, ...(typeof z === 'number' ? { z } : {}) };
      }
    }

    // Phaser: direct .x/.y on the object
    const x = asRecord.x;
    const y = asRecord.y;
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y };
    }
  } catch {
    // defensive
  }

  return undefined;
}

function getChildrenArray(root: unknown): unknown[] {
  if (typeof root !== 'object' || root === null) return [];

  const asRecord = root as Record<string, unknown>;

  // Phaser Game: walk into active scenes
  try {
    const scenePlugin = asRecord.scene as Record<string, unknown> | undefined;
    const scenes = scenePlugin?.scenes;
    if (Array.isArray(scenes) && scenes.length > 0) {
      // Return active scenes as children of the Game object
      return scenes.filter((s) => {
        if (typeof s !== 'object' || s === null) return false;
        const sys = (s as Record<string, unknown>).sys as Record<string, unknown> | undefined;
        const settings = sys?.settings as Record<string, unknown> | undefined;
        return settings?.active === true;
      });
    }
  } catch {
    // ignore
  }

  // Three.js: .children array
  try {
    const children = asRecord.children;
    if (Array.isArray(children)) return children;
  } catch {
    // ignore
  }

  // Phaser Group: .list array
  try {
    const list = asRecord.list;
    if (Array.isArray(list)) return list;
  } catch {
    // ignore
  }

  // Phaser Scene children: .children.list
  try {
    const childrenObj = asRecord.children;
    if (typeof childrenObj === 'object' && childrenObj !== null) {
      const list = (childrenObj as Record<string, unknown>).list;
      if (Array.isArray(list)) return list;
    }
  } catch {
    // ignore
  }

  return [];
}

function getEntityType(obj: unknown): string {
  if (typeof obj !== 'object' || obj === null) return 'object';
  try {
    const asRecord = obj as Record<string, unknown>;
    const type = asRecord.type;
    if (typeof type === 'string') return type;
    const ctor = (obj as { constructor?: { name?: unknown } }).constructor;
    if (ctor !== undefined && typeof ctor.name === 'string') return ctor.name;
  } catch {
    // ignore
  }
  return 'object';
}

function buildEntity(name: string, obj: unknown): ObservedEntity {
  const pos = extractPosition(obj);
  const entity: ObservedEntity = {
    name,
    type: getEntityType(obj),
    properties: extractPrimitiveProperties(obj),
  };
  if (pos !== undefined) {
    entity.position = pos;
  }
  return entity;
}

function isEntityInteresting(entity: ObservedEntity): boolean {
  if (entity.position !== undefined) return true;
  for (const key of Object.keys(entity.properties)) {
    if (INTERESTING_PROPERTIES.has(key)) return true;
  }
  return false;
}

function computeDistance(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getCurrentFps(): number {
  try {
    if (typeof window !== 'undefined') {
      const win = window as unknown as Record<string, unknown>;
      const fps = win.__VIGAME_FPS__;
      if (typeof fps === 'number') return fps;
    }
  } catch {
    // ignore
  }
  return 0;
}

export async function observeGame(
  args: ObserveArgs,
  registeredRoots: Map<string, unknown>,
): Promise<ObserveResult> {
  const state: Record<string, unknown> = {};

  // Read explicit paths
  if (args.paths !== undefined) {
    for (const path of args.paths) {
      try {
        state[path] = inspectPath(path, registeredRoots).value;
      } catch {
        state[path] = undefined;
      }
    }
  }

  let entities: ObservedEntity[] | undefined;
  let budgetExceeded = false;

  // Auto-discover entities from registered roots and their children (recursive)
  if (args.auto_discover === true) {
    const maxDepth = Math.min(args.max_depth ?? 3, 5);
    const budgetCap = 200;
    const discovered: ObservedEntity[] = [];
    const visited = new WeakSet<object>();

    function walkEntities(name: string, obj: unknown, depth: number): void {
      if (discovered.length >= budgetCap) return;

      // Skip objects we've already visited (dedup across roots)
      if (typeof obj === 'object' && obj !== null) {
        if (visited.has(obj)) return;
        visited.add(obj);
      }

      try {
        const entity = buildEntity(name, obj);
        if (isEntityInteresting(entity)) {
          discovered.push(entity);
        }
      } catch {
        return;
      }

      if (depth <= 0 || discovered.length >= budgetCap) return;

      try {
        const children = getChildrenArray(obj);
        for (let i = 0; i < children.length; i++) {
          if (discovered.length >= budgetCap) break;
          const child = children[i];
          try {
            let childName: string;
            if (typeof child === 'object' && child !== null) {
              const n = (child as Record<string, unknown>).name;
              if (typeof n === 'string' && n !== '') {
                childName = `${name}.${n}`;
              } else {
                // Use type + index for better readability
                const typeName = getEntityType(child);
                if (typeName !== 'object') {
                  childName = `${name}.${typeName}[${i}]`;
                } else {
                  childName = `${name}.child[${i}]`;
                }
              }
            } else {
              childName = `${name}.child[${i}]`;
            }
            walkEntities(childName, child, depth - 1);
          } catch {
            // skip inaccessible child
          }
        }
      } catch {
        // skip if children iteration fails
      }

      // Phaser scenes: also walk own enumerable properties that look like game objects
      try {
        if (isLikelyPhaserScene(obj)) {
          const sceneRecord = obj as Record<string, unknown>;
          for (const key of Object.keys(sceneRecord)) {
            if (discovered.length >= budgetCap) break;
            // Skip internal Phaser properties
            if (key.startsWith('_') || SKIP_SCENE_PROPERTIES.has(key)) continue;
            try {
              const val = sceneRecord[key];
              if (isLikelyGameObject(val)) {
                walkEntities(`${name}.${key}`, val, depth - 1);
              } else if (Array.isArray(val) && val.length > 0 && val.length <= 20) {
                // Walk arrays of game objects (e.g. this.players, this.homeTeam)
                let hasGameObj = false;
                for (let ai = 0; ai < Math.min(val.length, 3); ai++) {
                  if (isLikelyGameObject(val[ai])) {
                    hasGameObj = true;
                    break;
                  }
                }
                if (hasGameObj) {
                  for (let ai = 0; ai < val.length && discovered.length < budgetCap; ai++) {
                    if (isLikelyGameObject(val[ai])) {
                      walkEntities(`${name}.${key}[${ai}]`, val[ai], depth - 1);
                    }
                  }
                }
              }
            } catch {
              // skip inaccessible
            }
          }
        }
      } catch {
        // skip
      }
    }

    for (const [name, root] of registeredRoots.entries()) {
      walkEntities(name, root, maxDepth);
    }

    budgetExceeded = discovered.length >= budgetCap;
    entities = discovered;
  }

  // Compute velocity vectors from position deltas
  if (args.compute_velocity === true && entities !== undefined) {
    const now = performance.now();
    if (prevObservation !== null) {
      const dt = (now - prevObservation.timestamp) / 1000;
      if (dt > 0) {
        for (const entity of entities) {
          if (entity.position === undefined) continue;
          const prev = prevObservation.entities.get(entity.name);
          if (prev === undefined) continue;
          const vx = (entity.position.x - prev.x) / dt;
          const vy = (entity.position.y - prev.y) / dt;
          const vel: { x: number; y: number; z?: number } = { x: vx, y: vy };
          if (typeof entity.position.z === 'number' && typeof prev.z === 'number') {
            vel.z = (entity.position.z - prev.z) / dt;
          }
          entity.velocity = vel;
        }
      }
    }
    const currentPositions = new Map<string, { x: number; y: number; z?: number }>();
    for (const entity of entities) {
      if (entity.position !== undefined) {
        currentPositions.set(entity.name, { ...entity.position });
      }
    }
    prevObservation = { entities: currentPositions, timestamp: now };
  }

  // Compute spatial relations
  let spatial: SpatialRelation[] | undefined;

  if (args.spatial === true) {
    // Gather all positioned entities
    let positionedEntities: ObservedEntity[];

    if (entities !== undefined) {
      positionedEntities = entities.filter((e) => e.position !== undefined);
    } else {
      // auto_discover was not requested, build entities from roots directly
      positionedEntities = [];
      for (const [name, root] of registeredRoots.entries()) {
        try {
          const entity = buildEntity(name, root);
          if (entity.position !== undefined) {
            positionedEntities.push(entity);
          }
        } catch {
          // skip
        }
      }
    }

    const pairs: SpatialRelation[] = [];
    for (let i = 0; i < positionedEntities.length && pairs.length < 20; i++) {
      const a = positionedEntities[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < positionedEntities.length && pairs.length < 20; j++) {
        const b = positionedEntities[j];
        if (b === undefined) continue;
        if (a.position === undefined || b.position === undefined) continue;
        try {
          pairs.push({
            from: a.name,
            to: b.name,
            distance: computeDistance(a.position, b.position),
          });
        } catch {
          // skip
        }
      }
    }

    spatial = pairs;
  }

  const result: ObserveResult = {
    state,
    registered_roots: Array.from(registeredRoots.keys()),
    fps: getCurrentFps(),
  };

  if (entities !== undefined) {
    result.entities = entities;
  }

  if (spatial !== undefined) {
    result.spatial = spatial;
  }

  if (budgetExceeded) {
    result.budget_exceeded = true;
  }

  return result;
}
