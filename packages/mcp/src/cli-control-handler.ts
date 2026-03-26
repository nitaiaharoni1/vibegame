import type { BridgeServer } from './bridge-server.js';

/**
 * Handle POST body from the CLI HTTP control server (port bridge+1).
 * Maps `inspect:screenshot` → bridge `screenshot` and unwraps data URL for the CLI.
 */
export async function handleCliControlPost(
  bridge: BridgeServer,
  body: string,
): Promise<{ result: unknown } | { error: string }> {
  try {
    const { action, payload } = JSON.parse(body) as { action: string; payload?: unknown };
    const command = action === 'inspect:screenshot' ? 'screenshot' : action;
    const raw = await bridge.send(command, (payload as Record<string, unknown>) ?? {});
    const result = action === 'inspect:screenshot' ? (raw as { dataUrl: string }).dataUrl : raw;
    return { result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
