import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseDataUrl } from '@vigame/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BridgeServer } from '../bridge-server.js';
import { placeholder_asset } from '../tools/assets.js';
import { init_project, project_context, update_context } from '../tools/project.js';

function dataUrlBase64Payload(dataUrl: string): string {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Expected valid data URL');
  }
  return parsed.base64;
}

// ---------------------------------------------------------------------------
// BridgeServer tests
// ---------------------------------------------------------------------------

describe('BridgeServer', () => {
  let bridge: BridgeServer;

  afterEach(() => {
    bridge.close();
  });

  it('rejects with a clear error when no game is connected', async () => {
    bridge = new BridgeServer(17770);
    await expect(bridge.send('screenshot', {})).rejects.toThrow('No game connected');
  });

  it('isConnected() returns false before any client connects', () => {
    bridge = new BridgeServer(17771);
    expect(bridge.isConnected()).toBe(false);
  });

  it('times out and rejects when the game does not respond', async () => {
    // We need an actual WebSocket client to trigger the connection handler
    // but not respond. Use the `ws` package directly.
    const { WebSocket } = await import('ws');
    bridge = new BridgeServer(17772);

    // Wait for server to be ready by attempting to connect
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:17772');
      ws.on('open', () => {
        resolve();
        // Don't close — stay connected but don't respond to messages
      });
      ws.on('error', reject);
    });

    // Allow the 150ms classification timer to fire so the browser client is registered.
    await new Promise((r) => setTimeout(r, 200));

    await expect(bridge.send('screenshot', {}, 200)).rejects.toThrow('timed out after 200ms');
  });

  it('resolves correctly when the game responds', async () => {
    const { WebSocket } = await import('ws');
    bridge = new BridgeServer(17773);

    const ws = await new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
      const client = new WebSocket('ws://localhost:17773');
      client.on('open', () => resolve(client));
      client.on('error', reject);
    });

    // Allow the 150ms classification timer to fire so the browser client is registered.
    await new Promise((r) => setTimeout(r, 200));

    // Echo back a valid response
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as { id: string; command: string };
      ws.send(JSON.stringify({ id: msg.id, result: { fps: 60 } }));
    });

    const result = await bridge.send('perf', {});
    expect(result).toEqual({ fps: 60 });

    ws.close();
  });

  it('matches pending requests when the browser echoes a numeric id (JSON)', async () => {
    const { WebSocket } = await import('ws');
    bridge = new BridgeServer(17775);

    const ws = await new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
      const client = new WebSocket('ws://localhost:17775');
      client.on('open', () => resolve(client));
      client.on('error', reject);
    });

    await new Promise((r) => setTimeout(r, 200));

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as { id: string; command: string };
      // Some JSON serializers emit numeric id — must still correlate.
      ws.send(JSON.stringify({ id: Number(msg.id), result: 'numeric-id-ok' }));
    });

    const result = await bridge.send('perf', {});
    expect(result).toBe('numeric-id-ok');

    ws.close();
  });

  it('correlates responses to the correct pending request', async () => {
    const { WebSocket } = await import('ws');
    bridge = new BridgeServer(17774);

    const ws = await new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
      const client = new WebSocket('ws://localhost:17774');
      client.on('open', () => resolve(client));
      client.on('error', reject);
    });

    // Allow the 150ms classification timer to fire so the browser client is registered.
    await new Promise((r) => setTimeout(r, 200));

    // Respond to each message in reverse order to test correlation
    const received: Array<{ id: string; command: string }> = [];
    ws.on('message', (data: Buffer) => {
      received.push(JSON.parse(data.toString()) as { id: string; command: string });
      if (received.length === 2) {
        // Reply to second message first, then first
        ws.send(JSON.stringify({ id: received[1]?.id, result: 'second' }));
        ws.send(JSON.stringify({ id: received[0]?.id, result: 'first' }));
      }
    });

    const [r1, r2] = await Promise.all([bridge.send('cmd_a', {}), bridge.send('cmd_b', {})]);

    expect(r1).toBe('first');
    expect(r2).toBe('second');

    ws.close();
  });
});

// ---------------------------------------------------------------------------
// Proxy mode: secondary MCP routes through primary
// ---------------------------------------------------------------------------

describe('BridgeServer proxy mode', () => {
  it('secondary MCP forwards commands through primary to browser', async () => {
    const { WebSocket } = await import('ws');

    // Primary MCP — binds the port and holds the browser connection.
    const primary = new BridgeServer(17780);

    // Simulate browser bridge: connects, echoes commands back as results.
    const browser = await new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:17780');
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
    browser.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as { id: string; command: string };
      browser.send(JSON.stringify({ id: msg.id, result: `echo:${msg.command}` }));
    });

    // Wait for primary to register the browser as its client.
    await new Promise((r) => setTimeout(r, 250));

    // Secondary MCP — port 17780 is taken, so it becomes a proxy.
    const secondary = new BridgeServer(17780);
    await new Promise((r) => setTimeout(r, 300));

    expect(secondary.isConnected()).toBe(true);

    const result = await secondary.send('screenshot', {}, 2000);
    expect(result).toBe('echo:screenshot');

    browser.close();
    primary.close();
    secondary.close();
  });

  it('secondary MCP gets "no game" error when browser is not connected', async () => {
    // Primary with no browser connected.
    const primary = new BridgeServer(17781);
    await new Promise((r) => setTimeout(r, 100));

    const secondary = new BridgeServer(17781);
    await new Promise((r) => setTimeout(r, 300));

    await expect(secondary.send('screenshot', {}, 500)).rejects.toThrow('No game connected');

    primary.close();
    secondary.close();
  });

  it('primary and secondary can handle concurrent commands without collision', async () => {
    const { WebSocket } = await import('ws');

    const primary = new BridgeServer(17782);

    const browser = await new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:17782');
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });

    // Delay responses slightly to force overlap.
    browser.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as { id: string; command: string };
      setTimeout(() => {
        browser.send(JSON.stringify({ id: msg.id, result: msg.command }));
      }, 50);
    });

    await new Promise((r) => setTimeout(r, 250));

    const secondary = new BridgeServer(17782);
    await new Promise((r) => setTimeout(r, 300));

    const [fromPrimary, fromSecondary] = await Promise.all([
      primary.send('cmd_primary', {}, 2000),
      secondary.send('cmd_secondary', {}, 2000),
    ]);

    expect(fromPrimary).toBe('cmd_primary');
    expect(fromSecondary).toBe('cmd_secondary');

    browser.close();
    primary.close();
    secondary.close();
  });
});

