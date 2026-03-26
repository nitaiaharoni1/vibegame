#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  controlPortFromBridgePort,
  DEFAULT_BRIDGE_PORT,
  resolveControlPortFromEnv,
} from '@vigame/protocol';
import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';

const dynamicImport = (id: string): Promise<unknown> => import(id);

// ─── bridge client ──────────────────────────────────────────────────────────

function controlPort(): number {
  return resolveControlPortFromEnv();
}

async function bridgeCall(action: string, payload?: unknown): Promise<unknown> {
  const port = controlPort();
  let res: Response;
  try {
    res = await fetch(`http://localhost:${port}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    throw new Error(`Cannot reach vigame bridge on port ${port}. Is "vigame start" running?`);
  }
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

function print(result: unknown): void {
  if (typeof result === 'string') {
    consola.log(result);
  } else {
    consola.log(JSON.stringify(result, null, 2));
  }
}

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    consola.error((e as Error).message);
    process.exit(1);
  }
}

// ─── dev ────────────────────────────────────────────────────────────────────

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the Vite dev server' },
  args: {
    port: { type: 'string', alias: 'p', description: 'Port for Vite dev server', default: '5173' },
  },
  async run({ args }) {
    consola.start('Starting dev server...');
    try {
      execSync(`npx vite --port ${args.port ?? '5173'}`, { stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  },
});

// ─── start (MCP server) ──────────────────────────────────────────────────────

const start = defineCommand({
  meta: { name: 'start', description: 'Start the vigame MCP + bridge server' },
  args: {
    port: {
      type: 'string',
      alias: 'p',
      description: 'WebSocket bridge port',
      default: String(DEFAULT_BRIDGE_PORT),
    },
  },
  async run({ args }) {
    const wsPort = Number(args.port ?? DEFAULT_BRIDGE_PORT);
    process.env.VIGAME_BRIDGE_PORT = String(wsPort);
    consola.start(
      `Starting vigame MCP server (game bridge: ${wsPort}, CLI control: ${controlPortFromBridgePort(wsPort)})...`,
    );
    await dynamicImport('@vigame/mcp/server');
  },
});

// ─── entity ─────────────────────────────────────────────────────────────────

const entity = defineCommand({
  meta: { name: 'entity', description: 'Manage entities in the running game' },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List all entities' },
      async run() {
        await run(async () => print(await bridgeCall('entity', { action: 'list' })));
      },
    }),
    find: defineCommand({
      meta: { name: 'find', description: 'Find an entity by name' },
      args: { name: { type: 'positional', description: 'Entity name', required: true } },
      async run({ args }) {
        await run(async () =>
          print(await bridgeCall('entity', { action: 'find', name: args.name })),
        );
      },
    }),
    create: defineCommand({
      meta: { name: 'create', description: 'Create a new entity' },
      args: {
        name: { type: 'positional', description: 'Entity name', required: true },
        tag: { type: 'string', description: 'Comma-separated tags' },
      },
      async run({ args }) {
        await run(async () => {
          const tags = args.tag ? (args.tag as string).split(',').map((t) => t.trim()) : [];
          await bridgeCall('entity', { action: 'create', name: args.name, tags });
          consola.success(`Entity "${args.name as string}" created`);
        });
      },
    }),
    delete: defineCommand({
      meta: { name: 'delete', description: 'Delete an entity' },
      args: { name: { type: 'positional', description: 'Entity name', required: true } },
      async run({ args }) {
        await run(async () => {
          await bridgeCall('entity', { action: 'delete', name: args.name });
          consola.success(`Entity "${args.name as string}" deleted`);
        });
      },
    }),
    clone: defineCommand({
      meta: { name: 'clone', description: 'Clone an entity' },
      args: {
        name: { type: 'positional', description: 'Source entity name', required: true },
        as: { type: 'string', description: 'Name for the cloned entity' },
      },
      async run({ args }) {
        await run(async () => {
          const result = await bridgeCall('entity', {
            action: 'clone',
            name: args.name,
            newName: args.as,
          });
          print(result);
          consola.success(`Entity "${args.name as string}" cloned`);
        });
      },
    }),
    rename: defineCommand({
      meta: { name: 'rename', description: 'Rename an entity' },
      args: {
        name: { type: 'positional', description: 'Current entity name', required: true },
        newName: { type: 'positional', description: 'New name', required: true },
      },
      async run({ args }) {
        await run(async () => {
          await bridgeCall('entity', { action: 'rename', name: args.name, newName: args.newName });
          consola.success(`Entity renamed to "${args.newName as string}"`);
        });
      },
    }),
  },
});

// ─── component ──────────────────────────────────────────────────────────────

const component = defineCommand({
  meta: { name: 'component', description: 'Manage entity components' },
  subCommands: {
    get: defineCommand({
      meta: { name: 'get', description: 'Get component data' },
      args: {
        entity: { type: 'positional', description: 'Entity name', required: true },
        component: { type: 'positional', description: 'Component type', required: true },
      },
      async run({ args }) {
        await run(async () =>
          print(
            await bridgeCall('component', {
              action: 'get',
              entityName: args.entity,
              component: args.component,
            }),
          ),
        );
      },
    }),
    set: defineCommand({
      meta: { name: 'set', description: 'Set component properties' },
      args: {
        entity: { type: 'positional', description: 'Entity name', required: true },
        component: { type: 'positional', description: 'Component type', required: true },
        props: { type: 'string', description: 'JSON props, e.g. \'{"x":1}\'', required: true },
      },
      async run({ args }) {
        await run(async () => {
          const props = JSON.parse(args.props as string) as Record<string, unknown>;
          await bridgeCall('component', {
            action: 'set',
            entityName: args.entity,
            component: args.component,
            props,
          });
          consola.success('Component updated');
        });
      },
    }),
    add: defineCommand({
      meta: { name: 'add', description: 'Add a component to an entity' },
      args: {
        entity: { type: 'positional', description: 'Entity name', required: true },
        component: { type: 'positional', description: 'Component type', required: true },
        props: { type: 'string', description: 'JSON initial props (optional)' },
      },
      async run({ args }) {
        await run(async () => {
          const props = args.props
            ? (JSON.parse(args.props as string) as Record<string, unknown>)
            : {};
          await bridgeCall('component', {
            action: 'add',
            entityName: args.entity,
            component: args.component,
            props,
          });
          consola.success(
            `Component "${args.component as string}" added to "${args.entity as string}"`,
          );
        });
      },
    }),
    remove: defineCommand({
      meta: { name: 'remove', description: 'Remove a component from an entity' },
      args: {
        entity: { type: 'positional', description: 'Entity name', required: true },
        component: { type: 'positional', description: 'Component type', required: true },
      },
      async run({ args }) {
        await run(async () => {
          await bridgeCall('component', {
            action: 'remove',
            entityName: args.entity,
            component: args.component,
          });
          consola.success(
            `Component "${args.component as string}" removed from "${args.entity as string}"`,
          );
        });
      },
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List all available component types' },
      async run() {
        await run(async () => print(await bridgeCall('component', { action: 'list_available' })));
      },
    }),
  },
});

// ─── transform ──────────────────────────────────────────────────────────────

function transformCmd(action: string, description: string) {
  return defineCommand({
    meta: { name: action, description },
    args: {
      entity: { type: 'positional', description: 'Entity name', required: true },
      x: { type: 'positional', description: 'X', required: true },
      y: { type: 'positional', description: 'Y', required: true },
      z: { type: 'positional', description: 'Z', required: true },
    },
    async run({ args }) {
      await run(async () => {
        await bridgeCall('transform', {
          action,
          entityName: args.entity,
          x: Number(args.x),
          y: Number(args.y),
          z: Number(args.z),
        });
        consola.success(`${description} applied to "${args.entity as string}"`);
      });
    },
  });
}

const transform = defineCommand({
  meta: { name: 'transform', description: 'Move, rotate, or scale entities' },
  subCommands: {
    position: transformCmd('set_position', 'Position'),
    rotation: transformCmd('set_rotation', 'Rotation'),
    scale: transformCmd('set_scale', 'Scale'),
    'look-at': transformCmd('look_at', 'Look-at'),
  },
});

// ─── query ──────────────────────────────────────────────────────────────────

const query = defineCommand({
  meta: { name: 'query', description: 'Find entities in the running game' },
  subCommands: {
    all: defineCommand({
      meta: { name: 'all', description: 'List all entities with their components' },
      async run() {
        await run(async () => print(await bridgeCall('query', { by: 'all' })));
      },
    }),
    component: defineCommand({
      meta: { name: 'component', description: 'Find entities that have a component' },
      args: { value: { type: 'positional', description: 'Component name', required: true } },
      async run({ args }) {
        await run(async () =>
          print(await bridgeCall('query', { by: 'component', value: args.value })),
        );
      },
    }),
    tag: defineCommand({
      meta: { name: 'tag', description: 'Find entities with a tag' },
      args: { value: { type: 'positional', description: 'Tag name', required: true } },
      async run({ args }) {
        await run(async () => print(await bridgeCall('query', { by: 'tag', value: args.value })));
      },
    }),
    name: defineCommand({
      meta: { name: 'name', description: 'Find an entity by name' },
      args: { value: { type: 'positional', description: 'Entity name', required: true } },
      async run({ args }) {
        await run(async () => print(await bridgeCall('query', { by: 'name', value: args.value })));
      },
    }),
  },
});

// ─── runtime ────────────────────────────────────────────────────────────────

function runtimeCmd(action: string, description: string) {
  return defineCommand({
    meta: { name: action, description },
    async run() {
      await run(async () => {
        await bridgeCall('runtime', { action });
        consola.success(`Runtime: ${action}`);
      });
    },
  });
}

const runtime = defineCommand({
  meta: { name: 'runtime', description: 'Control the game lifecycle' },
  subCommands: {
    play: runtimeCmd('play', 'Resume the game'),
    pause: runtimeCmd('pause', 'Pause the game'),
    step: runtimeCmd('step', 'Advance one frame'),
    stop: runtimeCmd('stop', 'Stop the game'),
    reset: runtimeCmd('reset', 'Reset the game to initial state'),
  },
});

// ─── inspect ────────────────────────────────────────────────────────────────

const inspect = defineCommand({
  meta: { name: 'inspect', description: 'Inspect the running game' },
  subCommands: {
    world: defineCommand({
      meta: { name: 'world', description: 'Dump full world state' },
      async run() {
        await run(async () => print(await bridgeCall('inspect', { action: 'world_state' })));
      },
    }),
    schemas: defineCommand({
      meta: { name: 'schemas', description: 'List all registered component schemas' },
      async run() {
        await run(async () => print(await bridgeCall('inspect', { action: 'schemas' })));
      },
    }),
    systems: defineCommand({
      meta: { name: 'systems', description: 'List all active systems and their phases' },
      async run() {
        await run(async () => print(await bridgeCall('inspect', { action: 'systems' })));
      },
    }),
    screenshot: defineCommand({
      meta: { name: 'screenshot', description: 'Take a screenshot of the running game' },
      args: {
        out: { type: 'string', alias: 'o', description: 'Output file (default: screenshot.png)' },
      },
      async run({ args }) {
        await run(async () => {
          const dataUrl = (await bridgeCall('inspect:screenshot', {})) as string;
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const outFile = (args.out as string | undefined) ?? 'screenshot.png';
          writeFileSync(outFile, Buffer.from(base64, 'base64'));
          consola.success(`Screenshot saved to ${outFile}`);
        });
      },
    }),
  },
});

// ─── main ────────────────────────────────────────────────────────────────────

const main = defineCommand({
  meta: { name: 'vigame', version: '0.1.0', description: 'vigame CLI' },
  subCommands: { dev, start, entity, component, transform, query, runtime, inspect },
});

runMain(main);
