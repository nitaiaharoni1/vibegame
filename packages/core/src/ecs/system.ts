import type { World } from "./world.js";
import type { SystemDefinition } from "./world.js";
import { sortSystems } from "./sort.js";

export { SystemDefinition, sortSystems };

export enum Phase {
  PreUpdate = 0,
  Update = 1,
  PostUpdate = 2,
  Render = 3,
}

export function defineSystem(def: SystemDefinition): SystemDefinition {
  return def;
}

export function addSystem(world: World, system: SystemDefinition): void {
  // Remove existing system with same name to avoid duplicates
  removeSystem(world, system.name);
  world.systems.push(system);
  sortSystems(world);
}

export function removeSystem(world: World, name: string): void {
  const idx = world.systems.findIndex((s) => s.name === name);
  if (idx !== -1) {
    world.systems.splice(idx, 1);
  }
}
