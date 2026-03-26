import type { World, VibePlugin } from '@vigame/core';
import { defineSystem, Phase } from '@vigame/core';

export interface InputState {
  keysDown: Set<string>;
  keysJustPressed: Set<string>;
  keysJustReleased: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDeltaX: number;
  mouseDeltaY: number;
  mouseButtonsDown: Set<number>;
  mouseButtonsJustPressed: Set<number>;
  mouseButtonsJustReleased: Set<number>;
}

// Global input state — accessible via getInputState(world)
const stateMap = new WeakMap<World, InputState>();

export function getInputState(world: World): InputState | undefined {
  return stateMap.get(world);
}

export function isKeyDown(world: World, key: string): boolean {
  return stateMap.get(world)?.keysDown.has(key) ?? false;
}

export function isKeyJustPressed(world: World, key: string): boolean {
  return stateMap.get(world)?.keysJustPressed.has(key) ?? false;
}

export function isKeyJustReleased(world: World, key: string): boolean {
  return stateMap.get(world)?.keysJustReleased.has(key) ?? false;
}

export function isMouseButtonDown(world: World, button: number): boolean {
  return stateMap.get(world)?.mouseButtonsDown.has(button) ?? false;
}

export function getMousePosition(world: World): { x: number; y: number } {
  const s = stateMap.get(world);
  return s ? { x: s.mouseX, y: s.mouseY } : { x: 0, y: 0 };
}

export function getMouseDelta(world: World): { x: number; y: number } {
  const s = stateMap.get(world);
  return s ? { x: s.mouseDeltaX, y: s.mouseDeltaY } : { x: 0, y: 0 };
}

export function InputPlugin(canvas?: HTMLCanvasElement): VibePlugin {
  let state: InputState;
  let boundMouseTarget: EventTarget | null = null;

  const handleKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (!state.keysDown.has(ke.code)) {
      state.keysJustPressed.add(ke.code);
    }
    state.keysDown.add(ke.code);
  };

  const handleKeyUp = (e: Event) => {
    const ke = e as KeyboardEvent;
    state.keysDown.delete(ke.code);
    state.keysJustReleased.add(ke.code);
  };

  const handleMouseMove = (e: Event) => {
    const me = e as MouseEvent;
    state.mouseDeltaX = me.movementX;
    state.mouseDeltaY = me.movementY;
    state.mouseX = me.clientX;
    state.mouseY = me.clientY;
  };

  const handleMouseDown = (e: Event) => {
    const me = e as MouseEvent;
    if (!state.mouseButtonsDown.has(me.button)) {
      state.mouseButtonsJustPressed.add(me.button);
    }
    state.mouseButtonsDown.add(me.button);
  };

  const handleMouseUp = (e: Event) => {
    const me = e as MouseEvent;
    state.mouseButtonsDown.delete(me.button);
    state.mouseButtonsJustReleased.add(me.button);
  };

  return {
    name: 'InputPlugin',
    setup(world: World) {
      state = {
        keysDown: new Set(),
        keysJustPressed: new Set(),
        keysJustReleased: new Set(),
        mouseX: 0,
        mouseY: 0,
        mouseDeltaX: 0,
        mouseDeltaY: 0,
        mouseButtonsDown: new Set(),
        mouseButtonsJustPressed: new Set(),
        mouseButtonsJustReleased: new Set(),
      };
      stateMap.set(world, state);

      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        boundMouseTarget = canvas ?? window;
        boundMouseTarget.addEventListener('mousemove', handleMouseMove);
        boundMouseTarget.addEventListener('mousedown', handleMouseDown);
        boundMouseTarget.addEventListener('mouseup', handleMouseUp);
      }
    },
    systems() {
      return [
        defineSystem({
          name: 'InputFlush',
          phase: Phase.Render,
          execute(_world, _delta) {
            state.keysJustPressed.clear();
            state.keysJustReleased.clear();
            state.mouseButtonsJustPressed.clear();
            state.mouseButtonsJustReleased.clear();
            state.mouseDeltaX = 0;
            state.mouseDeltaY = 0;
          },
        }),
      ];
    },
    teardown() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        if (boundMouseTarget) {
          boundMouseTarget.removeEventListener('mousemove', handleMouseMove);
          boundMouseTarget.removeEventListener('mousedown', handleMouseDown);
          boundMouseTarget.removeEventListener('mouseup', handleMouseUp);
        }
      }
    },
  };
}
