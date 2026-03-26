import { describe, it, expect, vi } from 'vitest';

// Mock Phaser before any imports that pull it in (Phaser accesses `window` at module init)
vi.mock('phaser', () => {
  const AUTO = 1;
  class FakeGame {
    destroy() {}
  }
  return {
    default: { AUTO, Game: FakeGame },
    AUTO,
    Game: FakeGame,
  };
});

import { Transform2D, Sprite2D, Camera2D, ArcadeBody2D, TileMap2D, Text2D } from '../components.js';
import { PhaserRendererPlugin } from '../renderer-plugin.js';

describe('Transform2D component', () => {
  it('has correct name', () => {
    expect(Transform2D.name).toBe('Transform2D');
  });

  it('has correct defaults', () => {
    const defaults = Transform2D.defaults();
    expect(defaults.x).toBe(0);
    expect(defaults.y).toBe(0);
    expect(defaults.rotation).toBe(0);
    expect(defaults.scaleX).toBe(1);
    expect(defaults.scaleY).toBe(1);
  });
});

describe('Sprite2D component', () => {
  it('has correct name', () => {
    expect(Sprite2D.name).toBe('Sprite2D');
  });

  it('has correct defaults', () => {
    const defaults = Sprite2D.defaults();
    expect(defaults.texture).toBe('default');
    expect(defaults.frame).toBe('');
    expect(defaults.tint).toBe(0xffffff);
    expect(defaults.alpha).toBe(1);
    expect(defaults.visible).toBe(true);
    expect(defaults.depth).toBe(0);
    expect(defaults.flipX).toBe(false);
    expect(defaults.flipY).toBe(false);
  });
});

describe('Camera2D component', () => {
  it('has correct name', () => {
    expect(Camera2D.name).toBe('Camera2D');
  });

  it('has correct defaults', () => {
    const defaults = Camera2D.defaults();
    expect(defaults.zoom).toBe(1);
    expect(defaults.active).toBe(true);
    expect(defaults.followTarget).toBe('');
    expect(defaults.lerpX).toBe(1);
    expect(defaults.lerpY).toBe(1);
  });
});

describe('ArcadeBody2D component', () => {
  it('has correct name', () => {
    expect(ArcadeBody2D.name).toBe('ArcadeBody2D');
  });

  it('has correct defaults', () => {
    const defaults = ArcadeBody2D.defaults();
    expect(defaults.isStatic).toBe(false);
    expect(defaults.velocityX).toBe(0);
    expect(defaults.velocityY).toBe(0);
    expect(defaults.gravityY).toBe(300);
    expect(defaults.bounceX).toBe(0);
    expect(defaults.bounceY).toBe(0);
    expect(defaults.collideWorldBounds).toBe(false);
  });
});

describe('TileMap2D component', () => {
  it('has correct name', () => {
    expect(TileMap2D.name).toBe('TileMap2D');
  });

  it('has correct defaults', () => {
    const defaults = TileMap2D.defaults();
    expect(defaults.key).toBe('');
    expect(defaults.tilesetName).toBe('');
    expect(defaults.layerName).toBe('');
  });
});

describe('Text2D component', () => {
  it('has correct name', () => {
    expect(Text2D.name).toBe('Text2D');
  });

  it('has correct defaults', () => {
    const defaults = Text2D.defaults();
    expect(defaults.text).toBe('');
    expect(defaults.fontSize).toBe(16);
    expect(defaults.color).toBe('#ffffff');
    expect(defaults.depth).toBe(10);
  });
});

describe('PhaserRendererPlugin', () => {
  it('plugin name is PhaserRendererPlugin', () => {
    const plugin = PhaserRendererPlugin();
    expect(plugin.name).toBe('PhaserRendererPlugin');
  });

  it('returns systems array when called', () => {
    // systems() requires world but we can check it's a function
    const plugin = PhaserRendererPlugin();
    expect(typeof plugin.systems).toBe('function');
  });

  it('has setup, teardown, and vgxTags methods', () => {
    const plugin = PhaserRendererPlugin();
    expect(typeof plugin.setup).toBe('function');
    expect(typeof plugin.teardown).toBe('function');
    expect(typeof plugin.vgxTags).toBe('function');
  });

  it('vgxTags returns expected tag handlers', () => {
    const plugin = PhaserRendererPlugin();
    const tags = plugin.vgxTags?.();
    expect(tags).toBeDefined();
    expect(typeof tags!['position']).toBe('function');
    expect(typeof tags!['sprite']).toBe('function');
    expect(typeof tags!['text']).toBe('function');
    expect(typeof tags!['camera-2d']).toBe('function');
    expect(typeof tags!['arcade-body']).toBe('function');
  });

  it('all components have schema property', () => {
    expect(Transform2D.schema).toBeDefined();
    expect(Sprite2D.schema).toBeDefined();
    expect(Camera2D.schema).toBeDefined();
    expect(ArcadeBody2D.schema).toBeDefined();
  });

  it('all components have jsonSchema property', () => {
    expect(Transform2D.jsonSchema).toBeDefined();
    expect(Sprite2D.jsonSchema).toBeDefined();
    expect(Camera2D.jsonSchema).toBeDefined();
    expect(ArcadeBody2D.jsonSchema).toBeDefined();
  });

  it('defaults() returns new object each call (not shared)', () => {
    const a = Transform2D.defaults();
    const b = Transform2D.defaults();
    expect(a).not.toBe(b);
  });
});
