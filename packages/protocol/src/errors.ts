/** Structured error codes for vigame bridge communication failures. */
export const VigameErrorCode = {
  NO_BROWSER: 'NO_BROWSER',
  BROWSER_DISCONNECTED: 'BROWSER_DISCONNECTED',
  PROXY_UPSTREAM_LOST: 'PROXY_UPSTREAM_LOST',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
} as const;

export type VigameErrorCode = (typeof VigameErrorCode)[keyof typeof VigameErrorCode];

export class VigameError extends Error {
  constructor(
    public readonly code: VigameErrorCode,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'VigameError';
  }
}
