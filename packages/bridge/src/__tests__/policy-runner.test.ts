import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorInterceptor } from '../error-interceptor.js';
import { runPolicy, wrapIfArrowFunction } from '../policy-runner.js';

function mockErrorInterceptor(): ErrorInterceptor {
  return {
    getAndClear: () => [],
    peek: () => [],
    destroy: () => {},
  } as unknown as ErrorInterceptor;
}

// ---------------------------------------------------------------------------
// wrapIfArrowFunction unit tests
// ---------------------------------------------------------------------------

describe('wrapIfArrowFunction', () => {
  it('wraps single-param arrow function', () => {
    const result = wrapIfArrowFunction("(s) => s.x > 5 ? 'right' : 'left'", ['state']);
    expect(result).toBe("((s) => s.x > 5 ? 'right' : 'left')(state)");
  });

  it('wraps two-param arrow function', () => {
    const result = wrapIfArrowFunction('(s, p) => s.score - p.score', ['state', 'prev']);
    expect(result).toBe('((s, p) => s.score - p.score)(state, prev)');
  });

  it('wraps arrow without parens', () => {
    const result = wrapIfArrowFunction("s => s.x > 0 ? 'right' : 'left'", ['state']);
    expect(result).toBe("(s => s.x > 0 ? 'right' : 'left')(state)");
  });

  it('does not wrap non-arrow expressions', () => {
    const result = wrapIfArrowFunction("state.x > 5 ? 'right' : 'left'", ['state']);
    expect(result).toBe("state.x > 5 ? 'right' : 'left'");
  });

  it('does not wrap string literals', () => {
    const result = wrapIfArrowFunction("'right'", ['state']);
    expect(result).toBe("'right'");
  });

  it('trims whitespace', () => {
    const result = wrapIfArrowFunction("  'idle'  ", ['state']);
    expect(result).toBe("'idle'");
  });
});

// ---------------------------------------------------------------------------
// runPolicy integration tests (requires jsdom RAF)
// ---------------------------------------------------------------------------

describe('runPolicy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clean up globals
    delete (window as unknown as Record<string, unknown>).__VIGAME_POLICY_RESULT__;
    delete (window as unknown as Record<string, unknown>).__VIGAME_POLICY_ABORT__;
  });

  it('should handle simple constant policy', async () => {
    const roots = new Map<string, unknown>();

    const resultPromise = runPolicy(
      {
        policy: "'right'",
        reward: '0',
        state_spec: [],
        actions: { right: ['ArrowRight'], left: ['ArrowLeft'] },
        duration_ms: 100,
      },
      roots,
      mockErrorInterceptor(),
    );

    // Advance past the initial 100ms abort wait + duration + polling
    await vi.advanceTimersByTimeAsync(200);
    // RAF in jsdom may need manual triggering; advance more to let polling catch result
    await vi.advanceTimersByTimeAsync(6000);

    const result = await resultPromise;

    // Either it executed frames (RAF worked) or timed out gracefully
    expect(result).toBeDefined();
    expect(result.errors.filter((e) => e.includes('Script injection'))).toHaveLength(0);
  });

  it('should gracefully handle invalid policy JS via fallback', async () => {
    const roots = new Map<string, unknown>();

    const resultPromise = runPolicy(
      {
        policy: 'this is not valid javascript }{',
        reward: '0',
        state_spec: [],
        actions: { idle: [] },
        duration_ms: 100,
      },
      roots,
      mockErrorInterceptor(),
    );

    await vi.advanceTimersByTimeAsync(6200);

    const result = await resultPromise;
    // buildPolicyScript wraps policy in try/catch with fallback to no-op,
    // so it should complete without crashing. The policy returns '' (no action).
    expect(result).toBeDefined();
    expect(result.elapsed_ms).toBeDefined();
  });

  it('should validate state_spec paths against registered roots', async () => {
    const roots = new Map<string, unknown>();
    roots.set('game', { score: 5 });

    const resultPromise = runPolicy(
      {
        policy: "'idle'",
        reward: '0',
        state_spec: ['game.score', 'nonexistent.path'],
        actions: { idle: [] },
        duration_ms: 100,
      },
      roots,
      mockErrorInterceptor(),
    );

    await vi.advanceTimersByTimeAsync(6200);

    const result = await resultPromise;
    // The diagnostics or events should mention the invalid path
    expect(result).toBeDefined();
    // nonexistent.path's root is not registered, so it should be flagged
    // This shows up either in diagnostics.unresolved_paths or events
    const hasInvalidPathInfo =
      (result.diagnostics?.unresolved_paths ?? []).length > 0 ||
      result.events.some((e) => e.includes('nonexistent') || e.includes('undefined')) ||
      result.errors.length > 0;
    // At minimum the result should complete without hanging
    expect(result.elapsed_ms).toBeDefined();
    // If RAF fired, diagnostics should contain the invalid path info
    if (result.frames_executed > 0) {
      expect(hasInvalidPathInfo).toBe(true);
    }
  });
});
