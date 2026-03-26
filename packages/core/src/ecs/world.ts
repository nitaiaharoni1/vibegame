import type { ComponentDef } from "./component.js";
import { sortSystems } from "./sort.js";

export type EntityId = number;

export interface SystemDefinition {
  name: string;
  phase: number;
  after?: string[];
  before?: string[];
  execute(world: World, delta: number): void;
}

export interface VibePlugin {
  name: string;
  dependencies?: string[];
  setup(world: World): void;
  systems?(world: World): SystemDefinition[];
  teardown?(world: World): void;
  vgxTags?(): Record<string, (world: World, eid: EntityId, attrs: Record<string, string>) => void>;
}

export interface World {
  entities: Set<EntityId>;
  nextEntityId: number;
  components: Map<string, Map<EntityId, Record<string, unknown>>>;
  systems: SystemDefinition[];
  plugins: VibePlugin[];
  eventHandlers: Map<string, Set<(payload: unknown) => void>>;
  running: boolean;
  paused: boolean;
  lastTime: number;
  // Internal: registered component defs for schema introspection
  componentDefs: Map<string, ComponentDef>;
  // Internal: registered prefabs
  prefabs: Map<string, import("./prefab.js").PrefabDef>;
  // Internal: frame handle for loop cancellation
  _loopHandle: ReturnType<typeof setInterval> | number | null;
}

export function createWorld(config?: { plugins?: VibePlugin[] }): World {
  const world: World = {
    entities: new Set(),
    nextEntityId: 1,
    components: new Map(),
    systems: [],
    plugins: [],
    eventHandlers: new Map(),
    running: false,
    paused: false,
    lastTime: 0,
    componentDefs: new Map(),
    prefabs: new Map(),
    _loopHandle: null,
  };

  if (config?.plugins) {
    for (const plugin of config.plugins) {
      registerPluginInternal(world, plugin);
    }
  }

  return world;
}

// Deferred import to avoid circular dep — the plugin module calls registerPlugin
// which calls back here. We expose an internal version.
function registerPluginInternal(world: World, plugin: VibePlugin): void {
  if (world.plugins.find((p) => p.name === plugin.name)) return;

  // resolve dependencies first
  if (plugin.dependencies) {
    for (const dep of plugin.dependencies) {
      if (!world.plugins.find((p) => p.name === dep)) {
        throw new Error(
          `Plugin "${plugin.name}" depends on "${dep}" which is not registered.`
        );
      }
    }
  }

  world.plugins.push(plugin);
  plugin.setup(world);

  if (plugin.systems) {
    const systems = plugin.systems(world);
    for (const sys of systems) {
      world.systems.push(sys);
    }
    sortSystems(world);
  }
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

declare const requestAnimationFrame: ((cb: (time: number) => void) => number) | undefined;
declare const cancelAnimationFrame: ((handle: number) => void) | undefined;
declare const process: { versions?: { node?: string } } | undefined;

function isNode(): boolean {
  return typeof process !== "undefined" && process != null && process.versions != null && process.versions.node != null;
}

export function startWorld(world: World): void {
  if (world.running) return;
  world.running = true;
  world.paused = false;
  world.lastTime = isNode() ? Date.now() : performance.now();

  if (isNode()) {
    // ~60fps in Node
    const interval = setInterval(() => {
      if (!world.running) {
        clearInterval(interval);
        return;
      }
      if (world.paused) return;
      const now = Date.now();
      const delta = (now - world.lastTime) / 1000;
      world.lastTime = now;
      stepWorld(world, delta);
    }, 1000 / 60);
    world._loopHandle = interval;
  } else {
    // Browser: rAF loop
    const loop = (time: number) => {
      if (!world.running) return;
      if (!world.paused) {
        const delta = (time - world.lastTime) / 1000;
        world.lastTime = time;
        stepWorld(world, delta);
      }
      if (typeof requestAnimationFrame !== "undefined") {
        world._loopHandle = requestAnimationFrame(loop);
      }
    };
    if (typeof requestAnimationFrame !== "undefined") {
      world._loopHandle = requestAnimationFrame(loop);
    }
  }
}

export function stopWorld(world: World): void {
  world.running = false;
  if (world._loopHandle !== null) {
    if (isNode()) {
      clearInterval(world._loopHandle as ReturnType<typeof setInterval>);
    } else if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(world._loopHandle as number);
    }
    world._loopHandle = null;
  }
}

export function pauseWorld(world: World): void {
  world.paused = true;
}

export function resumeWorld(world: World): void {
  world.paused = false;
  world.lastTime = isNode() ? Date.now() : performance.now();
}

export function stepWorld(world: World, delta = 1 / 60): void {
  for (const system of world.systems) {
    try {
      system.execute(world, delta);
    } catch (err) {
      console.error(`[vigame] System "${system.name}" threw an error:`, err);
    }
  }
}
