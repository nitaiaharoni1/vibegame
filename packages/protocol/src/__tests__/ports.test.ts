import { describe, expect, it } from 'vitest';
import {
  controlPortFromBridgePort,
  DEFAULT_BRIDGE_PORT,
  resolveBridgePortFromEnv,
  resolveControlPortFromEnv,
} from '../ports.js';

describe('ports', () => {
  it('defaults', () => {
    expect(DEFAULT_BRIDGE_PORT).toBe(7777);
    expect(controlPortFromBridgePort(7777)).toBe(7778);
  });

  it('resolveBridgePortFromEnv respects VIGAME_BRIDGE_PORT', () => {
    const prev = process.env.VIGAME_BRIDGE_PORT;
    process.env.VIGAME_BRIDGE_PORT = '9000';
    try {
      expect(resolveBridgePortFromEnv()).toBe(9000);
    } finally {
      if (prev === undefined) delete process.env.VIGAME_BRIDGE_PORT;
      else process.env.VIGAME_BRIDGE_PORT = prev;
    }
  });

  it('resolveControlPortFromEnv uses VIGAME_CONTROL_PORT when set', () => {
    const prevB = process.env.VIGAME_BRIDGE_PORT;
    const prevC = process.env.VIGAME_CONTROL_PORT;
    delete process.env.VIGAME_BRIDGE_PORT;
    process.env.VIGAME_CONTROL_PORT = '9999';
    try {
      expect(resolveControlPortFromEnv()).toBe(9999);
    } finally {
      if (prevB === undefined) delete process.env.VIGAME_BRIDGE_PORT;
      else process.env.VIGAME_BRIDGE_PORT = prevB;
      if (prevC === undefined) delete process.env.VIGAME_CONTROL_PORT;
      else process.env.VIGAME_CONTROL_PORT = prevC;
    }
  });
});