// ---------------------------------------------------------------------------
// Project context tests
// ---------------------------------------------------------------------------

describe('Project context', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigame-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns "No project context" when .vigame/ does not exist', () => {
    const result = project_context({ cwd: tmpDir });
    expect(result).toContain('No project context found');
  });

  it('init_project creates all four context files', () => {
    const result = init_project({
      gameDescription: 'A top-down shooter',
      renderer: 'three',
      cwd: tmpDir,
    });
    expect(result.created.length).toBe(4);
    for (const filePath of result.created) {
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('init_project manifest contains renderer and created timestamp', () => {
    init_project({ gameDescription: 'Test', renderer: 'phaser', cwd: tmpDir });
    const manifestPath = path.join(tmpDir, '.vigame', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      renderer: string;
      created: string;
    };
    expect(manifest.renderer).toBe('phaser');
    expect(typeof manifest.created).toBe('string');
  });

  it('project_context returns all sections after init', () => {
    init_project({
      gameDescription: 'A platformer game',
      renderer: 'three',
      cwd: tmpDir,
    });
    const ctx = project_context({ cwd: tmpDir });
    expect(ctx).toContain('manifest.json');
    expect(ctx).toContain('design.md');
    expect(ctx).toContain('decisions.md');
    expect(ctx).toContain('known-issues.md');
    expect(ctx).toContain('A platformer game');
  });

  it('update_context writes new content to the correct file', () => {
    init_project({ gameDescription: 'Test', renderer: 'three', cwd: tmpDir });
    update_context({ section: 'design', content: '# New Design\nFoo bar.', cwd: tmpDir });
    const designPath = path.join(tmpDir, '.vigame', 'design.md');
    const content = fs.readFileSync(designPath, 'utf8');
    expect(content).toBe('# New Design\nFoo bar.');
  });

  it('update_context creates .vigame/ if it does not exist', () => {
    update_context({
      section: 'decisions',
      content: '# Decisions\nUsed ECS.',
      cwd: tmpDir,
    });
    const filePath = path.join(tmpDir, '.vigame', 'decisions.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Placeholder asset tests
// ---------------------------------------------------------------------------

describe('placeholder_asset', () => {
  it('returns an SVG data URL', () => {
    const result = placeholder_asset({ type: 'texture', width: 64, height: 64 });
    expect(result.format).toBe('svg');
    expect(result.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('respects width and height', () => {
    const result = placeholder_asset({ type: 'sprite', width: 128, height: 256 });
    expect(result.width).toBe(128);
    expect(result.height).toBe(256);
    // Decode and check SVG contains correct dimensions
    const svgBase64 = dataUrlBase64Payload(result.dataUrl);
    const svg = Buffer.from(svgBase64, 'base64').toString('utf8');
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="256"');
  });

  it('includes the label in the SVG', () => {
    const result = placeholder_asset({
      type: 'sprite',
      width: 32,
      height: 32,
      label: 'PlayerSprite',
    });
    const svgBase64 = dataUrlBase64Payload(result.dataUrl);
    const svg = Buffer.from(svgBase64, 'base64').toString('utf8');
    expect(svg).toContain('PlayerSprite');
  });

  it('uses custom color in the SVG', () => {
    const result = placeholder_asset({
      type: 'sprite',
      width: 32,
      height: 32,
      color: '#ff0000',
    });
    const svgBase64 = dataUrlBase64Payload(result.dataUrl);
    const svg = Buffer.from(svgBase64, 'base64').toString('utf8');
    expect(svg).toContain('#ff0000');
  });

  it('texture variant includes a checkerboard pattern definition', () => {
    const result = placeholder_asset({ type: 'texture', width: 64, height: 64 });
    const svgBase64 = dataUrlBase64Payload(result.dataUrl);
    const svg = Buffer.from(svgBase64, 'base64').toString('utf8');
    expect(svg).toContain('url(#checker)');
  });

  it('escapes XML special characters in the label', () => {
    const result = placeholder_asset({
      type: 'sprite',
      width: 32,
      height: 32,
      label: '<Enemy & "Boss">',
    });
    const svgBase64 = dataUrlBase64Payload(result.dataUrl);
    const svg = Buffer.from(svgBase64, 'base64').toString('utf8');
    expect(svg).not.toContain('<Enemy');
    expect(svg).toContain('&lt;Enemy');
  });
});
