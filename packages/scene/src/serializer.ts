import type { VGXWorld, VGXConfig, VGXEntity, VGXComponent, VGXPrefab, VGXInstance } from './types.js';
import { serializeVec } from './coerce.js';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attrStr(key: string, value: string | number | boolean): string {
  return ` ${key}="${escapeAttr(String(value))}"`;
}

function serializeConfig(config: VGXConfig): string {
  if (Object.keys(config).length === 0) return '';

  let attrs = '';

  if (config.gravity !== undefined) {
    attrs += attrStr('gravity', serializeVec(config.gravity));
  }
  if (config.clearColor !== undefined) {
    attrs += attrStr('clear-color', config.clearColor);
  }
  if (config.width !== undefined) {
    attrs += attrStr('width', config.width);
  }
  if (config.height !== undefined) {
    attrs += attrStr('height', config.height);
  }
  if (config.physics !== undefined) {
    attrs += attrStr('physics', config.physics);
  }

  // any extra keys
  const known = new Set(['gravity', 'clearColor', 'width', 'height', 'physics']);
  for (const [key, value] of Object.entries(config)) {
    if (known.has(key)) continue;
    if (value === undefined) continue;
    attrs += attrStr(key, String(value));
  }

  return `  <config${attrs} />\n`;
}

function serializeComponent(comp: VGXComponent, indent: string): string {
  let attrs = '';
  for (const [key, value] of Object.entries(comp.props)) {
    attrs += attrStr(key, value);
  }
  return `${indent}<${comp.type}${attrs} />\n`;
}

function serializeEntity(entity: VGXEntity): string {
  let attrs = '';
  if (entity.name !== undefined) attrs += attrStr('name', entity.name);
  if (entity.tags.length > 0) attrs += attrStr('tag', entity.tags.join(' '));

  if (entity.components.length === 0) {
    return `  <entity${attrs} />\n`;
  }

  let out = `  <entity${attrs}>\n`;
  for (const comp of entity.components) {
    out += serializeComponent(comp, '    ');
  }
  out += `  </entity>\n`;
  return out;
}

function serializePrefab(prefab: VGXPrefab): string {
  let attrs = attrStr('name', prefab.name);
  if (prefab.tags.length > 0) attrs += attrStr('tag', prefab.tags.join(' '));

  if (prefab.components.length === 0) {
    return `  <prefab${attrs} />\n`;
  }

  let out = `  <prefab${attrs}>\n`;
  for (const comp of prefab.components) {
    out += serializeComponent(comp, '    ');
  }
  out += `  </prefab>\n`;
  return out;
}

function serializeInstance(inst: VGXInstance): string {
  let attrs = attrStr('prefab', inst.prefab);
  for (const [key, value] of Object.entries(inst.overrides)) {
    attrs += attrStr(key, value);
  }
  return `  <instance${attrs} />\n`;
}

/**
 * Serialize a VGXWorld AST back to an XML string.
 */
export function serializeVGX(world: VGXWorld): string {
  let out = `<world renderer="${escapeAttr(world.renderer)}">\n`;

  out += serializeConfig(world.config);

  for (const entity of world.entities) {
    out += serializeEntity(entity);
  }

  for (const prefab of world.prefabs) {
    out += serializePrefab(prefab);
  }

  for (const inst of world.instances) {
    out += serializeInstance(inst);
  }

  out += `</world>`;
  return out;
}
