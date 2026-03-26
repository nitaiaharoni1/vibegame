# @vigame/mcp

MCP server and WebSocket bridge for AI agent control of vigame games. Exposes the ECS world to LLM agents via the Model Context Protocol.

## Install

```
pnpm add @vigame/mcp
```

## Usage

```ts
import { createWorld } from '@vigame/core';
import { VigameBridgePlugin, GameBridge } from '@vigame/mcp';

const world = createWorld();
world.addPlugin(VigameBridgePlugin({ port: 3001 }));

const bridge = new GameBridge({ world });
bridge.start(); // AI agents can now connect and issue commands
```

Part of the [vigame](https://github.com/nitaiaharoni1/vibegame) monorepo.
