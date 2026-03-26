/** Build an object without `undefined` values (for `exactOptionalPropertyTypes`). */
export function omitUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as { [K in keyof T]: Exclude<T[K], undefined> };
}
