import type { World, EntityId } from "./world.js";
import type { ComponentDef } from "./component.js";
import { addEntity } from "./entity.js";
import { addComponent } from "./component.js";
import { addTag, setEntityName } from "./query.js";

export interface PrefabDef {
  name: string;
  components: Array<{ def: ComponentDef; data?: Record<string, unknown> }>;
  tags?: string[];
}

export function definePrefab(
  name: string,
  def: Omit<PrefabDef, "name">
): PrefabDef {
  return { name, ...def };
}

export function instantiatePrefab(
  world: World,
  prefab: PrefabDef,
  overrides?: Record<string, Record<string, unknown>>
): EntityId {
  const eid = addEntity(world);

  for (const { def, data } of prefab.components) {
    const override = overrides?.[def.name];
    const merged = override ? { ...data, ...override } : data;
    addComponent(world, eid, def, merged as never);
  }

  if (prefab.tags) {
    for (const tag of prefab.tags) {
      addTag(world, eid, tag);
    }
  }

  return eid;
}

export function registerPrefab(world: World, prefab: PrefabDef): void {
  world.prefabs.set(prefab.name, prefab);
}

export function getPrefab(world: World, name: string): PrefabDef | undefined {
  return world.prefabs.get(name);
}

export function listPrefabs(world: World): string[] {
  return [...world.prefabs.keys()];
}

// Re-export setEntityName convenience so prefab users can name instances
export { setEntityName };
