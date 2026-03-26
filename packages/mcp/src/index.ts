// Browser-safe entry: no Node `ws` / `events`. For `GameBridge` (server), use `@vigame/mcp/bridge`.
export { GameBridgeClient } from './client-bridge.js';
export { VigameBridgePlugin } from './vigame-bridge-plugin.js';
export type { BridgeMessage } from './client-bridge.js';
export type { VigameBridgeOptions } from './vigame-bridge-plugin.js';
