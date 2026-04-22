import {
  type BridgeCommandName,
  DEFAULT_BRIDGE_PORT,
  VigameError,
  VigameErrorCode,
} from '@vigame/protocol';
import { WebSocket, WebSocketServer } from 'ws';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/** Prefix used to namespace IDs for commands proxied from secondary MCPs. */
const PROXY_ID_PREFIX = 'px::';

/** JSON may parse `id` as number or string; Map keys must match what we use when sending. */
function normalizeMessageId(raw: unknown): string {
  return String(raw);
}

/**
 * WebSocket server that the browser bridge runtime connects to.
 *
 * ### Single-instance mode (primary)
 * Binds `port`, accepts the browser bridge as a client, and handles tool
 * commands directly.
 *
 * ### Multi-instance mode (proxy)
 * When `port` is already taken by another vigame-mcp process, connects to
 * that process as a proxy client. Tool commands are forwarded through the
 * primary and its browser connection — no browser reconnection required.
 *
 * This means multiple MCP instances (e.g. Cursor + Claude Code) can coexist
 * without port conflicts and without any manual coordination.
 */
export class BridgeServer {
  // ── Primary mode ────────────────────────────────────────────────────────
  private wss: WebSocketServer | null = null;
  /** The browser bridge WebSocket (primary mode). */
  private browserClient: WebSocket | null = null;
  /** Other MCP instances connected as proxies (primary mode). */
  private proxyClients = new Set<WebSocket>();
  /**
   * Maps a namespaced message ID back to the proxy WS that originated the
   * command, so the browser response can be routed correctly.
   */
  private proxyRoutes = new Map<string, WebSocket>();

  // ── Proxy mode ──────────────────────────────────────────────────────────
  private proxyMode = false;
  /** WebSocket connection to the primary vigame-mcp (proxy mode). */
  private upstreamWs: WebSocket | null = null;
  private proxyPending = new Map<string, PendingRequest>();
  private proxyMessageId = 0;
  private proxyPort = DEFAULT_BRIDGE_PORT;
  /** Unblocks `ready` once when entering proxy mode (from tryListen). */
  private proxyConnectUnblock: (() => void) | null = null;
  private proxyRetryTimer: ReturnType<typeof setTimeout> | null = null;
  /** When false, upstream close must not schedule reconnect (see close()). */
  private allowProxyReconnect = true;

  // ── Rate limiting ──────────────────────────────────────────────────────
  private pendingCount = 0;
  private static readonly MAX_PENDING = 10;

  // ── Proxy reconnect backoff ───────────────────────────────────────────
  private proxyReconnectAttempts = 0;
  private static readonly MAX_PROXY_RECONNECT = 20;

  // ── Shared ───────────────────────────────────────────────────────────────
  private pending = new Map<string, PendingRequest>();
  private messageId = 0;
  private ready: Promise<void>;

