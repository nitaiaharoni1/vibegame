import { describe, it, expect } from 'vitest';
import { createWorld, addEntity, addComponent, getComponent } from '@vigame/core';
import { NetworkEntity, NetworkTransform } from '../components.js';
import { NetworkClient } from '../client.js';
import { NetworkingPlugin, getNetworkClient } from '../networking-plugin.js';

describe('NetworkEntity component', () => {
  it('has correct default netId', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NetworkEntity);
    const comp = getComponent(world, eid, NetworkEntity)!;
    expect(comp.netId).toBe('');
  });

  it('has correct default ownerId', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NetworkEntity);
    const comp = getComponent(world, eid, NetworkEntity)!;
    expect(comp.ownerId).toBe('');
  });

  it('default isLocal is false', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NetworkEntity);
    const comp = getComponent(world, eid, NetworkEntity)!;
    expect(comp.isLocal).toBe(false);
  });

  it('default syncRate is 20', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NetworkEntity);
    const comp = getComponent(world, eid, NetworkEntity)!;
    expect(comp.syncRate).toBe(20);
  });

  it('default interpolate is true', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NetworkEntity);
    const comp = getComponent(world, eid, NetworkEntity)!;
    expect(comp.interpolate).toBe(true);
  });
});

describe('NetworkTransform component', () => {
  it('has correct defaults', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NetworkTransform);
    const comp = getComponent(world, eid, NetworkTransform)!;
    expect(comp.prevX).toBe(0);
    expect(comp.prevY).toBe(0);
    expect(comp.prevZ).toBe(0);
    expect(comp.targetX).toBe(0);
    expect(comp.targetY).toBe(0);
    expect(comp.targetZ).toBe(0);
    expect(comp.lerpT).toBe(0);
    expect(comp.lerpSpeed).toBe(10);
  });
});

describe('NetworkClient in Node (no WebSocket)', () => {
  it('does not crash on construction', () => {
    expect(() => new NetworkClient('ws://localhost:8080')).not.toThrow();
  });

  it('connected is false initially', () => {
    const client = new NetworkClient('ws://localhost:8080');
    expect(client.connected).toBe(false);
  });

  it('id is null initially', () => {
    const client = new NetworkClient('ws://localhost:8080');
    expect(client.id).toBeNull();
  });

  it('connect() does not throw in Node (no WebSocket global)', () => {
    const client = new NetworkClient('ws://localhost:8080');
    expect(() => client.connect()).not.toThrow();
  });

  it('disconnect() does not throw when not connected', () => {
    const client = new NetworkClient('ws://localhost:8080');
    expect(() => client.disconnect()).not.toThrow();
  });

  it('send() does not throw when not connected', () => {
    const client = new NetworkClient('ws://localhost:8080');
    expect(() => client.send('test', { foo: 1 })).not.toThrow();
  });
});

describe('NetworkingPlugin', () => {
  it('has correct name', () => {
    const plugin = NetworkingPlugin({ serverUrl: 'ws://localhost:8080', autoConnect: false });
    expect(plugin.name).toBe('NetworkingPlugin');
  });

  it('returns two systems', () => {
    const plugin = NetworkingPlugin({ serverUrl: 'ws://localhost:8080', autoConnect: false });
    const world = createWorld();
    plugin.setup?.(world);
    const systems = plugin.systems?.(world) ?? [];
    expect(systems.length).toBe(2);
  });

  it('NetworkSync system has phase 1', () => {
    const plugin = NetworkingPlugin({ serverUrl: 'ws://localhost:8080', autoConnect: false });
    const world = createWorld();
    plugin.setup?.(world);
    const systems = plugin.systems?.(world) ?? [];
    expect(systems[0]?.name).toBe('NetworkSync');
    expect(systems[0]?.phase).toBe(1);
  });

  it('NetworkInterpolate system has phase 2', () => {
    const plugin = NetworkingPlugin({ serverUrl: 'ws://localhost:8080', autoConnect: false });
    const world = createWorld();
    plugin.setup?.(world);
    const systems = plugin.systems?.(world) ?? [];
    expect(systems[1]?.name).toBe('NetworkInterpolate');
    expect(systems[1]?.phase).toBe(2);
  });

  it('getNetworkClient returns client after setup', () => {
    const plugin = NetworkingPlugin({ serverUrl: 'ws://localhost:8080', autoConnect: false });
    const world = createWorld();
    plugin.setup?.(world);
    const client = getNetworkClient(world);
    expect(client).toBeInstanceOf(NetworkClient);
  });

  it('teardown disconnects client', () => {
    const plugin = NetworkingPlugin({ serverUrl: 'ws://localhost:8080', autoConnect: false });
    const world = createWorld();
    plugin.setup?.(world);
    expect(() => plugin.teardown?.(world)).not.toThrow();
  });
});
