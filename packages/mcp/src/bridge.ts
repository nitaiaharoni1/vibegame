import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

export interface BridgeMessage {
  id: string;
  type: 'request' | 'response' | 'event';
  action?: string;
  payload?: unknown;
  error?: string;
}

export class GameBridge extends EventEmitter {
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private _msgCounter = 0;

  constructor(port = 7777) {
    super();
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws) => {
      this.client = ws;
      this.emit('connect');
      ws.on('message', (raw) => {
        try {
          const msg: BridgeMessage = JSON.parse(raw.toString());
          if (msg.type === 'response' && this.pending.has(msg.id)) {
            const pending = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(msg.payload);
          } else if (msg.type === 'event') {
            this.emit('game-event', msg);
          }
        } catch {
          // ignore malformed messages
        }
      });
      ws.on('close', () => {
        this.client = null;
        this.emit('disconnect');
      });
    });
  }

  get connected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async send<T = unknown>(action: string, payload?: unknown, timeoutMs = 5000): Promise<T> {
    if (!this.connected) throw new Error('No game client connected. Is the browser game running?');
    const id = String(++this._msgCounter);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for response to "${action}"`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.client!.send(JSON.stringify({ id, type: 'request', action, payload }));
    });
  }

  broadcast(event: string, payload?: unknown): void {
    if (this.connected) {
      this.client!.send(JSON.stringify({ id: '0', type: 'event', action: event, payload }));
    }
  }

  close(): void {
    this.wss.close();
  }
}
