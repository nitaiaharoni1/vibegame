import { XMLParser } from 'fast-xml-parser';
import type { VGXWorld, VGXConfig, VGXEntity, VGXComponent, VGXPrefab, VGXInstance } from './types.js';
import { coerceValue, parseVec } from './coerce.js';

const RESERVED_ENTITY_ATTRS = new Set(['name', 'tag']);
const STRUCTURAL_TAGS = new Set(['entity', 'prefab', 'instance', 'config', 'world']);

/**
 * Parse raw attribute map from fast-xml-parser into typed component props.
 * Excludes known structural attributes.
 */
function parseProps(
  attrs: Record<string, string>,
  exclude: Set<string> = new Set(),
): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (exclude.has(key)) continue;
    props[key] = coerceValue(String(value));
  }
  return props;
}

/**
 * Extract VGXComponent list from a parsed element's children.
 * Any key that is not a structural tag and is an object/array is treated as a component.
 */
function parseComponents(element: Record<string, unknown>): VGXComponent[] {
  const components: VGXComponent[] = [];

  for (const [key, value] of Object.entries(element)) {
    if (STRUCTURAL_TAGS.has(key)) continue;
    // skip attribute-like or string values
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') continue;

    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue;
      const attrs = item as Record<string, unknown>;
      const props: Record<string, string | number | boolean> = {};
      for (const [attrKey, attrVal] of Object.entries(attrs)) {
        props[attrKey] = coerceValue(String(attrVal));
      }
      components.push({ type: key, props });
    }
  }

  return components;
}

/**
 * Parse a <config> element into VGXConfig.
 */
function parseConfig(raw: Record<string, unknown> | undefined): VGXConfig {
  if (!raw) return {};
  const config: VGXConfig = {};

  for (const [key, value] of Object.entries(raw)) {
    const strVal = String(value);

    if (key === 'gravity') {
      const parts = parseVec(strVal);
      if (parts.length === 3) {
        config.gravity = [parts[0]!, parts[1]!, parts[2]!];
      }
      continue;
    }

    if (key === 'clear-color' || key === 'clearColor') {
      config.clearColor = strVal;
      continue;
    }

    if (key === 'width') {
      config.width = Number(value);
      continue;
    }

    if (key === 'height') {
      config.height = Number(value);
      continue;
    }

    if (key === 'physics') {
      config.physics = strVal;
      continue;
    }

    config[key] = coerceValue(strVal);
  }

  return config;
}

/**
 * Parse a raw entity element into VGXEntity.
 */
function parseEntity(raw: Record<string, unknown>): VGXEntity {
  const name = raw['name'] !== undefined ? String(raw['name']) : undefined;
  const tagAttr = raw['tag'] !== undefined ? String(raw['tag']) : '';
  const tags = tagAttr ? tagAttr.split(/\s+/).filter(Boolean) : [];
  const components = parseComponents(raw);
  return { name, tags, components };
}

/**
 * Parse a raw prefab element into VGXPrefab.
 */
function parsePrefab(raw: Record<string, unknown>): VGXPrefab {
  const name = String(raw['name'] ?? '');
  const tagAttr = raw['tag'] !== undefined ? String(raw['tag']) : '';
  const tags = tagAttr ? tagAttr.split(/\s+/).filter(Boolean) : [];
  const components = parseComponents(raw);
  return { name, tags, components };
}

/**
 * Parse a raw instance element into VGXInstance.
 */
function parseInstance(raw: Record<string, unknown>): VGXInstance {
  const prefab = String(raw['prefab'] ?? '');
  const overrides: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'prefab') continue;
    overrides[key] = coerceValue(String(value));
  }
  return { prefab, overrides };
}

/**
 * Parse a VGX XML string into a VGXWorld AST.
 */
export function parseVGX(xml: string): VGXWorld {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => ['entity', 'prefab', 'instance'].includes(name),
  });

  const doc = parser.parse(xml) as Record<string, unknown>;
  const worldRaw = doc['world'] as Record<string, unknown> | undefined;

  if (!worldRaw) {
    throw new Error('VGX parse error: missing <world> root element');
  }

  const renderer = (worldRaw['renderer'] as string | undefined) ?? 'three';
  if (renderer !== 'three' && renderer !== 'phaser') {
    throw new Error(`VGX parse error: unknown renderer "${renderer}"`);
  }

  const configRaw = worldRaw['config'] as Record<string, unknown> | undefined;
  const config = parseConfig(configRaw);

  const entitiesRaw = (worldRaw['entity'] as Record<string, unknown>[] | undefined) ?? [];
  const entities: VGXEntity[] = entitiesRaw.map(parseEntity);

  const prefabsRaw = (worldRaw['prefab'] as Record<string, unknown>[] | undefined) ?? [];
  const prefabs: VGXPrefab[] = prefabsRaw.map(parsePrefab);

  const instancesRaw = (worldRaw['instance'] as Record<string, unknown>[] | undefined) ?? [];
  const instances: VGXInstance[] = instancesRaw.map(parseInstance);

  return { renderer, config, entities, prefabs, instances };
}
