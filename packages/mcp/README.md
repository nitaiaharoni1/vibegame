# @vigame/mcp

MCP server (stdio) that exposes tools to AI agents for live control of **running** Three.js or Phaser games. It speaks WebSocket to [`@vigame/bridge`](https://github.com/nitaiaharoni1/vibegame/tree/master/packages/bridge) in the browser; the game itself is not wrapped by vigame.

## Install

```bash
pnpm add @vigame/mcp
```

## Usage

**CLI (typical):** use the [`vigame`](https://github.com/nitaiaharoni1/vibegame/tree/master/packages/cli) package — `vigame start` runs this server and the bridge WebSocket on the configured port.

**Programmatic:** import the server entry if you embed the MCP in your own process:

```ts
await import('@vigame/mcp/server');
```

Environment variables such as `VIGAME_BRIDGE_PORT` control the WebSocket port the browser bridge connects to (see `@vigame/protocol`).

Part of the [vigame](https://github.com/nitaiaharoni1/vibegame) monorepo.
