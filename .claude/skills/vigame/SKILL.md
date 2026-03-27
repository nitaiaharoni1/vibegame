---
name: vigame
description: Start a vigame session — guides the AI through observing, understanding, and autonomously playing a game via vigame MCP tools
argument-hint: "[goal or game to work on]"
---

# vigame session start

$ARGUMENTS

## What vigame is

vigame gives AI agents live eyes, hands, and memory into a running browser game. The game runs untouched — vigame observes and controls it through an injected WebSocket bridge.

```
Claude ←─ MCP ─→ vigame-mcp ←─ WebSocket :7777 ─→ @vigame/bridge (in browser)
```

## 4-Phase Workflow

### Phase 1 — Orient (structured, not visual)
```
observe(auto_discover: true, spatial: true)
```
Returns: registered roots, entity positions, FPS. No screenshots needed. If the game isn't connected yet, tell the user to open the browser with the game running.

### Phase 2 — Discover controls
```
discover_controls()
```
Tests arrows, WASD, Space, Enter, mouse — returns what each input does to game state. Cache is automatic; only call with `rescan: true` if the game has changed.

### Phase 3 — Play autonomously
```
run_policy({
  policy: "(state) => { /* return action name each frame */ }",
  reward: "(state, prev) => { /* return number */ }",
  state_spec: ["player.x", "player.health", "score"],
  actions: {
    "right": ["ArrowRight"],
    "jump":  ["Space"],
    "idle":  []
  },
  duration_ms: 10000,
  done_condition: "state.health <= 0"
})
```
One call = thousands of frames executed at game speed. Returns total_reward, reward_curve, action_counts, episode_log (sampled), events, errors.

### Phase 4 — Iterate
Read episode_log + reward_curve. Refine the policy or reward function. Re-run. Each run is one MCP round-trip covering the full episode.

## Tool cheat-sheet

| Goal | Use |
|------|-----|
| Understand game state | `observe(auto_discover:true)` |
| Read specific values | `observe(paths:["player.x","score"])` |
| What do keys do? | `discover_controls()` |
| Play the game | `run_policy(...)` |
| One-off input | `simulate_input` |
| Read/write a value | `inspect` / `mutate` |
| Run arbitrary JS | `eval_js` |
| Visual confirmation | `screenshot` (sparingly) |
| Debug with overlays | `debug_screenshot` |
| Wait for a condition | `watch_for` |

## Key rules

- **Never screenshot in a loop** — use `observe` for state, screenshot only when you need visual confirmation
- **Never simulate_input frame-by-frame** — write a `run_policy` instead; it runs at 60fps inside the browser
- **Actions = key names to HOLD** — `actions: { "right": ["ArrowRight"] }` means hold ArrowRight while "right" is active
- **state_spec paths are flat** — `"game.player.health"` becomes key `"game.player.health"` in the state dict
- **done_condition stops early** — use it to end the episode on death, win, or error conditions
- **reward_curve tells the story** — increasing = learning, flat = stuck, dropping = dying

## Quick-start (if goal is provided above)

1. Call `observe(auto_discover:true)` to see what's registered
2. Call `discover_controls()` to map inputs to effects
3. Write a policy that pursues the goal using the discovered controls
4. Call `run_policy` for 10s, review reward_curve
5. Refine and repeat
