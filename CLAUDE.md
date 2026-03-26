# CLAUDE.md — vigame toolkit

## Project overview

**vigame** is a developer toolchain for AI agents building Three.js and Phaser games. It does **not** abstract those libraries — it augments the AI agent's workflow with eyes, hands, and memory into a running game.

The core idea: AI already knows Three.js and Phaser. vigame solves what AI can't do alone — see the running game, tweak values at runtime, automate playtesting, and remember project context across sessions.

## Key commands

```bash
pnpm install      # Install all dependencies (run from repo root)
pnpm build        # Build all packages via Turbo
pnpm test         # Run all tests via Turbo (Vitest per package)
pnpm dev          # Watch mode — rebuild on file change
npm run check     # Full gate: lint, typecheck, build, test (logs under checks-outputs/)
pnpm install-hooks  # Register pre-commit + pre-push hooks (requires pre-commit CLI)
```

## Package overview

| Package | Description |
|---------|-------------|
| `@vigame/bridge` | Browser-side WebSocket runtime injected into any Three.js or Phaser game — gives AI agents live inspection and mutation |
| `@vigame/mcp` | MCP server (stdio) — exposes tools to AI agents for live game control, playtesting, project context, and assets |
| `@vigame/cli` | CLI — `vigame start` launches the MCP server, `vigame dev` starts Vite, inspection subcommands for human use |

## Architecture

```
AI Agent (Claude) ←─ MCP stdio ─→ @vigame/mcp ←─ WebSocket :7777 ─→ @vigame/bridge (in browser)
```

1. The AI agent connects to `@vigame/mcp` via stdio MCP protocol
2. `@vigame/mcp` runs a WebSocket server on port 7777
3. `@vigame/bridge` runs inside the game (browser), connects to that WebSocket
4. The AI calls MCP tools → MCP proxies commands to the bridge → bridge executes in-game → result returns to AI

**The game itself is raw Three.js or Phaser — no wrappers, no abstractions.**

## @vigame/bridge

Inject into any game:

```ts
import { injectBridge } from '@vigame/bridge';

const bridge = injectBridge({ port: 7777 });

// Optional: register named roots for path inspection
bridge.register('player', playerMesh);
bridge.register('scene', threeScene);

// Expose globals for automatic detection
window.__THREE_SCENE__ = threeScene;   // Three.js
window.__PHASER_GAME__ = phaserGame;  // Phaser
```

Commands handled by the bridge (called by the MCP server):
- `screenshot` — captures canvas as base64 PNG
- `scene_graph` — traverses Three.js scene or Phaser game object tree
- `inspect` — reads any property by dot-path (e.g. `"player.position.x"`)
- `mutate` — writes any property by dot-path
- `eval` — runs arbitrary JS in the game context
- `input` — simulates keyboard/mouse events
- `perf` — returns FPS, memory stats
- `record` — records state + screenshots for N seconds

## @vigame/mcp — MCP tools

Start the server: `vigame start` (or `pnpm start` in the package)

### Visual tools
- `screenshot` — get a screenshot of the running game
- `watch` — take screenshots every N ms for M seconds
- `debug_screenshot` — annotated screenshot with debug overlays (bounding boxes, grid, property labels)

### Inspection tools
- `scene_graph` — get the full scene tree as JSON
- `inspect` — read any property: `{ path: "player.position.x" }`
- `mutate` — write any property: `{ path: "player.material.color", value: "#ff0000" }`
- `eval_js` — run arbitrary JS: `{ code: "player.position.set(0,0,0)" }`
- `get_errors` — get all runtime errors captured by the bridge (JS errors, unhandled rejections)

### Testing tools
- `simulate_input` — send keyboard/mouse events
- `record` — record frames for N seconds
- `run_playtest` — run an input sequence and assert outcomes
- `fuzz_test` — send random inputs for N ms and report crashes, errors, NaN values

### Compound tools
- `act_and_observe` — execute mutations/eval/inputs, then observe via screenshot/inspect/scene_graph in one call
- `watch_for` — wait for a JS condition to become true, then capture observations

### Tracking tools
- `track` — track object properties over time and compute velocity/trajectory stats

### Project tools
- `project_context` — read `.vigame/` project context files
- `update_context` — write to `.vigame/design.md`, `decisions.md`, etc.
- `init_project` — initialize `.vigame/` directory for a new project

### Asset tools
- `placeholder_asset` — generate SVG placeholder textures/sprites
- `asset_manifest` — scan project for asset files

### Performance tools
- `perf_snapshot` — get FPS, memory, draw call stats

## @vigame/cli

Start the MCP server:
```bash
vigame start   # starts vigame-mcp on stdio + WebSocket :7777
vigame dev     # starts Vite dev server
```

Inspection commands (require `vigame start` running):
```bash
vigame inspect screenshot [-o file.png]
vigame inspect world
vigame entity list
vigame entity find <name>
vigame component get <entity> <type>
vigame transform position <entity> <x> <y> <z>
vigame runtime pause | play | step | stop | reset
```

## Project context system

vigame-mcp reads/writes a `.vigame/` directory in the project:

```
.vigame/
  manifest.json    ← { renderer, files, created }
  design.md        ← game design spec (AI maintains this)
  decisions.md     ← architecture decisions with rationale
  known-issues.md  ← bugs the AI knows about
```

Use `init_project` to create it, `project_context` to read it at session start, `update_context` to maintain it.

## TypeScript conventions

- Strict mode throughout (`strict: true`, `noUncheckedIndexedAccess: true`)
- No `any` — use `unknown` with type guards
- Relative imports use `.js` extension (ESM convention)
- All public APIs exported from `src/index.ts`

## Test pattern

Each package runs Vitest tests in `src/__tests__/`:

```bash
cd packages/bridge && pnpm test   # bridge tests
cd packages/mcp && pnpm test      # mcp tests
pnpm test                         # all tests from root
```
