import type { World, EntityId } from "./world.js";

export function addEntity(world: World): EntityId {
  const eid = world.nextEntityId++;
  world.entities.add(eid);
  return eid;
}

export function removeEntity(world: World, eid: EntityId): void {
  world.entities.delete(eid);
  // Remove all components associated with this entity
  for (const store of world.components.values()) {
    store.delete(eid);
  }
}

export function hasEntity(world: World, eid: EntityId): boolean {
  return world.entities.has(eid);
}

export function getAllEntities(world: World): EntityId[] {
  return [...world.entities];
}
