import type { World, VibePlugin } from '@vigame/core';
import {
  getAllEntities,
  addEntity,
  removeEntity,
  addTag,
  hasTag,
  setEntityName,
  getEntityName,
  getAllComponentsOnEntity,
  getComponentSchemas,
  startWorld,
  stopWorld,
  pauseWorld,
  resumeWorld,
} from '@vigame/core';
import { parseVGX, hydrateScene } from '@vigame/scene';
import { GameBridgeClient } from './client-bridge.js';

// Import screenshot utility from renderer-three (optional dependency)
// Use dynamic import to avoid hard dependency
async function tryScreenshot(world: World): Promise<string | null> {
  try {
    // Optional peer: resolved at runtime from the host app (vite-ignore skips static resolve from packages/mcp).
    const mod = (await import(/* @vite-ignore */ '@vigame/renderer-three')) as {
      captureScreenshot?: (w: World) => Promise<string> | string;
    };
    if (typeof mod.captureScreenshot === 'function') {
      return await mod.captureScreenshot(world);
    }
    return null;
  } catch {
    return null;
  }
}

export interface VigameBridgeOptions {
  url?: string;
}

export function VigameBridgePlugin(options: VigameBridgeOptions = {}): VibePlugin {
  let bridgeClient: GameBridgeClient;
  let currentWorld: World;

  return {
    name: 'VigameBridgePlugin',
    setup(world: World) {
      currentWorld = world;
      bridgeClient = new GameBridgeClient(options.url ?? 'ws://localhost:7777');

      // Scene actions
      bridgeClient.on('scene:load', async (payload) => {
        const { vgx } = payload as { vgx: string };
        for (const eid of getAllEntities(currentWorld)) {
          removeEntity(currentWorld, eid);
        }
        const vgxWorld = parseVGX(vgx);
        hydrateScene(vgxWorld, currentWorld);
        return { ok: true };
      });

      bridgeClient.on('scene:save', async () => {
        const entities = getAllEntities(currentWorld);
        const lines = ['<world renderer="three">'];
        for (const eid of entities) {
          const name = getEntityName(currentWorld, eid) ?? `entity_${eid}`;
          const components = getAllComponentsOnEntity(currentWorld, eid);
          lines.push(`  <entity name="${name}">`);
          for (const c of components) {
            const props = Object.entries(c.data as Record<string, unknown>)
              .map(([k, v]) => `${k}="${String(v)}"`)
              .join(' ');
            lines.push(`    <${c.name} ${props} />`);
          }
          lines.push(`  </entity>`);
        }
        lines.push('</world>');
        return lines.join('\n');
      });

      bridgeClient.on('scene:clear', async () => {
        for (const eid of getAllEntities(currentWorld)) {
          removeEntity(currentWorld, eid);
        }
        return { ok: true };
      });

      bridgeClient.on('scene:info', async () => {
        return {
          entityCount: getAllEntities(currentWorld).length,
          renderer: 'three',
        };
      });

      // Entity actions
      bridgeClient.on('entity', async (payload) => {
        const { action, name, newName, tags } = payload as {
          action: string;
          name?: string;
          newName?: string;
          tags?: string[];
        };

        if (action === 'list') {
          return getAllEntities(currentWorld).map(eid => ({
            id: eid,
            name: getEntityName(currentWorld, eid),
          }));
        }

        if (action === 'create') {
          const eid = addEntity(currentWorld);
          if (name) setEntityName(currentWorld, eid, name);
          if (tags) for (const tag of tags) addTag(currentWorld, eid, tag);
          return { id: eid, name };
        }

        if (action === 'delete' && name) {
          const entities = getAllEntities(currentWorld);
          for (const eid of entities) {
            if (getEntityName(currentWorld, eid) === name) {
              removeEntity(currentWorld, eid);
              return { ok: true };
            }
          }
          return { error: `Entity "${name}" not found` };
        }

        if (action === 'find' && name) {
          const entities = getAllEntities(currentWorld);
          for (const eid of entities) {
            if (getEntityName(currentWorld, eid) === name) {
              return { id: eid, name, components: getAllComponentsOnEntity(currentWorld, eid) };
            }
          }
          return null;
        }

        if (action === 'rename' && name && newName) {
          const entities = getAllEntities(currentWorld);
          for (const eid of entities) {
            if (getEntityName(currentWorld, eid) === name) {
              setEntityName(currentWorld, eid, newName);
              return { ok: true };
            }
          }
          return { error: `Entity "${name}" not found` };
        }

        return { error: `Unknown entity action: ${action}` };
      });

      // Component actions
      bridgeClient.on('component', async (payload) => {
        const { action, entityName } = payload as { action: string; entityName?: string };

        if (action === 'list_available') {
          return getComponentSchemas(currentWorld);
        }

        if (entityName) {
          const entities = getAllEntities(currentWorld);
          for (const eid of entities) {
            if (getEntityName(currentWorld, eid) === entityName) {
              if (action === 'get') {
                return getAllComponentsOnEntity(currentWorld, eid);
              }
            }
          }
        }

        return { error: 'Not implemented yet' };
      });

      // Transform actions — directly mutate Transform3D component data
      bridgeClient.on('transform', async (payload) => {
        const { action, entityName, x = 0, y = 0, z: zVal = 0 } = payload as {
          action: string;
          entityName: string;
          x?: number;
          y?: number;
          z?: number;
        };

        const entities = getAllEntities(currentWorld);
        for (const eid of entities) {
          if (getEntityName(currentWorld, eid) === entityName) {
            const store = currentWorld.components.get('Transform3D');
            if (!store?.has(eid)) return { error: `Entity "${entityName}" has no Transform3D` };
            const data = store.get(eid)!;
            if (action === 'set_position') {
              data['px'] = x;
              data['py'] = y;
              data['pz'] = zVal;
            } else if (action === 'set_rotation') {
              data['rx'] = x;
              data['ry'] = y;
              data['rz'] = zVal;
            } else if (action === 'set_scale') {
              data['sx'] = x;
              data['sy'] = y;
              data['sz'] = zVal;
            }
            return { ok: true };
          }
        }
        return { error: `Entity "${entityName}" not found` };
      });

      // Query actions
      bridgeClient.on('query', async (payload) => {
        const { by, value } = payload as { by: string; value?: string };
        const entities = getAllEntities(currentWorld);

        if (by === 'all') {
          return entities.map(eid => ({ id: eid, name: getEntityName(currentWorld, eid) }));
        }

        if (by === 'name' && value) {
          return entities
            .filter(eid => getEntityName(currentWorld, eid) === value)
            .map(eid => ({ id: eid, name: value }));
        }

        if (by === 'tag' && value) {
          return entities
            .filter(eid => hasTag(currentWorld, eid, value))
            .map(eid => ({ id: eid, name: getEntityName(currentWorld, eid) }));
        }

        if (by === 'component' && value) {
          const store = currentWorld.components.get(value);
          if (!store) return [];
          return [...store.keys()].map(eid => ({ id: eid, name: getEntityName(currentWorld, eid) }));
        }

        return [];
      });

      // Runtime actions
      bridgeClient.on('runtime', async (payload) => {
        const { action } = payload as { action: string };
        if (action === 'play') startWorld(currentWorld);
        else if (action === 'pause') pauseWorld(currentWorld);
        else if (action === 'stop') stopWorld(currentWorld);
        else if (action === 'resume') resumeWorld(currentWorld);
        return { ok: true };
      });

      // Inspect actions
      bridgeClient.on('inspect:screenshot', async () => {
        return await tryScreenshot(currentWorld) ?? 'data:image/png;base64,';
      });

      bridgeClient.on('inspect', async (payload) => {
        const { action } = payload as { action: string };
        if (action === 'schemas') return getComponentSchemas(currentWorld);
        if (action === 'world_state') {
          return {
            entityCount: getAllEntities(currentWorld).length,
            running: currentWorld.running,
            paused: currentWorld.paused,
          };
        }
        if (action === 'systems') {
          return currentWorld.systems.map(s => ({ name: s.name, phase: s.phase }));
        }
        return {};
      });

      // VGX patch
      bridgeClient.on('scene:patch', async (payload) => {
        const { vgx } = payload as { vgx: string };
        try {
          const parsed = parseVGX(vgx);
          hydrateScene(parsed, currentWorld);
          return { ok: true };
        } catch (e) {
          return { error: (e as Error).message };
        }
      });

      bridgeClient.connect();
    },
    teardown() {
      bridgeClient?.disconnect();
    },
  };
}
