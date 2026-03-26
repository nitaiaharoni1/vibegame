#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GameBridge } from './bridge.js';
import { SceneInputSchema, sceneTool } from './tools/scene.js';
import { EntityInputSchema, entityTool } from './tools/entity.js';
import { ComponentInputSchema, componentTool } from './tools/component.js';
import { TransformInputSchema, transformTool } from './tools/transform.js';
import { QueryInputSchema, queryTool } from './tools/query.js';
import { RuntimeInputSchema, runtimeTool } from './tools/runtime.js';
import { InspectInputSchema, inspectTool } from './tools/inspect.js';
import { VgxInputSchema, vgxTool } from './tools/vgx.js';

const BRIDGE_PORT = Number(process.env['VIGAME_BRIDGE_PORT'] ?? 7777);

async function main() {
  const bridge = new GameBridge(BRIDGE_PORT);

  bridge.on('connect', () => {
    process.stderr.write('[vigame-mcp] Game client connected\n');
  });
  bridge.on('disconnect', () => {
    process.stderr.write('[vigame-mcp] Game client disconnected\n');
  });

  const server = new McpServer({
    name: 'vigame',
    version: '0.1.0',
  });

  server.tool('scene', 'Load, save, clear, or inspect the current scene', SceneInputSchema.shape, async (input) => {
    const result = await sceneTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  server.tool('entity', 'Create, delete, clone, find, list, or rename entities', EntityInputSchema.shape, async (input) => {
    const result = await entityTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  server.tool('component', 'Add, remove, set, get, or list components on entities', ComponentInputSchema.shape, async (input) => {
    const result = await componentTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  server.tool('transform', 'Set position, rotation, scale, or look_at for an entity', TransformInputSchema.shape, async (input) => {
    const result = await transformTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  server.tool('query', 'Query entities by component, tag, name, or list all', QueryInputSchema.shape, async (input) => {
    const result = await queryTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  server.tool('runtime', 'Control game lifecycle: play, pause, step, stop, reset', RuntimeInputSchema.shape, async (input) => {
    const result = await runtimeTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  server.tool('inspect', 'Get screenshot, world state, component schemas, or active systems', InspectInputSchema.shape, async (input) => {
    const result = await inspectTool(input, bridge);
    if (typeof result === 'object' && result.type === 'image') {
      return { content: [{ type: 'image', data: result.data, mimeType: result.mimeType }] };
    }
    return { content: [{ type: 'text', text: result as string }] };
  });

  server.tool('vgx', 'Parse, serialize, validate, or patch VGX scene format', VgxInputSchema.shape, async (input) => {
    const result = await vgxTool(input, bridge);
    return { content: [{ type: 'text', text: result }] };
  });

  // MCP Resources
  server.resource('current-scene', 'vigame://scene/current', async () => {
    if (!bridge.connected) {
      return { contents: [{ uri: 'vigame://scene/current', text: '<world renderer="three"></world>' }] };
    }
    const vgx = await bridge.send<string>('scene:save', {});
    return { contents: [{ uri: 'vigame://scene/current', text: vgx }] };
  });

  server.resource('component-schemas', 'vigame://schema/components', async () => {
    if (!bridge.connected) {
      return { contents: [{ uri: 'vigame://schema/components', text: '{}' }] };
    }
    const schemas = await bridge.send<Record<string, unknown>>('inspect', { action: 'schemas' });
    return { contents: [{ uri: 'vigame://schema/components', text: JSON.stringify(schemas, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[vigame-mcp] Server running (bridge on port ${BRIDGE_PORT})\n`);
}

main().catch((err) => {
  process.stderr.write(`[vigame-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
