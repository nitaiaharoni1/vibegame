export type { VGXWorld, VGXConfig, VGXEntity, VGXComponent, VGXPrefab, VGXInstance } from './types.js';
export { parseVGX } from './parser.js';
export { serializeVGX } from './serializer.js';
export { parseVec, serializeVec, coerceValue } from './coerce.js';
export { hydrateScene } from './hydrate.js';
