import type { World, EntityId } from '@vigame/core';
import { addEntity, addTag, setEntityName } from '@vigame/core';
import type { VGXWorld, VGXPrefab } from './types.js';

type TagHandler = (world: World, eid: EntityId, attrs: Record<string, string>) => void;

/**
 * Collect all VGX tag handlers registered by plugins on this world.
 */
function collectTagHandlers(world: World): Map<string, TagHandler> {
  const handlers = new Map<string, TagHandler>();

  for (const plugin of world.plugins) {
    if (plugin.vgxTags) {
      for (const [tag, handler] of Object.entries(plugin.vgxTags())) {
        handlers.set(tag, handler);
      }
    }
  }

  // Also pick up any handlers registered manually on the world
  const worldExt = world as unknown as { vgxTagHandlers?: Map<string, TagHandler> };
  if (worldExt.vgxTagHandlers) {
    for (const [tag, handler] of worldExt.vgxTagHandlers) {
      handlers.set(tag, handler);
    }
  }

  return handlers;
}

/**
 * Apply a VGXPrefab's components to an already-created entity, merging in overrides.
 * Overrides are applied per-component: each key in overrides that matches a component
 * attribute replaces the prefab's default for that attribute.
 * If no transform component exists in the prefab, a transform is synthesised from overrides.
 */
function applyPrefabComponents(
  world: World,
  eid: EntityId,
  prefab: VGXPrefab,
  overrides: Record<string, string | number | boolean>,
  tagHandlers: Map<string, TagHandler>,
): void {
  let hasTransform = false;

  for (const comp of prefab.components) {
    if (comp.type === 'transform') hasTransform = true;

    const handler = tagHandlers.get(comp.type);
    if (!handler) {
      console.warn(
        `[vigame] No VGX tag handler for "<${comp.type}>" in prefab "${prefab.name}" — component skipped.`,
      );
      continue;
    }

    // Build attrs: start from prefab defaults, then merge overrides for transform-like attrs
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(comp.props)) {
      attrs[k] = String(v);
    }
    // Position/transform overrides (pos, x, y, rx, ry, rz, etc.) apply to transform component
    if (comp.type === 'transform') {
      for (const [k, v] of Object.entries(overrides)) {
        attrs[k] = String(v);
      }
    }
    handler(world, eid, attrs);
  }

  // If prefab has no transform, synthesise one from instance position overrides
  if (!hasTransform && Object.keys(overrides).length > 0) {
    const transformHandler = tagHandlers.get('transform');
    if (transformHandler) {
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(overrides)) {
        attrs[k] = String(v);
      }
      transformHandler(world, eid, attrs);
    }
  }
}

/**
 * Hydrate a parsed VGX world into an ECS World.
 *
 * Processes in order:
 * 1. Regular entities (in document order)
 * 2. Prefab instances (<instance prefab="..." />) using in-document prefab definitions
 */
export function hydrateScene(vgxWorld: VGXWorld, world: World): void {
  const tagHandlers = collectTagHandlers(world);

  // --- 1. Regular entities ---
  for (const vgxEntity of vgxWorld.entities) {
    const eid = addEntity(world);

    if (vgxEntity.name) setEntityName(world, eid, vgxEntity.name);
    for (const tag of vgxEntity.tags) addTag(world, eid, tag);

    for (const comp of vgxEntity.components) {
      const handler = tagHandlers.get(comp.type);
      if (handler) {
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(comp.props)) attrs[k] = String(v);
        handler(world, eid, attrs);
      } else {
        console.warn(
          `[vigame] No VGX tag handler for "<${comp.type}>" on entity "${vgxEntity.name ?? eid}" — ` +
          `component skipped. Make sure the plugin that handles this component is loaded.`,
        );
      }
    }
  }

  // --- 2. Prefab instances ---
  if (vgxWorld.instances.length > 0) {
    // Build quick lookup from the VGX prefab definitions in this scene
    const prefabMap = new Map<string, VGXPrefab>();
    for (const prefab of vgxWorld.prefabs) {
      if (prefab.name) prefabMap.set(prefab.name, prefab);
    }

    for (const instance of vgxWorld.instances) {
      const prefab = prefabMap.get(instance.prefab);
      if (!prefab) {
        console.warn(`[vigame] VGX instance references unknown prefab "${instance.prefab}" — skipped.`);
        continue;
      }

      const eid = addEntity(world);
      for (const tag of prefab.tags) addTag(world, eid, tag);
      applyPrefabComponents(world, eid, prefab, instance.overrides, tagHandlers);
    }
  }
}
