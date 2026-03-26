import type { VibePlugin, World, EntityId } from '@vigame/core';
import { defineSystem, query, getComponent, setComponent } from '@vigame/core';
import { NPCController, Waypoints } from './components.js';
import { Steering } from './steering.js';

function getTransform(world: World, eid: EntityId): { px: number; py: number; pz: number } | undefined {
  const store = (world.components as Map<string, Map<EntityId, Record<string, unknown>>>).get('Transform3D');
  const d = store?.get(eid);
  if (!d) return undefined;
  return { px: (d['px'] as number) ?? 0, py: (d['py'] as number) ?? 0, pz: (d['pz'] as number) ?? 0 };
}

function setTransform(world: World, eid: EntityId, px: number, py: number, pz: number): void {
  const store = (world.components as Map<string, Map<EntityId, Record<string, unknown>>>).get('Transform3D');
  const d = store?.get(eid);
  if (d) { d['px'] = px; d['py'] = py; d['pz'] = pz; }
}

export function NPCPlugin(): VibePlugin {
  return {
    name: 'NPCPlugin',
    setup(_world: World) {},
    systems(_world: World) {
      return [
        defineSystem({
          name: 'WaypointSystem',
          phase: 1, // Update
          execute(world: World, delta: number) {
            const entities = query(world, [NPCController, Waypoints]);
            for (const eid of entities) {
              const npc = getComponent(world, eid, NPCController)!;
              const wp = getComponent(world, eid, Waypoints)!;
              const pos = getTransform(world, eid);
              if (!pos) continue;

              let points: Array<{ x: number; y: number; z: number }>;
              try { points = JSON.parse(wp.points) as Array<{ x: number; y: number; z: number }>; }
              catch { continue; }
              if (points.length === 0) continue;

              const target = points[wp.currentIndex % points.length];
              if (!target) continue;

              const steering = Steering.arrive(
                { x: pos.px, y: pos.py, z: pos.pz },
                { x: target.x, y: target.y, z: target.z },
                npc.moveSpeed
              );

              const newX = pos.px + steering.x * delta;
              const newZ = pos.pz + steering.z * delta;
              setTransform(world, eid, newX, pos.py, newZ);

              // Check if arrived
              const dx = target.x - pos.px;
              const dz = target.z - pos.pz;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist < wp.arriveRadius) {
                const nextIndex = wp.currentIndex + 1;
                if (!wp.loop && nextIndex >= points.length) {
                  // Reached end
                } else {
                  setComponent(world, eid, Waypoints, { currentIndex: nextIndex % points.length });
                }
              }
            }
          },
        }),
      ];
    },
  };
}
