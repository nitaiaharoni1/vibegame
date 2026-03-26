import { describe, it, expect, vi } from "vitest";
import {
  createWorld,
  addEntity,
  removeEntity,
  hasEntity,
  getAllEntities,
  defineComponent,
  addComponent,
  getComponent,
  hasComponent,
  setComponent,
  removeComponent,
  getAllComponentsOnEntity,
  getComponentSchemas,
  Type,
  query,
  queryFirst,
  addTag,
  removeTag,
  hasTag,
  queryTag,
  setEntityName,
  getEntityName,
  queryName,
  defineEvent,
  emit,
  on,
  off,
  definePrefab,
  instantiatePrefab,
  registerPrefab,
  getPrefab,
  listPrefabs,
  defineSystem,
  addSystem,
  Phase,
  stepWorld,
  buildSchemaRegistry,
  registerPlugin,
} from "../index.js";
import type { VibePlugin } from "../index.js";

// ---------------------------------------------------------------------------
// Entity tests
// ---------------------------------------------------------------------------

describe("Entity", () => {
  it("addEntity creates a unique entity", () => {
    const world = createWorld();
    const e1 = addEntity(world);
    const e2 = addEntity(world);
    expect(e1).not.toBe(e2);
    expect(hasEntity(world, e1)).toBe(true);
    expect(hasEntity(world, e2)).toBe(true);
  });

  it("removeEntity removes the entity and its components", () => {
    const world = createWorld();
    const Position = defineComponent("Position", {
      x: Type.Number({ default: 0 }),
      y: Type.Number({ default: 0 }),
    });

    const eid = addEntity(world);
    addComponent(world, eid, Position, { x: 5, y: 10 });

    removeEntity(world, eid);

    expect(hasEntity(world, eid)).toBe(false);
    expect(getComponent(world, eid, Position)).toBeUndefined();
  });

  it("getAllEntities returns all living entities", () => {
    const world = createWorld();
    const e1 = addEntity(world);
    const e2 = addEntity(world);
    const e3 = addEntity(world);
    removeEntity(world, e2);

    const all = getAllEntities(world);
    expect(all).toContain(e1);
    expect(all).toContain(e3);
    expect(all).not.toContain(e2);
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe("Component", () => {
  it("defineComponent creates a component with correct defaults", () => {
    const Health = defineComponent("Health", {
      current: Type.Number({ default: 100 }),
      max: Type.Number({ default: 100 }),
      regen: Type.Number({ default: 1, min: 0, max: 10 }),
    });

    expect(Health.name).toBe("Health");
    const defaults = Health.defaults();
    expect(defaults.current).toBe(100);
    expect(defaults.max).toBe(100);
    expect(defaults.regen).toBe(1);
  });

  it("defineComponent generates a valid JSON Schema", () => {
    const Transform = defineComponent("Transform", {
      position: Type.Vec3({ default: [0, 0, 0] }),
      rotation: Type.Quaternion(),
      scale: Type.Vec3({ default: [1, 1, 1] }),
    });

    const schema = Transform.jsonSchema as Record<string, unknown>;
    expect(schema.$schema).toContain("json-schema");
    expect(schema.type).toBe("object");
    const props = schema.properties as Record<string, unknown>;
    expect(props.position).toBeDefined();
    expect(props.rotation).toBeDefined();
    expect((props.rotation as Record<string, unknown>).description).toContain("Quaternion");
  });

  it("addComponent with defaults", () => {
    const world = createWorld();
    const Velocity = defineComponent("Velocity", {
      vx: Type.Number(),
      vy: Type.Number(),
    });

    const eid = addEntity(world);
    const data = addComponent(world, eid, Velocity);

    expect(data.vx).toBe(0);
    expect(data.vy).toBe(0);
    expect(hasComponent(world, eid, Velocity)).toBe(true);
  });

  it("addComponent with partial data overrides defaults", () => {
    const world = createWorld();
    const Stats = defineComponent("Stats", {
      hp: Type.Number({ default: 100 }),
      mp: Type.Number({ default: 50 }),
    });

    const eid = addEntity(world);
    addComponent(world, eid, Stats, { hp: 200 });

    const got = getComponent(world, eid, Stats);
    expect(got?.hp).toBe(200);
    expect(got?.mp).toBe(50);
  });

  it("getComponent returns undefined for missing component", () => {
    const world = createWorld();
    const Foo = defineComponent("Foo", { x: Type.Number() });
    const eid = addEntity(world);
    expect(getComponent(world, eid, Foo)).toBeUndefined();
  });

  it("setComponent merges partial data", () => {
    const world = createWorld();
    const Pos = defineComponent("Pos", {
      x: Type.Number({ default: 0 }),
      y: Type.Number({ default: 0 }),
    });

    const eid = addEntity(world);
    addComponent(world, eid, Pos, { x: 1, y: 2 });
    setComponent(world, eid, Pos, { x: 99 });

    const got = getComponent(world, eid, Pos);
    expect(got?.x).toBe(99);
    expect(got?.y).toBe(2);
  });

  it("removeComponent removes only that component", () => {
    const world = createWorld();
    const A = defineComponent("A", { v: Type.Number() });
    const B = defineComponent("B", { v: Type.Number() });

    const eid = addEntity(world);
    addComponent(world, eid, A);
    addComponent(world, eid, B);

    removeComponent(world, eid, A);

    expect(hasComponent(world, eid, A)).toBe(false);
    expect(hasComponent(world, eid, B)).toBe(true);
  });

  it("getAllComponentsOnEntity lists all components on entity", () => {
    const world = createWorld();
    const X = defineComponent("X", { v: Type.Number() });
    const Y = defineComponent("Y", { v: Type.Number() });

    const eid = addEntity(world);
    addComponent(world, eid, X);
    addComponent(world, eid, Y);

    const all = getAllComponentsOnEntity(world, eid);
    const names = all.map((c) => c.name);
    expect(names).toContain("X");
    expect(names).toContain("Y");
  });

  it("getComponentSchemas returns JSON schemas for registered components", () => {
    const world = createWorld();
    const C = defineComponent("SchemaTest", { x: Type.Number() });

    const eid = addEntity(world);
    addComponent(world, eid, C);

    const schemas = getComponentSchemas(world);
    expect(schemas["SchemaTest"]).toBeDefined();
    expect((schemas["SchemaTest"] as Record<string, unknown>).type).toBe("object");
  });

  it("Type.Enum creates enum field with correct schema", () => {
    const Dir = defineComponent("Direction", {
      facing: Type.Enum(["north", "south", "east", "west"]),
    });

    const schema = Dir.jsonSchema as { properties: Record<string, unknown> };
    expect((schema.properties.facing as Record<string, unknown>).enum).toEqual([
      "north", "south", "east", "west",
    ]);
    expect(Dir.defaults().facing).toBe("north");
  });

  it("Type.Object creates nested object", () => {
    const Config = defineComponent("Config", {
      bounds: Type.Object({ width: Type.Number({ default: 800 }), height: Type.Number({ default: 600 }) }),
    });

    const defaults = Config.defaults();
    expect(defaults.bounds.width).toBe(800);
    expect(defaults.bounds.height).toBe(600);
  });

  it("Type.Array creates array field", () => {
    const Inventory = defineComponent("Inventory", {
      items: Type.Array(Type.Number()),
    });

    const defaults = Inventory.defaults();
    expect(Array.isArray(defaults.items)).toBe(true);
    expect(defaults.items).toHaveLength(0);
  });

  it("Type.Ref creates reference field", () => {
    const Parent = defineComponent("Parent", {
      eid: Type.Ref(),
    });

    const defaults = Parent.defaults();
    expect(defaults.eid).toBe(-1);

    const schema = Parent.jsonSchema as { properties: Record<string, unknown> };
    expect((schema.properties.eid as Record<string, unknown>).type).toBe("integer");
  });
});

// ---------------------------------------------------------------------------
// Query tests
// ---------------------------------------------------------------------------

describe("Query", () => {
  it("query returns entities with all listed components", () => {
    const world = createWorld();
    const Pos = defineComponent("QPos", { x: Type.Number() });
    const Vel = defineComponent("QVel", { vx: Type.Number() });

    const e1 = addEntity(world);
    addComponent(world, e1, Pos);
    addComponent(world, e1, Vel);

    const e2 = addEntity(world);
    addComponent(world, e2, Pos);
    // e2 has no Vel

    const results = query(world, [Pos, Vel]);
    expect(results).toContain(e1);
    expect(results).not.toContain(e2);
  });

  it("queryFirst returns first matching entity", () => {
    const world = createWorld();
    const Tag = defineComponent("QFirstTag", { active: Type.Boolean({ default: true }) });

    const e1 = addEntity(world);
    addComponent(world, e1, Tag);

    const result = queryFirst(world, [Tag]);
    expect(result).toBe(e1);
  });

  it("queryFirst returns undefined when no match", () => {
    const world = createWorld();
    const Missing = defineComponent("QMissing", { v: Type.Number() });
    const result = queryFirst(world, [Missing]);
    expect(result).toBeUndefined();
  });

  it("tag system works correctly", () => {
    const world = createWorld();
    const eid = addEntity(world);

    addTag(world, eid, "player");
    addTag(world, eid, "alive");

    expect(hasTag(world, eid, "player")).toBe(true);
    expect(hasTag(world, eid, "alive")).toBe(true);
    expect(hasTag(world, eid, "enemy")).toBe(false);

    removeTag(world, eid, "alive");
    expect(hasTag(world, eid, "alive")).toBe(false);
  });

  it("queryTag returns all entities with tag", () => {
    const world = createWorld();
    const e1 = addEntity(world);
    const e2 = addEntity(world);
    const e3 = addEntity(world);

    addTag(world, e1, "enemy");
    addTag(world, e2, "enemy");
    addTag(world, e3, "player");

    const enemies = queryTag(world, "enemy");
    expect(enemies).toContain(e1);
    expect(enemies).toContain(e2);
    expect(enemies).not.toContain(e3);
  });

  it("entity names work correctly", () => {
    const world = createWorld();
    const eid = addEntity(world);
    setEntityName(world, eid, "hero");

    expect(getEntityName(world, eid)).toBe("hero");
    expect(queryName(world, "hero")).toBe(eid);
    expect(queryName(world, "nonexistent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Event bus tests
// ---------------------------------------------------------------------------

describe("Event bus", () => {
  it("emit calls registered handlers with correct payload", () => {
    const world = createWorld();
    const PlayerDied = defineEvent<{ playerId: number; score: number }>("PlayerDied");

    const handler = vi.fn();
    on(world, PlayerDied, handler);
    emit(world, PlayerDied, { playerId: 42, score: 1000 });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ playerId: 42, score: 1000 });
  });

  it("unsubscribe stops handler from being called", () => {
    const world = createWorld();
    const Tick = defineEvent<{ dt: number }>("Tick");

    const handler = vi.fn();
    const unsub = on(world, Tick, handler);

    emit(world, Tick, { dt: 0.016 });
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    emit(world, Tick, { dt: 0.016 });
    expect(handler).toHaveBeenCalledOnce(); // still 1
  });

  it("off removes a specific handler", () => {
    const world = createWorld();
    const GameStart = defineEvent<void>("GameStart");

    const h1 = vi.fn();
    const h2 = vi.fn();

    on(world, GameStart, h1);
    on(world, GameStart, h2);

    off(world, GameStart, h1);
    emit(world, GameStart, undefined);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("emit on event with no handlers does not throw", () => {
    const world = createWorld();
    const Silent = defineEvent<string>("Silent");
    expect(() => emit(world, Silent, "hello")).not.toThrow();
  });

  it("multiple handlers receive the same event", () => {
    const world = createWorld();
    const Boom = defineEvent<{ x: number }>("Boom");

    const results: number[] = [];
    on(world, Boom, (p) => results.push(p.x));
    on(world, Boom, (p) => results.push(p.x * 2));

    emit(world, Boom, { x: 5 });
    expect(results).toEqual([5, 10]);
  });
});

// ---------------------------------------------------------------------------
// Prefab tests
// ---------------------------------------------------------------------------

describe("Prefab", () => {
  const EnemyPos = defineComponent("EnemyPos", {
    x: Type.Number({ default: 0 }),
    y: Type.Number({ default: 0 }),
  });
  const EnemyHealth = defineComponent("EnemyHealth", {
    current: Type.Number({ default: 50 }),
    max: Type.Number({ default: 50 }),
  });

  const EnemyPrefab = definePrefab("Enemy", {
    components: [
      { def: EnemyPos, data: { x: 0, y: 0 } },
      { def: EnemyHealth },
    ],
    tags: ["enemy", "hostile"],
  });

  it("definePrefab creates a named prefab", () => {
    expect(EnemyPrefab.name).toBe("Enemy");
    expect(EnemyPrefab.components).toHaveLength(2);
    expect(EnemyPrefab.tags).toContain("enemy");
  });

  it("instantiatePrefab creates entity with all components", () => {
    const world = createWorld();
    const eid = instantiatePrefab(world, EnemyPrefab);

    expect(hasEntity(world, eid)).toBe(true);
    expect(hasComponent(world, eid, EnemyPos)).toBe(true);
    expect(hasComponent(world, eid, EnemyHealth)).toBe(true);
    expect(hasTag(world, eid, "enemy")).toBe(true);
    expect(hasTag(world, eid, "hostile")).toBe(true);
  });

  it("instantiatePrefab applies component data overrides", () => {
    const world = createWorld();
    const eid = instantiatePrefab(world, EnemyPrefab, {
      EnemyPos: { x: 100, y: 200 },
    });

    const pos = getComponent(world, eid, EnemyPos);
    expect(pos?.x).toBe(100);
    expect(pos?.y).toBe(200);
  });

  it("instantiatePrefab uses component defaults when no override", () => {
    const world = createWorld();
    const eid = instantiatePrefab(world, EnemyPrefab);

    const health = getComponent(world, eid, EnemyHealth);
    expect(health?.current).toBe(50);
    expect(health?.max).toBe(50);
  });

  it("registerPrefab and getPrefab work", () => {
    const world = createWorld();
    registerPrefab(world, EnemyPrefab);

    const found = getPrefab(world, "Enemy");
    expect(found).toBe(EnemyPrefab);

    expect(listPrefabs(world)).toContain("Enemy");
  });

  it("getPrefab returns undefined for unknown prefab", () => {
    const world = createWorld();
    expect(getPrefab(world, "Unknown")).toBeUndefined();
  });

  it("multiple instantiations produce separate entities", () => {
    const world = createWorld();
    const e1 = instantiatePrefab(world, EnemyPrefab);
    const e2 = instantiatePrefab(world, EnemyPrefab);

    expect(e1).not.toBe(e2);

    // Mutate one, other should be unaffected
    const pos1 = getComponent(world, e1, EnemyPos);
    if (pos1) pos1.x = 999;

    const pos2 = getComponent(world, e2, EnemyPos);
    expect(pos2?.x).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// System + stepWorld tests
// ---------------------------------------------------------------------------

describe("System", () => {
  it("defineSystem + addSystem + stepWorld executes systems in phase order", () => {
    const world = createWorld();
    const order: string[] = [];

    const sysA = defineSystem({
      name: "PostSys",
      phase: Phase.PostUpdate,
      execute: () => { order.push("post"); },
    });

    const sysB = defineSystem({
      name: "PreSys",
      phase: Phase.PreUpdate,
      execute: () => { order.push("pre"); },
    });

    const sysC = defineSystem({
      name: "UpdateSys",
      phase: Phase.Update,
      execute: () => { order.push("update"); },
    });

    addSystem(world, sysA);
    addSystem(world, sysB);
    addSystem(world, sysC);

    stepWorld(world, 0.016);

    expect(order).toEqual(["pre", "update", "post"]);
  });

  it("system receives correct delta", () => {
    const world = createWorld();
    let receivedDelta = 0;

    addSystem(world, defineSystem({
      name: "DeltaSys",
      phase: Phase.Update,
      execute: (_w, dt) => { receivedDelta = dt; },
    }));

    stepWorld(world, 0.123);
    expect(receivedDelta).toBeCloseTo(0.123);
  });
});

// ---------------------------------------------------------------------------
// getAllComponentsOnEntity
// ---------------------------------------------------------------------------

describe("getAllComponentsOnEntity", () => {
  it("does not expose internal __tags__ or __name__ components", () => {
    const world = createWorld();
    const eid = addEntity(world);
    const Pos = defineComponent("InspectPos", { x: Type.Number() });
    addComponent(world, eid, Pos);
    addTag(world, eid, "player");
    setEntityName(world, eid, "Hero");

    const all = getAllComponentsOnEntity(world, eid);
    const names = all.map((c) => c.name);
    expect(names).toContain("InspectPos");
    expect(names).not.toContain("__tags__");
    expect(names).not.toContain("__name__");
  });
});

// ---------------------------------------------------------------------------
// stepWorld error isolation
// ---------------------------------------------------------------------------

describe("stepWorld error isolation", () => {
  it("continues executing remaining systems if one throws", () => {
    const world = createWorld();
    const order: string[] = [];

    addSystem(world, defineSystem({
      name: "Good1",
      phase: Phase.Update,
      execute: () => { order.push("good1"); },
    }));
    addSystem(world, defineSystem({
      name: "Bad",
      phase: Phase.Update,
      after: ["Good1"],
      execute: () => { throw new Error("system crash"); },
    }));
    addSystem(world, defineSystem({
      name: "Good2",
      phase: Phase.Update,
      after: ["Bad"],
      execute: () => { order.push("good2"); },
    }));

    // Should not throw, and Good2 should still run
    expect(() => stepWorld(world, 0.016)).not.toThrow();
    expect(order).toEqual(["good1", "good2"]);
  });
});

// ---------------------------------------------------------------------------
// System ordering — after/before constraints and cycle detection
// ---------------------------------------------------------------------------

describe("System ordering", () => {
  it("respects after constraints within a phase", () => {
    const world = createWorld();
    const order: string[] = [];

    addSystem(world, defineSystem({
      name: "C",
      phase: Phase.Update,
      after: ["B"],
      execute: () => { order.push("C"); },
    }));
    addSystem(world, defineSystem({
      name: "B",
      phase: Phase.Update,
      after: ["A"],
      execute: () => { order.push("B"); },
    }));
    addSystem(world, defineSystem({
      name: "A",
      phase: Phase.Update,
      execute: () => { order.push("A"); },
    }));

    stepWorld(world, 0.016);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("respects before constraints within a phase", () => {
    const world = createWorld();
    const order: string[] = [];

    addSystem(world, defineSystem({
      name: "Last",
      phase: Phase.Update,
      execute: () => { order.push("Last"); },
    }));
    addSystem(world, defineSystem({
      name: "First",
      phase: Phase.Update,
      before: ["Last"],
      execute: () => { order.push("First"); },
    }));

    stepWorld(world, 0.016);
    expect(order).toEqual(["First", "Last"]);
  });

  it("throws on circular system dependencies", () => {
    const world = createWorld();

    addSystem(world, defineSystem({
      name: "Alpha",
      phase: Phase.Update,
      after: ["Beta"],
      execute: () => {},
    }));

    expect(() =>
      addSystem(world, defineSystem({
        name: "Beta",
        phase: Phase.Update,
        after: ["Alpha"],
        execute: () => {},
      }))
    ).toThrow(/circular/i);
  });

  it("registerPlugin systems are also topo-sorted", () => {
    const world = createWorld();
    const order: string[] = [];

    const plugin: VibePlugin = {
      name: "TestPlugin",
      setup() {},
      systems() {
        return [
          defineSystem({
            name: "P_Second",
            phase: Phase.Update,
            after: ["P_First"],
            execute: () => { order.push("second"); },
          }),
          defineSystem({
            name: "P_First",
            phase: Phase.Update,
            execute: () => { order.push("first"); },
          }),
        ];
      },
    };

    registerPlugin(world, plugin);
    stepWorld(world, 0.016);
    expect(order).toEqual(["first", "second"]);
  });
});

// ---------------------------------------------------------------------------
// Schema registry
// ---------------------------------------------------------------------------

describe("buildSchemaRegistry", () => {
  it("returns component schemas and version", () => {
    const world = createWorld();
    const Comp = defineComponent("RegistryComp", { value: Type.Number({ default: 42 }) });
    const eid = addEntity(world);
    addComponent(world, eid, Comp);

    const registry = buildSchemaRegistry(world);
    expect(registry.version).toBe("0.1.0");
    expect(registry.components["RegistryComp"]).toBeDefined();
    const schema = registry.components["RegistryComp"] as Record<string, unknown>;
    expect(schema.type).toBe("object");
  });
});
