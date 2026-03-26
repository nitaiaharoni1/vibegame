import type { World } from "./world.js";
import type { EntityId } from "./world.js";

// ---------------------------------------------------------------------------
// TypeDef primitives
// ---------------------------------------------------------------------------

export type TypeDefKind =
  | "number"
  | "string"
  | "boolean"
  | "vec2"
  | "vec3"
  | "vec4"
  | "quaternion"
  | "array"
  | "object"
  | "enum"
  | "ref";

export interface NumberTypeDef {
  kind: "number";
  default?: number;
  min?: number;
  max?: number;
}
export interface StringTypeDef {
  kind: "string";
  default?: string;
}
export interface BooleanTypeDef {
  kind: "boolean";
  default?: boolean;
}
export interface VecTypeDef {
  kind: "vec2" | "vec3" | "vec4" | "quaternion";
  default?: number[];
}
export interface ArrayTypeDef {
  kind: "array";
  items: TypeDef;
}
export interface ObjectTypeDef {
  kind: "object";
  shape: Record<string, TypeDef>;
}
export interface EnumTypeDef {
  kind: "enum";
  values: string[];
  default?: string;
}
export interface RefTypeDef {
  kind: "ref";
}

export type TypeDef =
  | NumberTypeDef
  | StringTypeDef
  | BooleanTypeDef
  | VecTypeDef
  | ArrayTypeDef
  | ObjectTypeDef
  | EnumTypeDef
  | RefTypeDef;

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

type InferTypeDef<T extends TypeDef> = T extends NumberTypeDef
  ? number
  : T extends StringTypeDef
  ? string
  : T extends BooleanTypeDef
  ? boolean
  : T extends { kind: "vec2" }
  ? [number, number]
  : T extends { kind: "vec3" }
  ? [number, number, number]
  : T extends { kind: "vec4" | "quaternion" }
  ? [number, number, number, number]
  : T extends ArrayTypeDef
  ? InferTypeDef<T["items"]>[]
  : T extends ObjectTypeDef
  ? { [K in keyof T["shape"]]: InferTypeDef<T["shape"][K]> }
  : T extends EnumTypeDef
  ? T["values"][number]
  : T extends RefTypeDef
  ? number
  : never;

export type Infer<T extends Record<string, TypeDef>> = {
  [K in keyof T]: InferTypeDef<T[K]>;
};

// ---------------------------------------------------------------------------
// Type builders
// ---------------------------------------------------------------------------

export const Type = {
  Number(opts?: { default?: number; min?: number; max?: number }): NumberTypeDef {
    return { kind: "number", ...opts };
  },
  String(opts?: { default?: string }): StringTypeDef {
    return { kind: "string", ...opts };
  },
  Boolean(opts?: { default?: boolean }): BooleanTypeDef {
    return { kind: "boolean", ...opts };
  },
  Vec2(opts?: { default?: [number, number] }): VecTypeDef {
    return opts?.default !== undefined
      ? { kind: "vec2", default: opts.default }
      : { kind: "vec2" };
  },
  Vec3(opts?: { default?: [number, number, number] }): VecTypeDef {
    return opts?.default !== undefined
      ? { kind: "vec3", default: opts.default }
      : { kind: "vec3" };
  },
  Vec4(opts?: { default?: [number, number, number, number] }): VecTypeDef {
    return opts?.default !== undefined
      ? { kind: "vec4", default: opts.default }
      : { kind: "vec4" };
  },
  Quaternion(opts?: { default?: [number, number, number, number] }): VecTypeDef {
    return opts?.default !== undefined
      ? { kind: "quaternion", default: opts.default }
      : { kind: "quaternion" };
  },
  Array<T extends TypeDef>(itemType: T): ArrayTypeDef {
    return { kind: "array", items: itemType };
  },
  Object<T extends Record<string, TypeDef>>(shape: T): ObjectTypeDef {
    return { kind: "object", shape };
  },
  Enum<T extends string>(values: T[]): EnumTypeDef {
    return { kind: "enum", values };
  },
  Ref(): RefTypeDef {
    return { kind: "ref" };
  },
} as const;

// ---------------------------------------------------------------------------
// JSON Schema generation
// ---------------------------------------------------------------------------

function typeDefToJsonSchema(def: TypeDef): object {
  switch (def.kind) {
    case "number": {
      const schema: Record<string, unknown> = { type: "number" };
      if (def.default !== undefined) schema["default"] = def.default;
      if (def.min !== undefined) schema["minimum"] = def.min;
      if (def.max !== undefined) schema["maximum"] = def.max;
      return schema;
    }
    case "string": {
      const schema: Record<string, unknown> = { type: "string" };
      if (def.default !== undefined) schema["default"] = def.default;
      return schema;
    }
    case "boolean": {
      const schema: Record<string, unknown> = { type: "boolean" };
      if (def.default !== undefined) schema["default"] = def.default;
      return schema;
    }
    case "vec2":
      return {
        type: "array",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
        default: def.default ?? [0, 0],
      };
    case "vec3":
      return {
        type: "array",
        items: { type: "number" },
        minItems: 3,
        maxItems: 3,
        default: def.default ?? [0, 0, 0],
      };
    case "vec4":
      return {
        type: "array",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
        default: def.default ?? [0, 0, 0, 0],
      };
    case "quaternion":
      return {
        type: "array",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
        default: def.default ?? [0, 0, 0, 1],
        description: "Quaternion [x, y, z, w]",
      };
    case "array":
      return {
        type: "array",
        items: typeDefToJsonSchema(def.items),
      };
    case "object": {
      const properties: Record<string, object> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(def.shape)) {
        properties[key] = typeDefToJsonSchema(val);
        required.push(key);
      }
      return { type: "object", properties, required };
    }
    case "enum": {
      const schema: Record<string, unknown> = { type: "string", enum: def.values };
      if (def.default !== undefined) schema["default"] = def.default;
      return schema;
    }
    case "ref":
      return { type: "integer", description: "EntityId reference" };
  }
}

