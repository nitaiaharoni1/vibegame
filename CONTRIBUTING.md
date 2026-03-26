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
packages/     # Engine library packages (@vigame/*)
docs/         # Documentation
```

All packages use TypeScript in strict mode. Build artifacts go to each package's `dist/` directory and are gitignored.

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

1. Copy an existing package as a template (e.g. `cp -r packages/input packages/my-package`).
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
- **All CI checks must pass** — build, test, and lint — before a PR can be merged.
- Keep PRs focused. One concern per PR makes review faster.
- Reference any related issues in the PR description.
- Breaking changes must be called out explicitly in the PR description and commit message with a `BREAKING CHANGE:` footer.

## Architecture notes

### ECS pattern

vigame is built on an Entity-Component-System (ECS) architecture provided by `@vigame/core`.

- **Entities** are integer IDs (`EntityId`).
- **Components** are plain data objects attached to entities, defined with `defineComponent`.
- **Systems** are functions that iterate entities and mutate component data, defined with `defineSystem` and registered via `addSystem`. Systems run in phase order (`Phase.PreUpdate → Update → PostUpdate → Render`).
- The **World** object owns all state and is passed to every system and plugin.

### Plugin system

Plugins implement the `VibePlugin` interface and are registered via `registerPlugin(world, plugin)`. A plugin can register systems, declare VGX tag handlers, and expose teardown logic. Plugins declare their dependencies so vigame ensures correct registration order.

### VGX format

VGX is an XML scene description format consumed by `@vigame/scene`. A VGX document describes entities, components, prefabs, and instances:

```xml
<world renderer="three">
  <config gravity="0 -9.81 0" clear-color="#87ceeb" />
  <entity name="Player" tag="hero">
    <transform pos="0 2 0" />
    <health current="100" max="100" />
  </entity>
  <prefab name="Coin">
    <mesh shape="cylinder" color="#ffd700" />
  </prefab>
  <instance prefab="Coin" pos="3 1 0" />
</world>
```

`hydrateScene` takes a parsed VGX document and a World and creates entities, dispatching each component element to the matching VGX tag handler registered by a plugin.
