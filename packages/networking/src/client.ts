import { EventEmitter } from 'events';

export interface NetMessage {
  type: string;
  payload: unknown;
  from?: string;
}

export class NetworkClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  constructor(url: string) {
    super();
    this.url = url;
  }

  get connected(): boolean { return this._connected; }
  get id(): string | null { return this.clientId; }

  connect(): void {
    if (typeof WebSocket === 'undefined') return; // Node env
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this._connected = true;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this.emit('connect');
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as NetMessage;
          if (msg.type === '__assign_id__') {
            this.clientId = msg.payload as string;
          }
          this.emit('message', msg);
          this.emit(msg.type, msg.payload);
        } catch { /* ignore */ }
      };
      this.ws.onclose = () => {
        this._connected = false;
        this.emit('disconnect');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
      this.ws.onerror = () => { /* will trigger onclose */ };
    } catch {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  send(type: string, payload: unknown): void {
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this._connected = false;
  }
}
