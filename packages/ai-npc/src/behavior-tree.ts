export type NodeStatus = 'success' | 'failure' | 'running';

export interface BehaviorContext {
  [key: string]: unknown;
}

export interface BehaviorNode {
  tick(ctx: BehaviorContext, delta: number): NodeStatus;
  reset?(): void;
}

// Sequence: runs children in order, fails fast
export class SequenceNode implements BehaviorNode {
  private children: BehaviorNode[];
  private currentIndex = 0;

  constructor(...children: BehaviorNode[]) {
    this.children = children;
  }

  tick(ctx: BehaviorContext, delta: number): NodeStatus {
    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick(ctx, delta);
      if (status === 'failure') { this.currentIndex = 0; return 'failure'; }
      if (status === 'running') return 'running';
      this.currentIndex++;
    }
    this.currentIndex = 0;
    return 'success';
  }

  reset(): void {
    this.currentIndex = 0;
    for (const child of this.children) child.reset?.();
  }
}

// Selector: runs children in order, succeeds on first success
export class SelectorNode implements BehaviorNode {
  private children: BehaviorNode[];

  constructor(...children: BehaviorNode[]) {
    this.children = children;
  }

  tick(ctx: BehaviorContext, delta: number): NodeStatus {
    for (const child of this.children) {
      const status = child.tick(ctx, delta);
      if (status === 'success') return 'success';
      if (status === 'running') return 'running';
    }
    return 'failure';
  }

  reset(): void {
    for (const child of this.children) child.reset?.();
  }
}

// Invert decorator
export class InvertNode implements BehaviorNode {
  constructor(private child: BehaviorNode) {}
  tick(ctx: BehaviorContext, delta: number): NodeStatus {
    const s = this.child.tick(ctx, delta);
    if (s === 'success') return 'failure';
    if (s === 'failure') return 'success';
    return 'running';
  }
  reset(): void { this.child.reset?.(); }
}

// Repeat decorator — repeats N times (or infinite if count=-1)
export class RepeatNode implements BehaviorNode {
  private count: number;
  private remaining: number;
  constructor(private child: BehaviorNode, count = -1) {
    this.count = count;
    this.remaining = count;
  }
  tick(ctx: BehaviorContext, delta: number): NodeStatus {
    while (this.count < 0 || this.remaining > 0) {
      const s = this.child.tick(ctx, delta);
      if (s === 'running') return 'running';
      if (s === 'failure') return 'failure';
      // success — repeat
      this.child.reset?.();
      if (this.count > 0) this.remaining--;
    }
    this.remaining = this.count;
    return 'success';
  }
  reset(): void { this.remaining = this.count; this.child.reset?.(); }
}

// Action leaf: runs a function
export class ActionNode implements BehaviorNode {
  constructor(private fn: (ctx: BehaviorContext, delta: number) => NodeStatus) {}
  tick(ctx: BehaviorContext, delta: number): NodeStatus { return this.fn(ctx, delta); }
}

// Condition leaf: checks a predicate
export class ConditionNode implements BehaviorNode {
  constructor(private fn: (ctx: BehaviorContext) => boolean) {}
  tick(ctx: BehaviorContext, _delta: number): NodeStatus {
    return this.fn(ctx) ? 'success' : 'failure';
  }
}

// Wait node: waits for `duration` seconds then succeeds
export class WaitNode implements BehaviorNode {
  private elapsed = 0;
  constructor(private duration: number) {}
  tick(_ctx: BehaviorContext, delta: number): NodeStatus {
    this.elapsed += delta;
    if (this.elapsed >= this.duration) { this.elapsed = 0; return 'success'; }
    return 'running';
  }
  reset(): void { this.elapsed = 0; }
}
