// Simple relay server — broadcast messages from one client to all others
// Run with: node dist/server.js
// Requires the 'ws' package: pnpm add ws

interface WSLike {
  readyState: number;
  send(data: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

interface WSSLike {
  on(event: 'connection', listener: (ws: WSLike) => void): void;
}

interface WSModule {
  WebSocketServer: new (opts: { port: number }) => WSSLike;
}

export async function startRelayServer(port = 8080): Promise<void> {
  let WS: WSModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    WS = (await import(/* @vite-ignore */ ('ws' as string))) as unknown as WSModule;
  } catch {
    throw new Error('Install "ws" package to use startRelayServer: pnpm add ws');
  }

  const { WebSocketServer } = WS;
  const wss = new WebSocketServer({ port });
  const clients = new Set<WSLike>();
  let clientCounter = 0;

  wss.on('connection', (ws) => {
    clients.add(ws);
    const id = String(++clientCounter);
    ws.send(JSON.stringify({ type: '__assign_id__', payload: id }));

    ws.on('message', (...args) => {
      const raw = args[0];
      const msg = typeof raw === 'string' ? raw : String(raw);
      for (const client of clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(msg);
        }
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  console.log(`[vigame] Relay server listening on ws://localhost:${port}`);
}
