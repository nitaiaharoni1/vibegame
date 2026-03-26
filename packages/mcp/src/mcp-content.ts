/**
 * Helpers for MCP tool responses (text / JSON blocks).
 * Centralizes pretty-printing so tool output stays consistent.
 */

export function toolJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Single `text` block for composing with `image` blocks. */
export function textBlock(text: string): { type: 'text'; text: string } {
  return { type: 'text' as const, text };
}

/** Single `text` block with pretty-printed JSON. */
export function textBlockJson(value: unknown): { type: 'text'; text: string } {
  return textBlock(toolJsonStringify(value));
}

/** Tool result that is only one text part (JSON body). */
export function mcpJsonResult(value: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return { content: [textBlockJson(value)] };
}

/** Tool result that is only one plain text part. */
export function mcpTextResult(text: string): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return { content: [textBlock(text)] };
}
