#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import { execSync } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicImport = (id: string): Promise<any> => import(id);

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start vigame dev server' },
  args: {
    port: {
      type: 'string',
      alias: 'p',
      description: 'Port for Vite dev server',
      default: '5173',
    },
  },
  async run({ args }) {
    consola.start('Starting vigame dev server...');
    try {
      execSync(`npx vite --port ${args.port ?? '5173'}`, { stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  },
});

const mcp = defineCommand({
  meta: { name: 'mcp', description: 'Start vigame MCP server' },
  args: {
    port: {
      type: 'string',
      alias: 'p',
      description: 'WebSocket bridge port',
      default: '7777',
    },
  },
  async run({ args }) {
    process.env['VIGAME_BRIDGE_PORT'] = args.port ?? '7777';
    consola.start(`Starting vigame MCP server (bridge port: ${args.port ?? '7777'})...`);
    const { default: mcpServer } = await dynamicImport('@vigame/mcp/server');
    void mcpServer;
  },
});

const main = defineCommand({
  meta: { name: 'vigame', version: '0.1.0', description: 'vigame CLI' },
  subCommands: { dev, mcp },
});

runMain(main);
