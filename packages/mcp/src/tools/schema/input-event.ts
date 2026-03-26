/**
 * Shared JSON Schema fragments for keyboard/mouse input events (MCP tool `inputSchema`).
 * Keeps compound, simulate_input, track, and run_playtest aligned.
 */

export const INPUT_EVENT_PROPERTIES = {
  type: {
    type: 'string',
    description: 'Event type: keydown, keyup, keypress, click, mousemove, mousedown, mouseup',
  },
  key: { type: 'string', description: 'Keyboard key (e.g. ArrowLeft, Space, a)' },
  button: { type: 'number', description: 'Mouse button (0=left, 1=middle, 2=right)' },
  x: { type: 'number', description: 'Mouse X position in pixels' },
  y: { type: 'number', description: 'Mouse Y position in pixels' },
  duration: { type: 'number', description: 'Hold duration in milliseconds' },
} as const;

/** One immediate input event (sequence / act_and_observe / playtest). */
export const INPUT_EVENT_ITEM_SCHEMA = {
  type: 'object' as const,
  required: ['type'] as const,
  properties: INPUT_EVENT_PROPERTIES,
} as const;

const TIMED_AT_PROPERTY = {
  at: {
    type: 'number',
    description: 'Milliseconds from track start when to fire this input',
  },
} as const;

/** Track tool: same fields plus required `at`. */
export const TIMED_INPUT_EVENT_ITEM_SCHEMA = {
  type: 'object' as const,
  required: ['type', 'at'] as const,
  properties: {
    ...INPUT_EVENT_PROPERTIES,
    ...TIMED_AT_PROPERTY,
  },
} as const;
