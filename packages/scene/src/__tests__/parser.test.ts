import { describe, it, expect } from 'vitest';
import { parseVGX } from '../parser.js';
import { serializeVGX } from '../serializer.js';

describe('parseVGX', () => {
  it('parses a simple entity with two components', () => {
    const xml = `
      <world renderer="three">
        <entity name="Player" tag="player hero">
          <transform pos="0 2 0" />
          <health current="100" max="100" />
        </entity>
      </world>
    `;
    const world = parseVGX(xml);

    expect(world.renderer).toBe('three');
    expect(world.entities).toHaveLength(1);

    const entity = world.entities[0]!;
    expect(entity.name).toBe('Player');
    expect(entity.tags).toEqual(['player', 'hero']);
    expect(entity.components).toHaveLength(2);

    const transform = entity.components.find((c) => c.type === 'transform');
    expect(transform).toBeDefined();
    expect(transform!.props['pos']).toBe('0 2 0');

    const health = entity.components.find((c) => c.type === 'health');
    expect(health).toBeDefined();
    expect(health!.props['current']).toBe(100);
    expect(health!.props['max']).toBe(100);
  });

  it('parses config with gravity and clear-color', () => {
    const xml = `
      <world renderer="three">
        <config gravity="0 -9.81 0" clear-color="#87ceeb" />
      </world>
    `;
    const world = parseVGX(xml);

    expect(world.config.gravity).toEqual([0, -9.81, 0]);
    expect(world.config.clearColor).toBe('#87ceeb');
  });

  it('parses prefabs and instances', () => {
    const xml = `
      <world renderer="three">
        <prefab name="Coin">
          <mesh shape="cylinder" size="0.3 0.05" color="#ffd700" />
          <collectible type="coin" value="1" />
        </prefab>
        <instance prefab="Coin" pos="3 1 0" />
        <instance prefab="Coin" pos="6 1.5 2" />
      </world>
    `;
    const world = parseVGX(xml);

    expect(world.prefabs).toHaveLength(1);
    const prefab = world.prefabs[0]!;
    expect(prefab.name).toBe('Coin');
    expect(prefab.components).toHaveLength(2);

    const mesh = prefab.components.find((c) => c.type === 'mesh');
    expect(mesh!.props['shape']).toBe('cylinder');
    expect(mesh!.props['color']).toBe('#ffd700');

    expect(world.instances).toHaveLength(2);
    expect(world.instances[0]!.prefab).toBe('Coin');
    expect(world.instances[0]!.overrides['pos']).toBe('3 1 0');
    expect(world.instances[1]!.overrides['pos']).toBe('6 1.5 2');
  });

  it('parses an entity with no children', () => {
    const xml = `
      <world renderer="phaser">
        <entity name="Empty" />
      </world>
    `;
    const world = parseVGX(xml);

    expect(world.renderer).toBe('phaser');
    expect(world.entities).toHaveLength(1);
    const entity = world.entities[0]!;
    expect(entity.name).toBe('Empty');
    expect(entity.components).toHaveLength(0);
    expect(entity.tags).toHaveLength(0);
  });

  it('parses multiple entities', () => {
    const xml = `
      <world renderer="three">
        <entity name="A" />
        <entity name="B" />
        <entity name="C" />
      </world>
    `;
    const world = parseVGX(xml);
    expect(world.entities).toHaveLength(3);
    expect(world.entities.map((e) => e.name)).toEqual(['A', 'B', 'C']);
  });

  it('auto-coerces numeric and boolean attribute values', () => {
    const xml = `
      <world renderer="three">
        <entity name="T">
          <rigid-body mass="1.5" kinematic="false" sensor="true" />
        </entity>
      </world>
    `;
    const world = parseVGX(xml);
    const rb = world.entities[0]!.components[0]!;
    expect(rb.props['mass']).toBe(1.5);
    expect(rb.props['kinematic']).toBe(false);
    expect(rb.props['sensor']).toBe(true);
  });

  it('round-trips: parse → serialize → parse gives identical structure', () => {
    const xml = `
      <world renderer="three">
        <config gravity="0 -9.81 0" clear-color="#87ceeb" />
        <entity name="Ground">
          <transform pos="0 -0.5 0" />
          <mesh shape="box" size="50 1 50" color="#4a7c59" />
          <rigid-body type="static" />
        </entity>
        <prefab name="Coin">
          <mesh shape="cylinder" color="#ffd700" />
        </prefab>
        <instance prefab="Coin" pos="3 1 0" />
      </world>
    `;

    const world1 = parseVGX(xml);
    const serialized = serializeVGX(world1);
    const world2 = parseVGX(serialized);

    expect(world2.renderer).toBe(world1.renderer);
    expect(world2.config.gravity).toEqual(world1.config.gravity);
    expect(world2.config.clearColor).toEqual(world1.config.clearColor);

    expect(world2.entities).toHaveLength(world1.entities.length);
    expect(world2.entities[0]!.name).toBe(world1.entities[0]!.name);
    expect(world2.entities[0]!.components).toHaveLength(world1.entities[0]!.components.length);

    expect(world2.prefabs).toHaveLength(world1.prefabs.length);
    expect(world2.prefabs[0]!.name).toBe(world1.prefabs[0]!.name);

    expect(world2.instances).toHaveLength(world1.instances.length);
    expect(world2.instances[0]!.prefab).toBe(world1.instances[0]!.prefab);
  });
});
