// This runs in the browser, inside the vigame game
export interface BridgeMessage {
  id: string;
  type: 'request' | 'response' | 'event';
  action?: string;
  payload?: unknown;
  error?: string;
}

export type ActionHandler = (payload: unknown) => Promise<unknown>;

export class GameBridgeClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ActionHandler>();
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url = 'ws://localhost:7777') {
    this.url = url;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        console.log('[vigame] Connected to MCP bridge');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };
      this.ws.onmessage = (event) => {
        void this.handleMessage(event.data as string);
      };
      this.ws.onclose = () => {
        console.log('[vigame] Disconnected from MCP bridge, reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
      this.ws.onerror = () => {
        // will trigger onclose
      };
    } catch {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(raw) as BridgeMessage;
    } catch {
      return;
    }

    if (msg.type === 'request' && msg.action) {
      const handler = this.handlers.get(msg.action);
      if (handler) {
        try {
          const result = await handler(msg.payload);
          this.send({ id: msg.id, type: 'response', payload: result });
        } catch (e) {
          this.send({ id: msg.id, type: 'response', error: (e as Error).message });
        }
      } else {
        this.send({ id: msg.id, type: 'response', error: `Unknown action: ${msg.action}` });
      }
    }
  }

  on(action: string, handler: ActionHandler): void {
    this.handlers.set(action, handler);
  }

  private send(msg: BridgeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
