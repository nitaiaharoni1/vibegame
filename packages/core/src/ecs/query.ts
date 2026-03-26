import type { World, EntityId } from "./world.js";
import type { ComponentDef } from "./component.js";

// Special component names for built-in features
const TAGS_COMPONENT = "__tags__";
const NAME_COMPONENT = "__name__";

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function query(world: World, components: ComponentDef[]): EntityId[] {
  const result: EntityId[] = [];
  for (const eid of world.entities) {
    if (components.every((def) => world.components.get(def.name)?.has(eid))) {
      result.push(eid);
    }
  }
  return result;
}

export function queryFirst(
  world: World,
  components: ComponentDef[]
): EntityId | undefined {
  for (const eid of world.entities) {
    if (components.every((def) => world.components.get(def.name)?.has(eid))) {
      return eid;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tag support
// ---------------------------------------------------------------------------

function getTagsStore(world: World): Map<EntityId, Record<string, unknown>> {
  let store = world.components.get(TAGS_COMPONENT);
  if (!store) {
    store = new Map();
    world.components.set(TAGS_COMPONENT, store);
  }
  return store;
}

function getTagsForEntity(world: World, eid: EntityId): Set<string> {
  const store = getTagsStore(world);
  const raw = store.get(eid) as { tags: Set<string> } | undefined;
  if (!raw) return new Set();
  return raw.tags;
}

export function addTag(world: World, eid: EntityId, tag: string): void {
  const store = getTagsStore(world);
  let raw = store.get(eid) as { tags: Set<string> } | undefined;
  if (!raw) {
    raw = { tags: new Set() };
    store.set(eid, raw as unknown as Record<string, unknown>);
  }
  raw.tags.add(tag);
}

export function removeTag(world: World, eid: EntityId, tag: string): void {
  const store = getTagsStore(world);
  const raw = store.get(eid) as { tags: Set<string> } | undefined;
  raw?.tags.delete(tag);
}

export function hasTag(world: World, eid: EntityId, tag: string): boolean {
  return getTagsForEntity(world, eid).has(tag);
}

export function queryTag(world: World, tag: string): EntityId[] {
  const store = getTagsStore(world);
  const result: EntityId[] = [];
  for (const [eid, raw] of store) {
    const r = raw as unknown as { tags: Set<string> };
    if (r.tags?.has(tag)) result.push(eid);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Name support
// ---------------------------------------------------------------------------

function getNameStore(world: World): Map<EntityId, Record<string, unknown>> {
  let store = world.components.get(NAME_COMPONENT);
  if (!store) {
    store = new Map();
    world.components.set(NAME_COMPONENT, store);
  }
  return store;
}

export function setEntityName(world: World, eid: EntityId, name: string): void {
  const store = getNameStore(world);
  store.set(eid, { name } as unknown as Record<string, unknown>);
}

export function getEntityName(world: World, eid: EntityId): string | undefined {
  const store = getNameStore(world);
  const raw = store.get(eid) as { name: string } | undefined;
  return raw?.name;
}

export function queryName(world: World, name: string): EntityId | undefined {
  const store = getNameStore(world);
  for (const [eid, raw] of store) {
    const r = raw as unknown as { name: string };
    if (r.name === name) return eid;
  }
  return undefined;
}
