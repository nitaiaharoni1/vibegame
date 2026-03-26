import type { World } from "../ecs/world.js";

export interface EventDef<T> {
  name: string;
  _phantom?: T;
}

export function defineEvent<T>(name: string): EventDef<T> {
  return { name };
}

export function emit<T>(world: World, event: EventDef<T>, payload: T): void {
  const handlers = world.eventHandlers.get(event.name);
  if (!handlers) return;
  for (const handler of handlers) {
    handler(payload as unknown);
  }
}

export function on<T>(
  world: World,
  event: EventDef<T>,
  handler: (payload: T) => void
): () => void {
  let handlers = world.eventHandlers.get(event.name);
  if (!handlers) {
    handlers = new Set();
    world.eventHandlers.set(event.name, handlers);
  }
  const wrappedHandler = handler as (payload: unknown) => void;
  handlers.add(wrappedHandler);

  return () => {
    world.eventHandlers.get(event.name)?.delete(wrappedHandler);
  };
}

export function off<T>(
  world: World,
  event: EventDef<T>,
  handler: (payload: T) => void
): void {
  const wrappedHandler = handler as (payload: unknown) => void;
  world.eventHandlers.get(event.name)?.delete(wrappedHandler);
}
