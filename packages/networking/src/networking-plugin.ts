import type { VibePlugin, World, EntityId } from '@vigame/core';
import { defineSystem, query, getComponent, setComponent } from '@vigame/core';
import { NetworkClient } from './client.js';
import { NetworkEntity, NetworkTransform } from './components.js';

interface NetworkState {
  client: NetworkClient;
  syncAccumulators: Map<EntityId, number>;
}

const netStateMap = new WeakMap<World, NetworkState>();

export function getNetworkClient(world: World): NetworkClient | undefined {
  return netStateMap.get(world)?.client;
}

export interface NetworkingPluginOptions {
  serverUrl: string;
  autoConnect?: boolean;
}

export function NetworkingPlugin(options: NetworkingPluginOptions): VibePlugin {
  return {
    name: 'NetworkingPlugin',
    setup(world: World) {
      const client = new NetworkClient(options.serverUrl);
      netStateMap.set(world, { client, syncAccumulators: new Map() });
      if (options.autoConnect ?? true) client.connect();
    },

    systems(_world: World) {
      return [
        defineSystem({
          name: 'NetworkSync',
          phase: 1, // Update
          execute(world: World, delta: number) {
            const state = netStateMap.get(world);
            if (!state?.client.connected) return;

            // Send position updates for locally owned entities
            const netEntities = query(world, [NetworkEntity]);
            for (const eid of netEntities) {
              const ne = getComponent(world, eid, NetworkEntity)!;
              if (!ne.isLocal) continue;

              let acc = state.syncAccumulators.get(eid) ?? 0;
              acc += delta;
              const interval = 1 / ne.syncRate;
              if (acc >= interval) {
                state.syncAccumulators.set(eid, acc - interval);
                // Read transform
                const transformStore = (world.components as Map<string, Map<EntityId, Record<string, unknown>>>).get('Transform3D');
                const transform = transformStore?.get(eid);
                if (transform) {
                  state.client.send('entity:move', {
                    netId: ne.netId,
                    x: transform['px'],
                    y: transform['py'],
                    z: transform['pz'],
                  });
                }
              }
            }
          },
        }),

        defineSystem({
          name: 'NetworkInterpolate',
          phase: 2, // PostUpdate
          execute(world: World, delta: number) {
            const netEntities = query(world, [NetworkEntity, NetworkTransform]);
            for (const eid of netEntities) {
              const ne = getComponent(world, eid, NetworkEntity)!;
              if (ne.isLocal) continue; // only interpolate remote entities
              if (!ne.interpolate) continue;

              const nt = getComponent(world, eid, NetworkTransform)!;
              const newLerpT = Math.min(1, nt.lerpT + delta * nt.lerpSpeed);

              const newX = nt.prevX + (nt.targetX - nt.prevX) * newLerpT;
              const newY = nt.prevY + (nt.targetY - nt.prevY) * newLerpT;
              const newZ = nt.prevZ + (nt.targetZ - nt.prevZ) * newLerpT;

              setComponent(world, eid, NetworkTransform, { lerpT: newLerpT });

              // Write interpolated position to Transform3D
              const transformStore = (world.components as Map<string, Map<EntityId, Record<string, unknown>>>).get('Transform3D');
              const transform = transformStore?.get(eid);
              if (transform) {
                transform['px'] = newX;
                transform['py'] = newY;
                transform['pz'] = newZ;
              }
            }
          },
        }),
      ];
    },

    teardown(world: World) {
      const state = netStateMap.get(world);
      state?.client.disconnect();
      netStateMap.delete(world);
    },
  };
}
