import type { World, EntityId } from '@vigame/core';
import { addEntity, addTag, setEntityName } from '@vigame/core';
import type { VGXWorld } from './types.js';

/**
 * Hydrate a parsed VGX world into an ECS World.
 *
 * The world must have VGX tag handlers registered (e.g. via ThreeRendererPlugin).
 * The handlers are registered via the VibePlugin.vgxTags() mechanism — plugins
 * call registerVgxTag() during setup, or the plugin's vgxTags() return value is
 * collected by this function via the plugins list.
 */
export function hydrateScene(vgxWorld: VGXWorld, world: World): void {
  // Collect all registered VGX tag handlers from plugins
  const tagHandlers = new Map<
    string,
    (world: World, eid: EntityId, attrs: Record<string, string>) => void
  >();

  for (const plugin of world.plugins) {
    if (plugin.vgxTags) {
      const tags = plugin.vgxTags();
      for (const [tag, handler] of Object.entries(tags)) {
        tagHandlers.set(tag, handler);
      }
    }
  }

  // Also check if the world has a vgxTagHandlers map (manually registered)
  const worldExt = world as unknown as {
    vgxTagHandlers?: Map<
      string,
      (world: World, eid: EntityId, attrs: Record<string, string>) => void
    >;
  };
  if (worldExt.vgxTagHandlers) {
    for (const [tag, handler] of worldExt.vgxTagHandlers) {
      tagHandlers.set(tag, handler);
    }
  }

  // Instantiate each entity
  for (const vgxEntity of vgxWorld.entities) {
    const eid = addEntity(world);

    if (vgxEntity.name) {
      setEntityName(world, eid, vgxEntity.name);
    }

    for (const tag of vgxEntity.tags) {
      addTag(world, eid, tag);
    }

    for (const comp of vgxEntity.components) {
      const handler = tagHandlers.get(comp.type);
      if (handler) {
        // Convert component props to Record<string, string> for the handler
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(comp.props)) {
          attrs[k] = String(v);
        }
        handler(world, eid, attrs);
      } else {
        // No handler registered for this tag; silently skip
      }
    }
  }
}
