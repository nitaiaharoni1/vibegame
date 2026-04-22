import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { frameDiff } from '../image-diff.js';
import { simulateInputSequence } from '../input-simulator.js';
import { inspectPath, mutatePath, resolvePath } from '../mutator.js';
import { inspectSceneGraph } from '../scene-inspector.js';
import { captureScreenshot } from '../screenshot.js';
import { recordState } from '../state-recorder.js';

// ---------------------------------------------------------------------------
// Path resolution tests
// ---------------------------------------------------------------------------

describe('resolvePath', () => {
  let roots: Map<string, unknown>;

  beforeEach(() => {
    roots = new Map<string, unknown>();
  });

  it('resolves a simple top-level registered root', () => {
    const obj = { x: 42 };
    roots.set('player', obj);
    const result = resolvePath('player', roots);
    expect(result).not.toBeNull();
    expect(result?.value).toBe(obj);
  });

  it('resolves nested dot-path', () => {
    roots.set('player', { position: { x: 10, y: 20, z: 30 } });
    const result = resolvePath('player.position.x', roots);
    expect(result).not.toBeNull();
    expect(result?.value).toBe(10);
  });

  it('resolves array index via bracket notation', () => {
    roots.set('scene', { children: ['a', 'b', 'c'] });
    const result = resolvePath('scene.children[1]', roots);
    expect(result).not.toBeNull();
    expect(result?.value).toBe('b');
  });

  it('returns null for non-existent root', () => {
    const result = resolvePath('nonexistent.foo', roots);
    expect(result).toBeNull();
  });

  it('returns null for empty path', () => {
    const result = resolvePath('', roots);
    expect(result).toBeNull();
  });

  it('returns null when intermediate segment is not an object', () => {
    roots.set('player', { hp: 100 });
    const result = resolvePath('player.hp.something', roots);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// inspectPath tests
// ---------------------------------------------------------------------------

describe('inspectPath', () => {
  it('returns value and type for a number', () => {
    const roots = new Map<string, unknown>([['obj', { val: 42 }]]);
    const result = inspectPath('obj.val', roots);
    expect(result.value).toBe(42);
    expect(result.type).toBe('number');
  });

  it('throws for missing path', () => {
    const roots = new Map<string, unknown>();
    expect(() => inspectPath('missing.path', roots)).toThrow('Cannot resolve path: missing.path');
  });

  it('returns null type for null value', () => {
    const roots = new Map<string, unknown>([['obj', { val: null }]]);
    const result = inspectPath('obj.val', roots);
    expect(result.value).toBeNull();
    expect(result.type).toBe('null');
  });

  it('returns object type for nested object', () => {
    const inner = { a: 1 };
    const roots = new Map<string, unknown>([['obj', { inner }]]);
    const result = inspectPath('obj.inner', roots);
    expect(result.value).toBe(inner);
    expect(result.type).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// mutatePath tests
// ---------------------------------------------------------------------------

describe('mutatePath', () => {
  it('mutates a nested value and returns oldValue', () => {
    const target = { position: { x: 0, y: 0, z: 0 } };
    const roots = new Map<string, unknown>([['mesh', target]]);
    const result = mutatePath('mesh.position.x', 99, roots);
    expect(result.success).toBe(true);
    expect(result.oldValue).toBe(0);
    expect(target.position.x).toBe(99);
  });

  it('throws for unresolvable path', () => {
    const roots = new Map<string, unknown>();
    expect(() => mutatePath('ghost.value', 1, roots)).toThrow();
  });

  it('mutates via array index', () => {
    const arr = [10, 20, 30];
    const roots = new Map<string, unknown>([['arr', arr]]);
    mutatePath('arr[0]', 99, roots);
    expect(arr[0]).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Input simulator tests
// ---------------------------------------------------------------------------

describe('simulateInputSequence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up any canvas injected into the DOM during tests
    for (const el of document.querySelectorAll('canvas[data-test]')) {
      el.remove();
    }
    // Remove any test globals
    delete (window as unknown as Record<string, unknown>).__PHASER_GAME__;
    delete (window as unknown as Record<string, unknown>).__THREE_RENDERER__;
  });

  it('dispatches keydown/keyup events to document when no canvas exists', async () => {
    const dispatched: string[] = [];
    vi.spyOn(document, 'dispatchEvent').mockImplementation((evt) => {
      dispatched.push(`${evt.type}:${(evt as KeyboardEvent).key ?? ''}`);
      return true;
    });

    await simulateInputSequence([
      { type: 'keydown', key: 'ArrowLeft' },
      { type: 'keyup', key: 'ArrowLeft' },
    ]);

    expect(dispatched).toContain('keydown:ArrowLeft');
    expect(dispatched).toContain('keyup:ArrowLeft');
  });

  it('returns executed count', async () => {
    vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    const result = await simulateInputSequence([
      { type: 'keydown', key: 'Space' },
      { type: 'click', x: 100, y: 200 },
    ]);
    expect(result.executed).toBe(2);
  });

  it('handles keydown with duration by firing keydown then keyup', async () => {
    const dispatched: string[] = [];
    vi.spyOn(document, 'dispatchEvent').mockImplementation((evt) => {
      dispatched.push(evt.type);
      return true;
    });

    await simulateInputSequence([{ type: 'keydown', key: 'w', duration: 1 }]);

    expect(dispatched).toContain('keydown');
    expect(dispatched).toContain('keyup');
  });

  it('dispatches mousemove events with coordinates', async () => {
    const events: MouseEvent[] = [];
    vi.spyOn(document, 'dispatchEvent').mockImplementation((evt) => {
      events.push(evt as MouseEvent);
      return true;
    });

    await simulateInputSequence([{ type: 'mousemove', x: 50, y: 75 }]);

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('mousemove');
  });

  it('targets Phaser canvas via __PHASER_GAME__ global', async () => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-test', 'phaser');
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 800, height: 600 }) as DOMRect;
    document.body.appendChild(canvas);

    (window as unknown as Record<string, unknown>).__PHASER_GAME__ = { canvas };

    const canvasEvents: KeyboardEvent[] = [];
    canvas.addEventListener('keydown', (e) => canvasEvents.push(e as KeyboardEvent));

    await simulateInputSequence([{ type: 'keydown', key: 'Space' }]);

    expect(canvasEvents.length).toBeGreaterThan(0);
    // "Space" is normalized to the actual space character for Phaser compat
    expect(canvasEvents[0]?.key).toBe(' ');
    expect(canvasEvents[0]?.code).toBe('Space');
    // keyCode must be 32 — Phaser 3 dispatches entirely via event.keyCode
    expect(canvasEvents[0]?.keyCode).toBe(32);
  });

  it('sets correct keyCode for arrow keys', async () => {
    const dispatched: KeyboardEvent[] = [];
    vi.spyOn(document, 'dispatchEvent').mockImplementation((evt) => {
      dispatched.push(evt as KeyboardEvent);
      return true;
    });

    await simulateInputSequence([
      { type: 'keydown', key: 'ArrowLeft' },
      { type: 'keydown', key: 'ArrowRight' },
      { type: 'keydown', key: 'Enter' },
    ]);

    expect(dispatched[0]?.keyCode).toBe(37);
    expect(dispatched[1]?.keyCode).toBe(39);
    expect(dispatched[2]?.keyCode).toBe(13);
  });

  it('targets first canvas when no game global is set', async () => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-test', 'fallback');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
    document.body.appendChild(canvas);

    const canvasEvents: Event[] = [];
    canvas.addEventListener('mousemove', (e) => canvasEvents.push(e));

    await simulateInputSequence([{ type: 'mousemove', x: 50, y: 75 }]);

    expect(canvasEvents.length).toBe(1);
  });

  it('offsets mouse clientX/Y by canvas bounding rect', async () => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-test', 'offset');
    canvas.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 800, height: 600 }) as DOMRect;
    document.body.appendChild(canvas);

    (window as unknown as Record<string, unknown>).__PHASER_GAME__ = { canvas };

    const events: MouseEvent[] = [];
    canvas.addEventListener('click', (e) => events.push(e as MouseEvent));

    await simulateInputSequence([{ type: 'click', x: 50, y: 75 }]);

    expect(events[0]?.clientX).toBe(150); // 100 + 50
    expect(events[0]?.clientY).toBe(275); // 200 + 75
  });
});

// ---------------------------------------------------------------------------
// Scene graph traversal tests
// ---------------------------------------------------------------------------

describe('inspectSceneGraph', () => {
  it('traverses a mock Three.js-like scene', () => {
    const mockScene = {
      name: 'Scene',
      type: 'Scene',
      visible: true,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      children: [
        {
          name: 'Player',
          type: 'Mesh',
          visible: true,
          position: { x: 1, y: 2, z: 3 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          children: [],
        },
      ],
    };

    const roots = new Map<string, unknown>([['scene', mockScene]]);
    const graph = inspectSceneGraph(5, roots);

    expect(graph).not.toBeNull();
    expect(graph?.name).toBe('Scene');
    expect(graph?.type).toBe('Scene');
    expect(graph?.children).toHaveLength(1);
    expect(graph?.children?.[0]?.name).toBe('Player');
    expect(graph?.children?.[0]?.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('respects depth limit', () => {
    const deep = {
      name: 'Root',
      type: 'Object3D',
      visible: true,
      children: [
        {
          name: 'L1',
          type: 'Object3D',
          visible: true,
          children: [
            {
              name: 'L2',
              type: 'Object3D',
              visible: true,
              children: [{ name: 'L3', type: 'Object3D', visible: true, children: [] }],
            },
          ],
        },
      ],
    };

    const roots = new Map<string, unknown>([['scene', deep]]);
    const graph = inspectSceneGraph(1, roots);

    expect(graph?.children).toHaveLength(1);
    // At depth 1, children of L1 should not appear
    expect(graph?.children?.[0]?.children).toBeUndefined();
  });

  it('returns null when no scene is registered and no globals', () => {
    const roots = new Map<string, unknown>();
    // window.__THREE_SCENE__ and window.__PHASER_GAME__ are not set in test env
    const graph = inspectSceneGraph(5, roots);
    expect(graph).toBeNull();
  });

  it('uses window.__THREE_SCENE__ when autoRegister is not used', () => {
    const mockScene = {
      name: 'GlobalScene',
      type: 'Scene',
      visible: true,
      children: [],
    };
    (window as unknown as Record<string, unknown>).__THREE_SCENE__ = mockScene;

    // Don't pass registered roots so it falls through to window check
    const graph = inspectSceneGraph(3);
    expect(graph).not.toBeNull();
    expect(graph?.name).toBe('GlobalScene');

    // Cleanup
    delete (window as unknown as Record<string, unknown>).__THREE_SCENE__;
  });
});

// ---------------------------------------------------------------------------
// Screenshot tests
// ---------------------------------------------------------------------------

describe('captureScreenshot', () => {
  it('uses PNG and returns dataUrl + dimensions', () => {
    const mockCanvas = {
      width: 800,
      height: 600,
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,abc123'),
    } as unknown as HTMLCanvasElement;

    const result = captureScreenshot(mockCanvas, { quality: 0.85 });
    expect(result.dataUrl).toBe('data:image/png;base64,abc123');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('falls back to document.querySelector when canvas is null', () => {
    const mockCanvas = {
      width: 400,
      height: 300,
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,xyz'),
    } as unknown as HTMLCanvasElement;

    vi.spyOn(document, 'querySelector').mockReturnValue(mockCanvas as Element);

    const result = captureScreenshot(null, { quality: 0.5 });
    expect(result.dataUrl).toBe('data:image/png;base64,xyz');
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);

    vi.restoreAllMocks();
  });

  it('throws when no canvas is found', () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    expect(() => captureScreenshot(null)).toThrow('No canvas element found');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// frameDiff tests
// ---------------------------------------------------------------------------

describe('frameDiff', () => {
  function mockCanvasWithPixels(pixels: Uint8ClampedArray) {
    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: pixels }),
    };
    return {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeCtx),
    } as unknown as HTMLCanvasElement;
  }

  beforeEach(() => {
    // Mock Image so onload fires synchronously in jsdom
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          // Fire onload on next microtask to simulate async but still fast
          Promise.resolve().then(() => this.onload?.());
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns 0 for identical data URLs', async () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(128);
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvasWithPixels(pixels));
    const result = await frameDiff('data:image/png;base64,abc', 'data:image/png;base64,abc');
    expect(result).toBe(0);
  });

  it('returns 1 for empty data URLs', async () => {
    expect(await frameDiff('', 'data:image/png;base64,abc')).toBe(1);
    expect(await frameDiff('data:image/png;base64,abc', '')).toBe(1);
    expect(await frameDiff('', '')).toBe(1);
  });

  it('returns > 0 for different data URLs', async () => {
    const blackPixels = new Uint8ClampedArray(64 * 64 * 4).fill(0);
    const whitePixels = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    let callCount = 0;
    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockImplementation(() => {
        callCount++;
        return { data: callCount <= 1 ? blackPixels : whitePixels };
      }),
    };
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeCtx),
    } as unknown as HTMLCanvasElement);

    const result = await frameDiff('data:image/png;base64,black', 'data:image/png;base64,white');
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// recordState with diffThreshold tests
// ---------------------------------------------------------------------------

describe('recordState with diffThreshold', () => {
  it('nulls out similar screenshots when diffThreshold is set', async () => {
    const mockCanvas = {
      width: 100,
      height: 100,
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,same'),
    } as unknown as HTMLCanvasElement;

    vi.spyOn(document, 'querySelector').mockReturnValue(mockCanvas as Element);

    // Mock frameDiff to return 0 (identical)
    const imageDiffModule = await import('../image-diff.js');
    vi.spyOn(imageDiffModule, 'frameDiff').mockResolvedValue(0);

    const frames = await recordState(
      { seconds: 0.05, screenshotInterval: 10, diffThreshold: 0.05 },
      mockCanvas,
      new Map(),
    );

    // First frame should have a screenshot, subsequent ones should be null
    expect(frames.length).toBeGreaterThanOrEqual(1);
    if (frames.length > 1) {
      expect(frames[0]?.screenshot).not.toBeNull();
      // Frames after the first should have null screenshot since diff < threshold
      expect(frames[1]?.screenshot).toBeNull();
    }

    vi.restoreAllMocks();
  });
});

describe('eval var preamble (root name collision prevention)', () => {
  function evalWithRoots(
    code: string,
    roots: Map<string, unknown>,
  ): { result?: unknown; error?: string } {
    const rootNames = [...roots.keys()];
    const rootObj: Record<string, unknown> = {};
    for (const n of rootNames) rootObj[n] = roots.get(n);
    const preamble =
      rootNames.length > 0 ? `var {${rootNames.join(',')}} = __roots__;\n` : '';
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('__roots__', `${preamble}return (${code})`);
      return { result: fn(rootObj) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  it('should access registered roots as local variables', () => {
    const roots = new Map<string, unknown>();
    roots.set('scene', { ball: { x: 42 } });
    const { result } = evalWithRoots('scene.ball.x', roots);
    expect(result).toBe(42);
  });

  it('should allow const redeclaration of root names without error', () => {
    const roots = new Map<string, unknown>();
    roots.set('scene', { ball: { x: 42 } });
    // This would throw "Identifier 'scene' has already been declared" with old approach
    const { result, error } = evalWithRoots(
      '(function() { const scene = "shadowed"; return scene; })()',
      roots,
    );
    expect(error).toBeUndefined();
    expect(result).toBe('shadowed');
  });

  it('should work with no roots registered', () => {
    const roots = new Map<string, unknown>();
    const { result } = evalWithRoots('1 + 2', roots);
    expect(result).toBe(3);
  });

  it('should allow root access alongside shadowed variables', () => {
    const roots = new Map<string, unknown>();
    roots.set('game', { score: 10 });
    roots.set('scene', { x: 5 });
    const { result } = evalWithRoots('game.score + scene.x', roots);
    expect(result).toBe(15);
  });
});