function schemaToJsonSchema(schema: Record<string, TypeDef>): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];
  for (const [key, def] of Object.entries(schema)) {
    properties[key] = typeDefToJsonSchema(def);
    required.push(key);
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Default value generation
// ---------------------------------------------------------------------------

function typeDefDefault(def: TypeDef): unknown {
  switch (def.kind) {
    case "number":
      return def.default ?? 0;
    case "string":
      return def.default ?? "";
    case "boolean":
      return def.default ?? false;
    case "vec2":
      return def.default ? [...def.default] : [0, 0];
    case "vec3":
      return def.default ? [...def.default] : [0, 0, 0];
    case "vec4":
      return def.default ? [...def.default] : [0, 0, 0, 0];
    case "quaternion":
      return def.default ? [...def.default] : [0, 0, 0, 1];
    case "array":
      return [];
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(def.shape)) {
        obj[key] = typeDefDefault(val);
      }
      return obj;
    }
    case "enum":
      return def.default ?? def.values[0];
    case "ref":
      return -1;
  }
}

function schemaDefaults<T extends Record<string, TypeDef>>(schema: T): Infer<T> {
  const result: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(schema)) {
    result[key] = typeDefDefault(def);
  }
  return result as Infer<T>;
}

// ---------------------------------------------------------------------------
// ComponentDef
// ---------------------------------------------------------------------------

export interface ComponentDef<T = unknown> {
  name: string;
  schema: Record<string, TypeDef>;
  jsonSchema: object;
  defaults: () => T;
}

export function defineComponent<T extends Record<string, TypeDef>>(
  name: string,
  schema: T
): ComponentDef<Infer<T>> {
  const jsonSchema = schemaToJsonSchema(schema);
  return {
    name,
    schema,
    jsonSchema,
    defaults: () => schemaDefaults(schema),
  };
}

// ---------------------------------------------------------------------------
// Component operations
// ---------------------------------------------------------------------------

function ensureStorage(world: World, name: string): Map<EntityId, Record<string, unknown>> {
  let store = world.components.get(name);
  if (!store) {
    store = new Map();
    world.components.set(name, store);
  }
  return store;
}

export function addComponent<T>(
  world: World,
  eid: EntityId,
  def: ComponentDef<T>,
  data?: Partial<T>
): T {
  // Register def for schema introspection
  if (!world.componentDefs.has(def.name)) {
    world.componentDefs.set(def.name, def as ComponentDef<unknown>);
  }
  const store = ensureStorage(world, def.name);
  const defaults = def.defaults();
  const merged = data ? { ...(defaults as Record<string, unknown>), ...(data as Record<string, unknown>) } : (defaults as Record<string, unknown>);
  store.set(eid, merged);
  return merged as T;
}

export function removeComponent(world: World, eid: EntityId, def: ComponentDef): void {
  world.components.get(def.name)?.delete(eid);
}

export function getComponent<T>(
  world: World,
  eid: EntityId,
  def: ComponentDef<T>
): T | undefined {
  return world.components.get(def.name)?.get(eid) as T | undefined;
}

export function hasComponent(world: World, eid: EntityId, def: ComponentDef): boolean {
  return world.components.get(def.name)?.has(eid) ?? false;
}

export function setComponent<T>(
  world: World,
  eid: EntityId,
  def: ComponentDef<T>,
  data: Partial<T>
): void {
  const store = world.components.get(def.name);
  if (!store?.has(eid)) {
    addComponent(world, eid, def, data);
    return;
  }
  const existing = store.get(eid)!;
  store.set(eid, { ...existing, ...(data as Record<string, unknown>) });
}

export function getAllComponentsOnEntity(
  world: World,
  eid: EntityId
): Array<{ name: string; data: unknown }> {
  const result: Array<{ name: string; data: unknown }> = [];
  for (const [name, store] of world.components) {
    // Skip internal bookkeeping components
    if (name.startsWith('__')) continue;
    if (store.has(eid)) {
      result.push({ name, data: store.get(eid) });
    }
  }
  return result;
}

export function getComponentSchemas(world: World): Record<string, object> {
  // We need to get the jsonSchema from registered component defs.
  // We store them in world.componentDefs (added to World type via augmentation).
  // For now, reconstruct from world.componentDefs if present, otherwise return empty.
  const defs = (world as unknown as { componentDefs?: Map<string, ComponentDef> }).componentDefs;
  if (!defs) return {};
  const result: Record<string, object> = {};
  for (const [name, def] of defs) {
    result[name] = def.jsonSchema;
  }
  return result;
}

export function getRegisteredComponents(world: World): string[] {
  return [...world.components.keys()];
}