  constructor(port = DEFAULT_BRIDGE_PORT) {
    this.ready = this.tryListen(port);
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  private async tryListen(port: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const wss = new WebSocketServer({ port });

      wss.on('listening', () => {
        this.wss = wss;
        wss.on('connection', (ws) => this.classifyConnection(ws));
        resolve();
      });

      wss.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Another vigame-mcp is already running — connect through it.
          this.connectAsProxy(port, resolve);
        } else {
          process.stderr.write(`[vigame-mcp] WebSocket error: ${err.message}\n`);
          resolve();
        }
      });
    });
  }

  /**
   * A new WebSocket connected to our server.  We can't tell from the TCP
   * handshake alone whether it's a browser or another MCP proxy client, so
   * we wait briefly for an identification frame.
   *
   * - MCP proxy clients send `{"type":"mcp-proxy"}` immediately on open.
   * - Browser bridge clients stay silent until they receive a command.
   *
   * If no message arrives within 150 ms we assume it's a browser.
   */
  private classifyConnection(ws: WebSocket): void {
    let identified = false;

    const identifyAsBrowser = () => {
      if (identified) return;
      identified = true;
      this.registerBrowserClient(ws);
    };

    const timer = setTimeout(identifyAsBrowser, 150);

    ws.once('message', (rawData) => {
      clearTimeout(timer);
      if (identified) return;
      identified = true;

      let msg: { type?: string } = {};
      try {
        msg = JSON.parse(rawData.toString()) as { type?: string };
      } catch {
        /* ignore */
      }

      if (msg.type === 'mcp-proxy') {
        this.registerProxyClient(ws);
      } else {
        // Was a browser response (edge case) — treat as browser and route it.
        this.registerBrowserClient(ws);
        this.routeBrowserResponse(rawData.toString());
      }
    });

    ws.on('error', () => {
      clearTimeout(timer);
    });
  }

  private registerBrowserClient(ws: WebSocket): void {
    this.browserClient = ws;
    ws.on('message', (d) => this.routeBrowserResponse(d.toString()));
    ws.on('close', () => {
      if (this.browserClient === ws) this.browserClient = null;
    });
  }

  private registerProxyClient(ws: WebSocket): void {
    this.proxyClients.add(ws);
    ws.on('message', (d) => this.handleProxyClientCommand(ws, d.toString()));
    ws.on('close', () => {
      this.proxyClients.delete(ws);
      // Remove any stale routes that pointed to this proxy.
      for (const [id, routeWs] of this.proxyRoutes) {
        if (routeWs === ws) this.proxyRoutes.delete(id);
      }
    });
  }

  // ── Proxy mode (secondary MCP) ────────────────────────────────────────────

  private connectAsProxy(port: number, resolve: () => void): void {
    this.proxyMode = true;
    this.proxyPort = port;
    this.proxyConnectUnblock = resolve;
    this.attemptProxyConnect();
  }

  /**
   * Connects to the primary vigame-mcp WebSocket. Retries on failure so a
   * secondary MCP (e.g. Cursor) that starts before the primary can attach once
   * `vigame start` binds the port.
   */
  private attemptProxyConnect(): void {
    const ws = new WebSocket(`ws://localhost:${this.proxyPort}`);

    ws.once('open', () => {
      if (this.proxyRetryTimer !== null) {
        clearTimeout(this.proxyRetryTimer);
        this.proxyRetryTimer = null;
      }
      ws.send(JSON.stringify({ type: 'mcp-proxy' }));
      this.upstreamWs = ws;
      this.proxyReconnectAttempts = 0;
      process.stderr.write(
        `[vigame-mcp] Port ${this.proxyPort} in use — operating as proxy through the primary vigame-mcp instance.\n`,
      );
      this.unblockProxyConnectOnce();

      ws.on('message', (rawData) => {
        let msg: { id: unknown; result?: unknown; error?: string };
        try {
          msg = JSON.parse(rawData.toString()) as typeof msg;
        } catch {
          return;
        }
        const rid = normalizeMessageId(msg.id);
        const req = this.proxyPending.get(rid);
        if (!req) return;
        clearTimeout(req.timeout);
        this.proxyPending.delete(rid);
        if (msg.error) req.reject(new Error(msg.error));
        else req.resolve(msg.result);
      });

      ws.on('close', () => {
        this.upstreamWs = null;
        for (const [, req] of this.proxyPending) {
          clearTimeout(req.timeout);
          req.reject(
            new VigameError(
              VigameErrorCode.PROXY_UPSTREAM_LOST,
              'Proxy connection to primary vigame-mcp lost.',
            ),
          );
        }
        this.proxyPending.clear();
        this.scheduleProxyReconnect();
      });
    });

    ws.once('error', (err) => {
      process.stderr.write(
        `[vigame-mcp] Port ${this.proxyPort} busy and proxy connection failed: ${err.message}\n`,
      );
      this.unblockProxyConnectOnce();
      if (!this.upstreamWs) {
        this.scheduleProxyReconnect();
      }
    });
  }

  private unblockProxyConnectOnce(): void {
    if (this.proxyConnectUnblock) {
      this.proxyConnectUnblock();
      this.proxyConnectUnblock = null;
    }
  }

  /**
   * Try to become primary (bind the port). If the port is free we switch out
   * of proxy mode entirely. If EADDRINUSE, fall back to proxy retry.
   */
  private attemptBecomePrimary(): void {
    const wss = new WebSocketServer({ port: this.proxyPort });

    wss.on('listening', () => {
      process.stderr.write(
        `[vigame-mcp] Port ${this.proxyPort} is now free — switching to primary mode.\n`,
      );
      this.proxyMode = false;
      this.wss = wss;
      wss.on('connection', (ws) => this.classifyConnection(ws));
    });

    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.attemptProxyConnect();
      } else {
        process.stderr.write(
          `[vigame-mcp] WebSocket error during primary attempt: ${err.message}\n`,
        );
        this.scheduleProxyReconnect();
      }
    });
  }

  private scheduleProxyReconnect(): void {
    if (!this.allowProxyReconnect || !this.proxyMode) return;
    if (this.upstreamWs !== null) return;
    if (this.proxyRetryTimer !== null) return;
    if (this.proxyReconnectAttempts >= BridgeServer.MAX_PROXY_RECONNECT) {
      console.error(
        `[vigame-mcp] Gave up reconnecting after ${BridgeServer.MAX_PROXY_RECONNECT} attempts`,
      );
      return;
    }
    const delay = Math.min(2000 * 2 ** this.proxyReconnectAttempts, 30000);
    this.proxyReconnectAttempts++;
    this.proxyRetryTimer = setTimeout(() => {
      this.proxyRetryTimer = null;
      if (!this.allowProxyReconnect || !this.proxyMode || this.upstreamWs !== null) return;
      process.stderr.write('[vigame-mcp] Upstream lost — attempting to bind port as primary...\n');
      this.attemptBecomePrimary();
    }, delay);
  }

  // ── Primary: relay proxy-client commands to browser ───────────────────────

  private handleProxyClientCommand(proxyWs: WebSocket, data: string): void {
    let cmd: { id: string; command: string; args: Record<string, unknown> };
    try {
      cmd = JSON.parse(data) as typeof cmd;
    } catch {
      return;
    }

    if (!this.browserClient || this.browserClient.readyState !== WebSocket.OPEN) {
      proxyWs.send(
        JSON.stringify({
          id: cmd.id,
          error: 'No game connected. Make sure the bridge runtime is running in your game.',
        }),
      );
      return;
    }

    // Namespace the ID so it can't collide with our own pending IDs.
    const namespacedId = `${PROXY_ID_PREFIX}${normalizeMessageId(cmd.id)}`;
    this.proxyRoutes.set(namespacedId, proxyWs);
    this.browserClient.send(JSON.stringify({ ...cmd, id: namespacedId }));
  }

  /**
   * A message arrived from the browser.  Route it either back to the proxy
   * client that originated the command, or resolve one of our own pending
   * requests.
   */
  private routeBrowserResponse(data: string): void {
    let msg: { id: unknown; result?: unknown; error?: string };
    try {
      msg = JSON.parse(data) as typeof msg;
    } catch {
      return;
    }

    const idKey = normalizeMessageId(msg.id);
    const proxyWs = this.proxyRoutes.get(idKey);
    if (proxyWs) {
      this.proxyRoutes.delete(idKey);
      const originalId = idKey.slice(PROXY_ID_PREFIX.length);
      if (proxyWs.readyState === WebSocket.OPEN) {
        proxyWs.send(JSON.stringify({ ...msg, id: originalId }));
      }
      return;
    }

    // Our own pending request.
    this.handleOwnResponse(data);
  }

  private handleOwnResponse(data: string): void {
    let msg: { id: unknown; result?: unknown; error?: string };
    try {
      msg = JSON.parse(data) as typeof msg;
    } catch {
      return;
    }
    const idKey = normalizeMessageId(msg.id);
    const req = this.pending.get(idKey);
    if (!req) return;
    clearTimeout(req.timeout);
    this.pending.delete(idKey);
    if (msg.error) req.reject(new Error(msg.error));
    else req.resolve(msg.result);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Send a command to the connected game and await its response.
   * Works in both primary and proxy modes.
   * Rejects if no game is connected or the command times out.
   */
  async send(
    command: BridgeCommandName,
    args?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown>;
  async send(command: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  async send(
    command: string,
    args: Record<string, unknown> = {},
    timeoutMs = 10000,
  ): Promise<unknown> {
    await this.ready;

    if (this.pendingCount >= BridgeServer.MAX_PENDING) {
      throw new VigameError(
        VigameErrorCode.NO_BROWSER,
        `Too many pending commands (${BridgeServer.MAX_PENDING}). Wait for current commands to complete.`,
      );
    }
    this.pendingCount++;

    if (this.proxyMode) {
      if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) {
        this.pendingCount--;
        throw new VigameError(
          VigameErrorCode.PROXY_UPSTREAM_LOST,
          'Proxy connection to primary vigame-mcp lost.',
        );
      }
      const id = String(++this.proxyMessageId);
      const upstream = this.upstreamWs;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.proxyPending.delete(id);
          this.pendingCount--;
          reject(
            new VigameError(
              VigameErrorCode.COMMAND_TIMEOUT,
              `Command "${command}" timed out after ${timeoutMs}ms. Game tab may be in background or unresponsive.`,
            ),
          );
        }, timeoutMs);
        this.proxyPending.set(id, {
          resolve: (v) => {
            this.pendingCount--;
            resolve(v);
          },
          reject: (e) => {
            this.pendingCount--;
            reject(e);
          },
          timeout,
        });
        upstream.send(JSON.stringify({ id, command, args }));
      });
    }

    if (!this.browserClient || this.browserClient.readyState !== WebSocket.OPEN) {
      this.pendingCount--;
      throw new VigameError(
        VigameErrorCode.NO_BROWSER,
        'No browser tab connected to vigame bridge. Ensure injectBridge() is running in the game.',
      );
    }
    const browser = this.browserClient;
    const id = String(++this.messageId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.pendingCount--;
        reject(
          new VigameError(
            VigameErrorCode.COMMAND_TIMEOUT,
            `Command "${command}" timed out after ${timeoutMs}ms. Game tab may be in background or unresponsive.`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          this.pendingCount--;
          resolve(v);
        },
        reject: (e) => {
          this.pendingCount--;
          reject(e);
        },
        timeout,
      });
      browser.send(JSON.stringify({ id, command, args }));
    });
  }

  isConnected(): boolean {
    if (this.proxyMode) {
      return this.upstreamWs !== null && this.upstreamWs.readyState === WebSocket.OPEN;
    }
    return this.browserClient !== null && this.browserClient.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.allowProxyReconnect = false;
    if (this.proxyRetryTimer !== null) {
      clearTimeout(this.proxyRetryTimer);
      this.proxyRetryTimer = null;
    }
    this.proxyConnectUnblock = null;
    for (const [, req] of this.pending) {
      clearTimeout(req.timeout);
      req.reject(new Error('BridgeServer closed'));
    }
    for (const [, req] of this.proxyPending) {
      clearTimeout(req.timeout);
      req.reject(new Error('BridgeServer closed'));
    }
    this.pending.clear();
    this.proxyPending.clear();
    this.wss?.close();
    this.upstreamWs?.close();
  }
}
