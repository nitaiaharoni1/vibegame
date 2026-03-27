import type { ObserveArgs, ObservedEntity, ObserveResult, SpatialRelation } from '@vigame/protocol';
import { inspectPath } from './mutator.js';

export type { ObserveArgs, ObserveResult };

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

const INTERESTING_PROPERTIES = new Set(['health', 'score', 'damage', 'speed']);

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
    const pos = asRecord['position'];
    if (typeof pos === 'object' && pos !== null) {
      const posRecord = pos as Record<string, unknown>;
      const x = posRecord['x'];
      const y = posRecord['y'];
      const z = posRecord['z'];
      if (typeof x === 'number' && typeof y === 'number') {
        return { x, y, ...(typeof z === 'number' ? { z } : {}) };
      }
    }

    // Phaser: direct .x/.y on the object
    const x = asRecord['x'];
    const y = asRecord['y'];
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y };
    }
  } catch {
    // defensive
  }

  return undefined;
}

function hasInterestingProperties(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  try {
    for (const key of Object.keys(obj)) {
      if (INTERESTING_PROPERTIES.has(key)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function getChildrenArray(root: unknown): unknown[] {
  if (typeof root !== 'object' || root === null) return [];

  const asRecord = root as Record<string, unknown>;

  // Three.js: .children array
  try {
    const children = asRecord['children'];
    if (Array.isArray(children)) return children;
  } catch {
    // ignore
  }

  // Phaser Group: .list array
  try {
    const list = asRecord['list'];
    if (Array.isArray(list)) return list;
  } catch {
    // ignore
  }

  // Phaser Scene children: .children.list
  try {
    const childrenObj = asRecord['children'];
    if (typeof childrenObj === 'object' && childrenObj !== null) {
      const list = (childrenObj as Record<string, unknown>)['list'];
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
    const type = asRecord['type'];
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

  // Auto-discover entities from registered roots and their children
  if (args.auto_discover === true) {
    const discovered: ObservedEntity[] = [];

    for (const [name, root] of registeredRoots.entries()) {
      try {
        const entity = buildEntity(name, root);
        if (isEntityInteresting(entity)) {
          discovered.push(entity);
        }
      } catch {
        // skip inaccessible root
      }

      // Walk one level of children
      try {
        const children = getChildrenArray(root);
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          try {
            const childName = `${name}.child[${i}]`;
            // Try to get a meaningful name from the child object
            let resolvedName = childName;
            if (typeof child === 'object' && child !== null) {
              const asRecord = child as Record<string, unknown>;
              const childObjName = asRecord['name'];
              if (typeof childObjName === 'string' && childObjName !== '') {
                resolvedName = childObjName;
              }
            }
            const childEntity = buildEntity(resolvedName, child);
            if (isEntityInteresting(childEntity)) {
              discovered.push(childEntity);
            }
          } catch {
            // skip inaccessible child
          }
        }
      } catch {
        // skip if children iteration fails
      }
    }

    entities = discovered;
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

  return result;
}
