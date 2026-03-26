export interface ParsedDataUrl {
  /** e.g. `image/png` */
  mimeType: string;
  /** Raw base64 payload (no `data:` prefix) */
  base64: string;
}

/**
 * Parse a `data:<mime>;base64,<data>` URL into MIME + base64 payload.
 * Returns `null` if the string is not a valid data URL.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  if (!dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return null;
  const meta = dataUrl.slice(5, comma);
  const mimeType = meta.split(';')[0]?.trim() ?? 'image/png';
  const base64 = dataUrl.slice(comma + 1);
  return { mimeType, base64 };
}

/**
 * MIME type from a data URL header (e.g. `data:image/webp;base64,...` → `image/webp`).
 * Fallback `image/jpeg` when no `;` is found (legacy screenshot handling).
 */
export function mimeFromDataUrl(dataUrl: string): string {
  const end = dataUrl.indexOf(';');
  return end !== -1 ? dataUrl.slice(5, end) : 'image/jpeg';
}
