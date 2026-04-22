import {
  SPECIAL_KEY_CODES as _SPECIAL_KEY_CODES,
  SPECIAL_KEY_CODES_TO_CODE as _SPECIAL_KEY_CODES_TO_CODE,
} from '@vigame/protocol';

export interface InputEvent {
  type: 'keydown' | 'keyup' | 'keypress' | 'click' | 'mousemove' | 'mousedown' | 'mouseup';
  key?: string;
  button?: number;
  x?: number;
  y?: number;
  duration?: number;
}

export interface InputResult {
  executed: number;
}

/** Resolve the best event target for keyboard/mouse events.
 *
 * Phaser and many game engines listen on the canvas element, not `document`.
 * Priority:
 *  1. Phaser: `window.__PHASER_GAME__.canvas`
 *  2. Three.js: `window.__THREE_RENDERER__.domElement`
 *  3. First `<canvas>` in the DOM
 *  4. `document` (legacy fallback)
 */
function getInputTarget(): HTMLCanvasElement | Document {
  const w = window as unknown as Record<string, unknown>;

  const phaserGame = w.__PHASER_GAME__ as { canvas?: HTMLCanvasElement } | undefined;
  if (phaserGame?.canvas instanceof HTMLCanvasElement) return phaserGame.canvas;

  const threeRenderer = w.__THREE_RENDERER__ as { domElement?: HTMLCanvasElement } | undefined;
  if (threeRenderer?.domElement instanceof HTMLCanvasElement) return threeRenderer.domElement;

  const firstCanvas = document.querySelector('canvas');
  if (firstCanvas) return firstCanvas;

  return document;
}

/** Map `KeyboardEvent.key` values to legacy `keyCode` numbers.
 *  Phaser 3 dispatches entirely via `event.keyCode`, so this must be correct. */
export const SPECIAL_KEY_CODES = _SPECIAL_KEY_CODES;

/** Map `KeyboardEvent.key` to `KeyboardEvent.code`. */
export const SPECIAL_KEY_CODES_TO_CODE = _SPECIAL_KEY_CODES_TO_CODE;

function resolveKeyCode(key: string): number {
  if (key.length === 1) {
    const upper = key.toUpperCase();
    // 0-9 → 48-57, A-Z → 65-90
    return upper.charCodeAt(0);
  }
  return SPECIAL_KEY_CODES[key] ?? 0;
}

function resolveCode(key: string): string {
  if (key.length === 1) {
    const ch = key.toUpperCase();
    if (ch >= '0' && ch <= '9') return `Digit${ch}`;
    return `Key${ch}`;
  }
  return SPECIAL_KEY_CODES_TO_CODE[key] ?? key;
}

function dispatchKey(type: 'keydown' | 'keyup' | 'keypress', key: string): void {
  const target = getInputTarget();
  const keyCode = resolveKeyCode(key);
  const event = new KeyboardEvent(type, {
    key: key === 'Space' ? ' ' : key,
    code: resolveCode(key),
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  // Also dispatch to document and window so global listeners (Phaser keyboard) fire
  if (target !== document) {
    document.dispatchEvent(event);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(event);
  }
}

function dispatchMouse(
  type: 'click' | 'mousemove' | 'mousedown' | 'mouseup',
  x: number,
  y: number,
  button: number,
): void {
  const target = getInputTarget();
  // If dispatching to a canvas, convert logical coordinates to clientX/Y
  // by offsetting with the canvas bounding rect so the game sees correct coords.
  let clientX = x;
  let clientY = y;
  if (target instanceof HTMLCanvasElement) {
    const rect = target.getBoundingClientRect();
    clientX = rect.left + x;
    clientY = rect.top + y;
  }
  const event = new MouseEvent(type, {
    clientX,
    clientY,
    button,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateInputSequence(sequence: InputEvent[]): Promise<InputResult> {
  let executed = 0;

  for (const evt of sequence) {
    switch (evt.type) {
      case 'keydown':
      case 'keyup':
      case 'keypress': {
        const key = evt.key ?? '';
        if (evt.type === 'keydown' && evt.duration !== undefined && evt.duration > 0) {
          dispatchKey('keydown', key);
          executed++;
          await delay(evt.duration);
          dispatchKey('keyup', key);
          executed++;
        } else {
          dispatchKey(evt.type, key);
          executed++;
        }
        break;
      }
      case 'click':
      case 'mousemove':
      case 'mousedown':
      case 'mouseup': {
        dispatchMouse(evt.type, evt.x ?? 0, evt.y ?? 0, evt.button ?? 0);
        executed++;
        break;
      }
    }
  }

  return { executed };
}
