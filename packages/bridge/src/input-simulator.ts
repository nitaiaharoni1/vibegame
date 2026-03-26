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

function dispatchKey(type: 'keydown' | 'keyup' | 'keypress', key: string): void {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
}

function dispatchMouse(
  type: 'click' | 'mousemove' | 'mousedown' | 'mouseup',
  x: number,
  y: number,
  button: number,
): void {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
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
