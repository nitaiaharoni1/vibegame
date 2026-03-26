import { describe, it, expect } from 'vitest';
import { createWorld, addEntity, addComponent, getComponent } from '@vigame/core';
import { UIElement, HealthBar, ScoreDisplay } from '../components.js';
import { UIPlugin } from '../ui-plugin.js';
import { UIPanel } from '../overlay.js';

describe('UIElement component', () => {
  it('has correct default id', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, UIElement);
    const comp = getComponent(world, eid, UIElement)!;
    expect(comp.id).toBe('');
  });

  it('has correct default visible', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, UIElement);
    const comp = getComponent(world, eid, UIElement)!;
    expect(comp.visible).toBe(true);
  });

  it('has correct default zIndex', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, UIElement);
    const comp = getComponent(world, eid, UIElement)!;
    expect(comp.zIndex).toBe(100);
  });
});

describe('HealthBar component', () => {
  it('has correct defaults', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, HealthBar);
    const comp = getComponent(world, eid, HealthBar)!;
    expect(comp.entityName).toBe('');
    expect(comp.x).toBe(10);
    expect(comp.y).toBe(10);
    expect(comp.width).toBe(200);
    expect(comp.height).toBe(20);
    expect(comp.color).toBe('#e74c3c');
    expect(comp.backgroundColor).toBe('#333');
  });
});

describe('ScoreDisplay component', () => {
  it('has correct defaults', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, ScoreDisplay);
    const comp = getComponent(world, eid, ScoreDisplay)!;
    expect(comp.entityName).toBe('');
    expect(comp.x).toBe(10);
    expect(comp.y).toBe(40);
    expect(comp.fontSize).toBe(24);
    expect(comp.color).toBe('#ffffff');
    expect(comp.prefix).toBe('Score: ');
  });
});

describe('UIPlugin', () => {
  it('has correct name', () => {
    const plugin = UIPlugin();
    expect(plugin.name).toBe('UIPlugin');
  });

  it('returns systems array', () => {
    const plugin = UIPlugin();
    const world = createWorld();
    const systems = plugin.systems?.(world) ?? [];
    expect(systems.length).toBeGreaterThan(0);
  });

  it('UISync system has correct name', () => {
    const plugin = UIPlugin();
    const world = createWorld();
    const systems = plugin.systems?.(world) ?? [];
    expect(systems[0]?.name).toBe('UISync');
  });

  it('UISync system has phase 3 (Render)', () => {
    const plugin = UIPlugin();
    const world = createWorld();
    const systems = plugin.systems?.(world) ?? [];
    expect(systems[0]?.phase).toBe(3);
  });
});

describe('UIPanel in Node (no DOM)', () => {
  it('does not throw when document is undefined', () => {
    // In Node/vitest environment, document may be undefined
    expect(() => new UIPanel('test-panel')).not.toThrow();
  });

  it('setHTML does not throw without DOM', () => {
    const panel = new UIPanel('test-panel-2');
    expect(() => panel.setHTML('<p>hello</p>')).not.toThrow();
  });

  it('setVisible does not throw without DOM', () => {
    const panel = new UIPanel('test-panel-3');
    expect(() => panel.setVisible(false)).not.toThrow();
  });

  it('remove does not throw without DOM', () => {
    const panel = new UIPanel('test-panel-4');
    expect(() => panel.remove()).not.toThrow();
  });
});
