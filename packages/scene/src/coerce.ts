/**
 * Parse a space-separated string of numbers into an array.
 * e.g. "0 -9.81 0" → [0, -9.81, 0]
 */
export function parseVec(s: string): number[] {
  return s.trim().split(/\s+/).map(Number);
}

/**
 * Serialize an array of numbers into a space-separated string.
 * e.g. [0, -9.81, 0] → "0 -9.81 0"
 */
export function serializeVec(v: number[]): string {
  return v.join(' ');
}

/**
 * Auto-coerce an attribute string value to the appropriate JS type.
 * - "true"/"false" → boolean
 * - numeric strings → number
 * - everything else → string
 */
export function coerceValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  if (!Number.isNaN(n) && value.trim() !== '') return n;
  return value;
}
