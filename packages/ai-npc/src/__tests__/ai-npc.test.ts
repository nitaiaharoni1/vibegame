import { describe, it, expect } from 'vitest';
import {
  SequenceNode,
  SelectorNode,
  InvertNode,
  WaitNode,
  ActionNode,
  ConditionNode,
} from '../behavior-tree.js';
import { Steering } from '../steering.js';
import { NPCController, Waypoints } from '../components.js';
import { createWorld, addEntity } from '@vigame/core';
import { getComponent, addComponent } from '@vigame/core';

describe('BehaviorTree', () => {
  it('SequenceNode succeeds when all children succeed', () => {
    const a = new ActionNode(() => 'success');
    const b = new ActionNode(() => 'success');
    const seq = new SequenceNode(a, b);
    expect(seq.tick({}, 0.016)).toBe('success');
  });

  it('SequenceNode fails on first child failure', () => {
    const a = new ActionNode(() => 'failure');
    const b = new ActionNode(() => 'success');
    const seq = new SequenceNode(a, b);
    expect(seq.tick({}, 0.016)).toBe('failure');
  });

  it('SequenceNode returns running when a child is running', () => {
    const a = new ActionNode(() => 'running');
    const b = new ActionNode(() => 'success');
    const seq = new SequenceNode(a, b);
    expect(seq.tick({}, 0.016)).toBe('running');
  });

  it('SelectorNode succeeds on first success', () => {
    const a = new ActionNode(() => 'failure');
    const b = new ActionNode(() => 'success');
    const sel = new SelectorNode(a, b);
    expect(sel.tick({}, 0.016)).toBe('success');
  });

  it('SelectorNode fails when all children fail', () => {
    const a = new ActionNode(() => 'failure');
    const b = new ActionNode(() => 'failure');
    const sel = new SelectorNode(a, b);
    expect(sel.tick({}, 0.016)).toBe('failure');
  });

  it('InvertNode inverts success to failure', () => {
    const a = new ActionNode(() => 'success');
    const inv = new InvertNode(a);
    expect(inv.tick({}, 0.016)).toBe('failure');
  });

  it('InvertNode inverts failure to success', () => {
    const a = new ActionNode(() => 'failure');
    const inv = new InvertNode(a);
    expect(inv.tick({}, 0.016)).toBe('success');
  });

  it('InvertNode passes through running', () => {
    const a = new ActionNode(() => 'running');
    const inv = new InvertNode(a);
    expect(inv.tick({}, 0.016)).toBe('running');
  });

  it('WaitNode returns running until duration elapsed then success', () => {
    const wait = new WaitNode(0.1);
    expect(wait.tick({}, 0.05)).toBe('running');
    expect(wait.tick({}, 0.05)).toBe('success');
  });

  it('WaitNode resets elapsed after success', () => {
    const wait = new WaitNode(0.1);
    wait.tick({}, 0.2);
    // After success, elapsed is reset; next tick should be running
    expect(wait.tick({}, 0.05)).toBe('running');
  });

  it('ActionNode calls fn and returns its result', () => {
    const ctx = {};
    let called = false;
    const action = new ActionNode((_c, _d) => { called = true; return 'success'; });
    const result = action.tick(ctx, 0.016);
    expect(result).toBe('success');
    expect(called).toBe(true);
  });

  it('ConditionNode returns success when predicate is true', () => {
    const cond = new ConditionNode(() => true);
    expect(cond.tick({}, 0)).toBe('success');
  });

  it('ConditionNode returns failure when predicate is false', () => {
    const cond = new ConditionNode(() => false);
    expect(cond.tick({}, 0)).toBe('failure');
  });

  it('SequenceNode reset works correctly', () => {
    let count = 0;
    const a = new ActionNode(() => { count++; return count < 2 ? 'running' : 'success'; });
    const b = new ActionNode(() => 'success');
    const seq = new SequenceNode(a, b);
    seq.tick({}, 0.016); // running
    seq.reset();
    count = 0;
    // After reset, it should start fresh
    const result = seq.tick({}, 0.016);
    expect(result).toBe('running');
  });
});

describe('Steering', () => {
  it('seek returns force toward target', () => {
    const force = Steering.seek({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 5);
    expect(force.x).toBeCloseTo(5);
    expect(force.z).toBeCloseTo(0);
  });

  it('flee returns force away from threat', () => {
    const force = Steering.flee({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 5);
    expect(force.x).toBeCloseTo(-5);
  });

  it('arrive returns zero force when at target', () => {
    const force = Steering.arrive({ x: 5, y: 0, z: 5 }, { x: 5, y: 0, z: 5 }, 5);
    expect(force.x).toBe(0);
    expect(force.y).toBe(0);
    expect(force.z).toBe(0);
  });

  it('arrive slows down near target', () => {
    const farForce = Steering.arrive({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, 5);
    const nearForce = Steering.arrive({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 5);
    expect(farForce.x).toBeGreaterThan(nearForce.x);
  });

  it('wander returns a force and new angle', () => {
    const result = Steering.wander({ x: 1, y: 0, z: 0 }, 0, 0.5, 3);
    expect(result.force).toBeDefined();
    expect(typeof result.newAngle).toBe('number');
  });
});

describe('Components', () => {
  it('NPCController has correct defaults', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, NPCController);
    const comp = getComponent(world, eid, NPCController);
    expect(comp).toBeDefined();
    expect(comp!.state).toBe('idle');
    expect(comp!.moveSpeed).toBe(3);
    expect(comp!.turnSpeed).toBe(5);
    expect(comp!.detectionRadius).toBe(10);
    expect(comp!.attackRadius).toBe(2);
    expect(comp!.targetEntityName).toBe('');
    expect(comp!.wanderAngle).toBe(0);
  });

  it('Waypoints has correct defaults', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Waypoints);
    const comp = getComponent(world, eid, Waypoints);
    expect(comp).toBeDefined();
    expect(comp!.points).toBe('[]');
    expect(comp!.currentIndex).toBe(0);
    expect(comp!.loop).toBe(true);
    expect(comp!.arriveRadius).toBe(0.5);
  });
});
