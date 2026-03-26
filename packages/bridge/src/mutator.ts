export interface InspectResult {
  value: unknown;
  type: string;
}

export interface MutateResult {
  success: true;
  oldValue: unknown;
}

type PathSegment = string | number;

function parsePathSegments(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  // Split on dots but handle array notation like [0]
  const raw = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  for (const seg of raw) {
    if (seg === '') continue;
    const num = Number(seg);
    segments.push(Number.isNaN(num) ? seg : num);
  }
  return segments;
}

function resolveRoot(firstKey: string, registeredRoots: Map<string, unknown>): unknown {
  if (registeredRoots.has(firstKey)) {
    return registeredRoots.get(firstKey);
  }
  if (typeof window !== 'undefined') {
    const win = window as unknown as Record<string, unknown>;
    // Well-known roots
    for (const rootName of ['__THREE_SCENE__', '__PHASER_GAME__', '__VIGAME_WORLD__']) {
      if (firstKey === rootName && win[rootName] !== undefined) {
        return win[rootName];
      }
    }
    if (firstKey in win) {
      return win[firstKey];
    }
  }
  return undefined;
}

export function resolvePath(
  path: string,
  registeredRoots: Map<string, unknown>,
): { parent: Record<string | number, unknown>; lastKey: string | number; value: unknown } | null {
  const segments = parsePathSegments(path);
  if (segments.length === 0) return null;

  const firstKey = segments[0];
  if (typeof firstKey !== 'string') return null;

  const rootValue: unknown = resolveRoot(firstKey, registeredRoots);
  if (rootValue === undefined) return null;

  // Single-segment path: the root IS the value
  if (segments.length === 1) {
    // Build a synthetic parent so mutations work
    const syntheticParent = new Map<string, unknown>(registeredRoots);
    const proxy: Record<string | number, unknown> = {
      get [firstKey]() {
        return syntheticParent.get(firstKey);
      },
      set [firstKey](v: unknown) {
        syntheticParent.set(firstKey, v);
        registeredRoots.set(firstKey, v);
      },
    };
    return { parent: proxy, lastKey: firstKey, value: rootValue };
  }

  let current: unknown = rootValue;

  // Walk segments between root and last
  for (let i = 1; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (seg === undefined) return null;
    if (typeof current !== 'object' || current === null) return null;
    current = (current as Record<string | number, unknown>)[seg];
  }

  const lastKey = segments[segments.length - 1];
  if (lastKey === undefined) return null;

  if (typeof current !== 'object' || current === null) return null;

  const parent = current as Record<string | number, unknown>;
  const value = parent[lastKey];

  return { parent, lastKey, value };
}

export function inspectPath(path: string, registeredRoots: Map<string, unknown>): InspectResult {
  const resolved = resolvePath(path, registeredRoots);
  if (resolved === null) {
    throw new Error(`Cannot resolve path: ${path}`);
  }
  const { value } = resolved;
  return { value, type: value === null ? 'null' : typeof value };
}

export function mutatePath(
  path: string,
  value: unknown,
  registeredRoots: Map<string, unknown>,
): MutateResult {
  const resolved = resolvePath(path, registeredRoots);
  if (resolved === null) {
    throw new Error(`Cannot resolve path: ${path}`);
  }
  const { parent, lastKey, value: oldValue } = resolved;
  parent[lastKey] = value;
  return { success: true, oldValue };
}
