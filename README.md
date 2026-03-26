# vigame

> A developer toolchain that gives AI agents eyes, hands, and memory into a running Three.js or Phaser game.

---

## The idea

AI already knows how to write Three.js and Phaser code. What it can't do alone:
- **See** the running game (screenshot, scene graph)
- **Tweak** values at runtime (mutate any property, run arbitrary JS)
- **Automate** playtesting (simulate input, assert outcomes)
- **Remember** project context across sessions

vigame solves exactly that. The game itself is raw Three.js or Phaser — no wrappers, no abstractions.

---

## Architecture

```
AI Agent (Claude) ←── MCP stdio ──→ @vigame/mcp ←── WebSocket :7777 ──→ @vigame/bridge (browser)
```

1. `@vigame/bridge` runs inside the game (injected by you or by `vigame start`)
2. `@vigame/mcp` exposes MCP tools to the AI over stdio
3. The AI calls tools → mcp proxies to the bridge → bridge executes in-game → result returns

---

## Packages

| Package | Description |
|---------|-------------|
| `@vigame/bridge` | Browser-side WebSocket runtime — gives AI live inspection and mutation of any Three.js or Phaser game |
| `@vigame/mcp` | MCP server (stdio) — 20 tools for screenshots, scene inspection, mutation, playtesting, project context, and assets |
| `@vigame/cli` | CLI — `vigame start` launches the MCP server; `vigame dev` starts Vite; inspection subcommands for human use |

---

## Quickstart

### 1. Inject the bridge into your game

```ts
import { injectBridge } from '@vigame/bridge';

const bridge = injectBridge({ port: 7777 });

// Register named roots so the AI can inspect them by path
bridge.register('scene', threeScene);       // Three.js
// or
bridge.register('game', phaserGame);        // Phaser

// Expose globals for automatic detection
window.__THREE_SCENE__ = threeScene;
// or
window.__PHASER_GAME__ = phaserGame;
```

### 2. Add vigame to your Claude Code MCP config

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "vigame": {
      "command": "npx",
      "args": ["-y", "@vigame/mcp"],
      "env": { "VIGAME_BRIDGE_PORT": "7777" }
    }
  }
}
```

### 3. Start your game and tell Claude what to do

```
> "The player's jump feels floaty — inspect the physics values and tighten them."
> "Take a screenshot and describe what's on screen."
> "Run a playtest: move right for 2 seconds, then assert the player X position > 5."
```

---

## MCP tools

### Visual
| Tool | Description |
|------|-------------|
| `screenshot` | Capture the canvas as a base64 PNG |
| `watch` | Take screenshots every N ms for M seconds |
| `debug_screenshot` | Annotated screenshot with debug overlays (bounding boxes, grid, property labels) |

### Inspection
| Tool | Description |
|------|-------------|
| `scene_graph` | Get the full Three.js/Phaser object tree as JSON |
| `inspect` | Read any property by dot-path: `"player.position.x"` |
| `mutate` | Write any property by dot-path: `"player.material.color" → "#ff0000"` |
| `eval_js` | Run arbitrary JS in the game context |
| `get_errors` | Get all runtime errors captured by the bridge (JS errors, unhandled rejections) |

### Testing
| Tool | Description |
|------|-------------|
| `simulate_input` | Send keyboard/mouse events |
| `record` | Record state + screenshots for N seconds |
| `run_playtest` | Run an input sequence and assert outcomes |
| `fuzz_test` | Send random inputs for N ms and report crashes, errors, NaN values |

### Compound
| Tool | Description |
|------|-------------|
| `act_and_observe` | Execute mutations/eval/inputs then observe in one call — saves round trips |
| `watch_for` | Wait for a JS condition to become true, then capture observations |

### Tracking
| Tool | Description |
|------|-------------|
| `track` | Track object properties over time and compute velocity/trajectory stats |

### Project
| Tool | Description |
|------|-------------|
| `project_context` | Read `.vigame/` context files |
| `update_context` | Write to `.vigame/design.md`, `decisions.md`, etc. |
| `init_project` | Initialize `.vigame/` for a new project |

### Assets
| Tool | Description |
|------|-------------|
| `placeholder_asset` | Generate SVG placeholder textures/sprites |
| `asset_manifest` | Scan project directory for asset files |

### Performance
| Tool | Description |
|------|-------------|
| `perf_snapshot` | Get FPS, memory, and draw call stats |

---

## CLI reference

```bash
# Start MCP server + WebSocket bridge
vigame start [-p port]          # default port: 7777

# Start Vite dev server
vigame dev [-p port]            # default port: 5173

# Inspect a running game (requires vigame start)
vigame inspect screenshot [-o file.png]
vigame inspect world
vigame inspect schemas
vigame inspect systems

vigame entity list
vigame entity find <name>
vigame entity create <name> [--tag a,b]
vigame entity delete <name>

vigame component get <entity> <type>
vigame component set <entity> <type> --props '{"x":1}'

vigame transform position <entity> <x> <y> <z>
vigame transform rotation <entity> <x> <y> <z>
vigame transform scale    <entity> <x> <y> <z>

vigame query all
vigame query component <type>
vigame query tag <tag>

vigame runtime play | pause | step | stop | reset
```

---

## Project context

vigame-mcp reads/writes a `.vigame/` directory so the AI can maintain memory across sessions:

```
.vigame/
  manifest.json    ← renderer, created timestamp
  design.md        ← game design spec
  decisions.md     ← architecture decisions with rationale
  known-issues.md  ← bugs the AI knows about
```

---

## Requirements

- Node.js ≥ 20
- pnpm v10+

## Setup

```bash
git clone <repo-url>
cd game-vibegame
pnpm install
pnpm build
pnpm test
```
