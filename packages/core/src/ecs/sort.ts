import type { World, SystemDefinition } from "./world.js";

/**
 * Sort world.systems by phase, then within each phase by after/before constraints
 * using a topological sort. Throws on circular dependencies.
 */
export function sortSystems(world: World): void {
  // Group by phase
  const byPhase = new Map<number, SystemDefinition[]>();
  for (const sys of world.systems) {
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
  type Sys = SystemDefinition;
  const nameMap = new Map<string, Sys>(systems.map((s) => [s.name, s]));

  // Build dependency map: depMap[name] = set of names that must run before it
  const depMap = new Map<string, Set<string>>();
  for (const sys of systems) {
    const d = new Set<string>();
    if (sys.after) {
      for (const a of sys.after) {
        if (nameMap.has(a)) d.add(a);
      }
    }
    if (sys.before) {
      for (const b of sys.before) {
        if (nameMap.has(b)) {
          // b must run after sys → b depends on sys
          let bd = depMap.get(b);
          if (!bd) {
            bd = new Set();
            depMap.set(b, bd);
          }
          bd.add(sys.name);
        }
      }
    }
    // Merge: don't overwrite 'before'-injected deps already set above
    const existing = depMap.get(sys.name);
    if (existing) {
      for (const dep of d) existing.add(dep);
    } else {
      depMap.set(sys.name, d);
    }
  }

  const visited = new Set<string>();
  const result: Sys[] = [];

  function visit(name: string, chain: Set<string>): void {
    if (visited.has(name)) return;
    if (chain.has(name)) {
      const cycle = [...chain, name].join(" → ");
      throw new Error(
        `[vigame] Circular system dependency detected: ${cycle}`
      );
    }
    chain.add(name);
    const deps = depMap.get(name);
    if (deps) {
      for (const dep of deps) {
        visit(dep, chain);
      }
    }
    chain.delete(name);
    visited.add(name);
    const sys = nameMap.get(name);
    if (sys) result.push(sys);
  }

  for (const sys of systems) {
    visit(sys.name, new Set());
  }

  return result;
}
