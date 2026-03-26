import type { World, EntityId, VibePlugin, SystemDefinition } from "../ecs/world.js";

export type { VibePlugin, SystemDefinition };

export type VGXTagHandler = (
  world: World,
  eid: EntityId,
  attrs: Record<string, string>
) => void;

export function registerPlugin(world: World, plugin: VibePlugin): void {
  if (world.plugins.find((p) => p.name === plugin.name)) return;

  // Check dependencies
  if (plugin.dependencies) {
    for (const dep of plugin.dependencies) {
      if (!world.plugins.find((p) => p.name === dep)) {
        throw new Error(
          `Plugin "${plugin.name}" depends on "${dep}" which is not yet registered.`
        );
      }
    }
  }

  world.plugins.push(plugin);
  plugin.setup(world);

  if (plugin.systems) {
    const systems = plugin.systems(world);
    for (const sys of systems) {
      // Import addSystem lazily to avoid circular issues
      world.systems.push(sys);
    }
    // Sort by phase
    world.systems.sort((a, b) => a.phase - b.phase);
  }
}
