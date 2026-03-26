/** Default WebSocket port for the vigame bridge (browser ↔ MCP). */
export const DEFAULT_BRIDGE_PORT = 7777;

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || process.env === undefined) return undefined;
  return process.env[key];
}

/**
 * Bridge WebSocket port: `VIGAME_BRIDGE_PORT` or {@link DEFAULT_BRIDGE_PORT}.
 * Safe in browser (no `process`): returns default.
 */
export function resolveBridgePortFromEnv(): number {
  const raw = readEnv('VIGAME_BRIDGE_PORT');
  if (raw === undefined || raw === '') return DEFAULT_BRIDGE_PORT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BRIDGE_PORT;
}

/**
 * HTTP control port for CLI → MCP (defaults to bridge port + 1).
 * Override with `VIGAME_CONTROL_PORT` if needed.
 */
export function resolveControlPortFromEnv(): number {
  const override = readEnv('VIGAME_CONTROL_PORT');
  if (override !== undefined && override !== '') {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return resolveBridgePortFromEnv() + 1;
}

export function controlPortFromBridgePort(bridgePort: number): number {
  return bridgePort + 1;
}
