/**
 * Commands handled by the browser bridge `executeCommand` (WebSocket wire).
 * Keep in sync with the bridge switch; MCP forwards these via `BridgeServer.send`.
 */
export const BRIDGE_COMMANDS = [
  'screenshot',
  'scene_graph',
  'inspect',
  'mutate',
  'eval',
  'input',
  'perf',
  'watch',
  'record',
  'get_errors',
  'act_and_observe',
  'debug_screenshot',
  'track',
  'watch_for',
  'fuzz',
  'run_policy',
  'observe',
  'discover_controls',
] as const;

export type BridgeCommandName = (typeof BRIDGE_COMMANDS)[number];
