# Contributing to vigame

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 10 or later (`npm install -g pnpm`)

## Setup

```bash
git clone https://github.com/nitaiaharoni1/vibegame.git
cd vigame
pnpm install
pnpm build
```

## Monorepo structure

```
packages/     # @vigame/protocol, @vigame/bridge, @vigame/mcp, @vigame/cli
docs/         # Documentation
```

All packages use TypeScript in strict mode. Build artifacts go to each package's `dist/` directory and are gitignored. Use a **single** lockfile at the repo root (`pnpm-lock.yaml`); do not add per-package `pnpm-lock.yaml` files under `packages/`.

## Development workflow

```bash
pnpm dev      # Watch mode — rebuilds all packages on file change (via Turbo)
pnpm test     # Run all tests across all packages
pnpm lint     # Lint all packages
pnpm build    # Full production build
pnpm typecheck   # TypeScript check across all packages (tsc --noEmit)
npm run check    # Full gate: lint + type in parallel (concurrently), then build & test; logs in checks-outputs/
pnpm install-hooks  # Same idea as tesse’s install-hooks → pre-commit install --config <repo>/.pre-commit-config.yaml
pnpm install:hooks  # Alias for install-hooks (matches tesse’s install:hooks naming)
```

Pre-commit runs Biome on commit; pre-push runs the same full `npm run check` as CI. Skip a hook when needed: `SKIP=npm-check git push`.

To work on a single package, `cd` into it and run `pnpm dev`, `pnpm test`, etc. directly. Turbo's caching means unchanged packages are skipped automatically.

## Adding a new package

1. Copy an existing package as a template (e.g. `cp -r packages/protocol packages/my-package`).
2. Update `package.json` — set `"name": "@vigame/my-package"` and adjust dependencies.
3. The package is picked up automatically because `pnpm-workspace.yaml` includes `"packages/*"`.
4. If the package needs its own build/test pipeline entry, add it to `turbo.json` under `tasks`. Most packages inherit the default pipeline so this step is often unnecessary.
5. Export your public API from `src/index.ts`.

## Commit conventions

Use the following prefixes:

| Prefix | Use for |
|--------|---------|
| `feat:` | New functionality |
| `fix:` | Bug fixes |
| `refactor:` | Code changes without behaviour change |
| `test:` | Adding or updating tests only |
| `docs:` | Documentation only |
| `chore:` | Tooling, config, dependency updates |

Example: `feat(physics): add broadphase AABB query`

Scope (in parentheses) is optional but encouraged for package-specific changes.

## Pull request guidelines

- **Tests required** for all new features and bug fixes. Tests live in `src/__tests__/` inside each package and use Vitest.
- **All CI checks must pass** — `npm run check` (lint, typecheck, build, test) matches what runs in GitHub Actions — before a PR can be merged.
- Keep PRs focused. One concern per PR makes review faster.
- Reference any related issues in the PR description.
- Breaking changes must be called out explicitly in the PR description and commit message with a `BREAKING CHANGE:` footer.

## Architecture notes

vigame is a **toolchain** for AI-assisted game development: it does not replace Three.js or Phaser.

| Package | Role |
|---------|------|
| `@vigame/protocol` | Shared wire types, bridge command names, default ports, helpers |
| `@vigame/bridge` | Injected into the browser — WebSocket to MCP, screenshots, inspect/mutate, playtesting helpers |
| `@vigame/mcp` | MCP server over stdio — tools the AI calls; proxies to the bridge over WebSocket |
| `@vigame/cli` | `vigame` binary — `start`, `dev`, and inspection commands that talk to the running bridge |

Your game code stays ordinary Three.js or Phaser; you add the bridge so the AI can see and steer the running game.
