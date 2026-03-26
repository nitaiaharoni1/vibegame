import { describe, it, expect } from 'vitest';
import { RigidBody, Collider } from '../components.js';

describe('Physics components', () => {
  it('RigidBody is defined with correct name', () => {
    expect(RigidBody.name).toBe('RigidBody');
  });

  it('RigidBody defaults to dynamic type', () => {
    const defaults = RigidBody.defaults();
    expect(defaults.type).toBe('dynamic');
  });

  it('RigidBody has correct mass default', () => {
    const defaults = RigidBody.defaults();
    expect(defaults.mass).toBe(1.0);
  });

  it('RigidBody lock rotation defaults to false', () => {
    const defaults = RigidBody.defaults();
    expect(defaults.lockRotationX).toBe(false);
    expect(defaults.lockRotationY).toBe(false);
    expect(defaults.lockRotationZ).toBe(false);
  });

  it('Collider is defined with correct name', () => {
    expect(Collider.name).toBe('Collider');
  });

  it('Collider defaults to box shape', () => {
    const defaults = Collider.defaults();
    expect(defaults.shape).toBe('box');
  });

  it('Collider has correct size defaults', () => {
    const defaults = Collider.defaults();
    expect(defaults.sizeX).toBe(0.5);
    expect(defaults.sizeY).toBe(0.5);
    expect(defaults.sizeZ).toBe(0.5);
  });

  it('Collider friction default is 0.5', () => {
    const defaults = Collider.defaults();
    expect(defaults.friction).toBe(0.5);
  });

  it('Collider restitution default is 0', () => {
    const defaults = Collider.defaults();
    expect(defaults.restitution).toBe(0.0);
  });

  it('Collider isSensor default is false', () => {
    const defaults = Collider.defaults();
    expect(defaults.isSensor).toBe(false);
  });

  it('RigidBody schema has type field as enum', () => {
    expect(RigidBody.schema['type']?.kind).toBe('enum');
  });

  it('RigidBody enum values include dynamic, static, kinematic variants', () => {
    const typeDef = RigidBody.schema['type'];
    if (typeDef?.kind === 'enum') {
      expect(typeDef.values).toContain('dynamic');
      expect(typeDef.values).toContain('static');
      expect(typeDef.values).toContain('kinematic-position');
      expect(typeDef.values).toContain('kinematic-velocity');
    }
  });
});
