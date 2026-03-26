import type { World } from "./world.js";
import type { SystemDefinition } from "./world.js";

export { SystemDefinition };

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
  // Sort by phase, then respect after/before hints
  sortSystems(world);
}

export function removeSystem(world: World, name: string): void {
  const idx = world.systems.findIndex((s) => s.name === name);
  if (idx !== -1) {
    world.systems.splice(idx, 1);
  }
}

function sortSystems(world: World): void {
  // Topological sort respecting phase, then after/before constraints
  const systems = world.systems;

  // First pass: stable sort by phase
  systems.sort((a, b) => a.phase - b.phase);

  // Second pass: within each phase, resolve after/before
  // Group by phase
  const byPhase = new Map<number, SystemDefinition[]>();
  for (const sys of systems) {
    let group = byPhase.get(sys.phase);
    if (!group) {
      group = [];
      byPhase.set(sys.phase, group);
    }
    group.push(sys);
  }

  const sorted: SystemDefinition[] = [];
  for (const [, group] of [...byPhase.entries()].sort(([a], [b]) => a - b)) {
    sorted.push(...topoSortGroup(group));
  }

  world.systems.length = 0;
  world.systems.push(...sorted);
}

function topoSortGroup(systems: SystemDefinition[]): SystemDefinition[] {
  const nameMap = new Map(systems.map((s) => [s.name, s]));
  const deps = new Map<string, Set<string>>();

  for (const sys of systems) {
    const d = new Set<string>();
    if (sys.after) {
      for (const a of sys.after) {
        if (nameMap.has(a)) d.add(a);
      }
    }
    if (sys.before) {
      for (const b of sys.before) {
        const target = nameMap.get(b);
        if (target) {
          // b must come after sys, so b depends on sys
          let bd = deps.get(b);
          if (!bd) {
            bd = new Set();
            deps.set(b, bd);
          }
          bd.add(sys.name);
        }
      }
    }
    deps.set(sys.name, d);
  }

  const visited = new Set<string>();
  const result: SystemDefinition[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const d = deps.get(name);
    if (d) {
      for (const dep of d) {
        visit(dep);
      }
    }
    const sys = nameMap.get(name);
    if (sys) result.push(sys);
  }

  for (const sys of systems) {
    visit(sys.name);
  }

  return result;
}
