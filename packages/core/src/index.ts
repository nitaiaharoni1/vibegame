// ECS World
export {
  createWorld,
  startWorld,
  stopWorld,
  pauseWorld,
  resumeWorld,
  stepWorld,
} from "./ecs/world.js";
export type { World, EntityId, VibePlugin } from "./ecs/world.js";

// Entity
export { addEntity, removeEntity, hasEntity, getAllEntities } from "./ecs/entity.js";

// Component
export {
  Type,
  defineComponent,
  addComponent,
  removeComponent,
  getComponent,
  hasComponent,
  setComponent,
  getAllComponentsOnEntity,
  getComponentSchemas,
  getRegisteredComponents,
} from "./ecs/component.js";
export type {
  TypeDef,
  TypeDefKind,
  ComponentDef,
  Infer,
  NumberTypeDef,
  StringTypeDef,
  BooleanTypeDef,
  VecTypeDef,
  ArrayTypeDef,
  ObjectTypeDef,
  EnumTypeDef,
  RefTypeDef,
} from "./ecs/component.js";

// System
export { Phase, defineSystem, addSystem, removeSystem, sortSystems } from "./ecs/system.js";
export type { SystemDefinition } from "./ecs/system.js";

// Query
export {
  query,
  queryFirst,
  queryTag,
  queryName,
  addTag,
  removeTag,
  hasTag,
  getEntityName,
  setEntityName,
} from "./ecs/query.js";

// Prefab
export {
  definePrefab,
  instantiatePrefab,
  registerPrefab,
  getPrefab,
  listPrefabs,
} from "./ecs/prefab.js";
export type { PrefabDef } from "./ecs/prefab.js";

// Events
export { defineEvent, emit, on, off } from "./events/bus.js";
export type { EventDef } from "./events/bus.js";

// Plugin
export { registerPlugin } from "./plugin/plugin.js";
export type { VGXTagHandler } from "./plugin/plugin.js";

// Schema
export { buildSchemaRegistry } from "./schema/index.js";
