import { describe, it, expect } from 'vitest';
import { minimalThreeTemplate } from '../templates/minimal-3d.js';
import { minimalPhaserTemplate } from '../templates/minimal-2d.js';

describe('minimalThreeTemplate', () => {
  it('generates required files', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    expect(files).toHaveProperty('package.json');
    expect(files).toHaveProperty('index.html');
    expect(files).toHaveProperty('src/main.ts');
    expect(files).toHaveProperty('src/scene.vgx');
    expect(files).toHaveProperty('vite.config.ts');
    expect(files).toHaveProperty('tsconfig.json');
    expect(files).toHaveProperty('.gitignore');
  });

  it('uses the provided project name in package.json', () => {
    const files = minimalThreeTemplate({ name: 'my-awesome-game' });
    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.name).toBe('my-awesome-game');
  });

  it('package.json has correct vigame dependencies', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies).toHaveProperty('@vigame/core', 'latest');
    expect(pkg.dependencies).toHaveProperty('@vigame/scene', 'latest');
    expect(pkg.dependencies).toHaveProperty('@vigame/renderer-three', 'latest');
    expect(pkg.dependencies).toHaveProperty('@vigame/input', 'latest');
    expect(pkg.dependencies).toHaveProperty('@vigame/mcp', 'latest');
  });

  it('package.json has correct dev scripts', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
  });

  it('VGX scene template contains valid XML structure', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const vgx = files['src/scene.vgx']!;
    expect(vgx).toContain('<world renderer="three">');
    expect(vgx).toContain('</world>');
    expect(vgx).toContain('<entity');
    expect(vgx).toContain('</entity>');
  });

  it('VGX scene contains expected entities', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const vgx = files['src/scene.vgx']!;
    expect(vgx).toContain('name="Camera"');
    expect(vgx).toContain('name="Ground"');
    expect(vgx).toContain('name="Cube"');
  });

  it('index.html includes project name in title', () => {
    const files = minimalThreeTemplate({ name: 'cool-game' });
    expect(files['index.html']).toContain('<title>cool-game</title>');
  });

  it('src/main.ts imports from vigame packages', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const main = files['src/main.ts']!;
    expect(main).toContain("from '@vigame/core'");
    expect(main).toContain("from '@vigame/renderer-three'");
    expect(main).toContain("from '@vigame/input'");
    expect(main).toContain("from '@vigame/scene'");
  });

  it('tsconfig.json has strict mode enabled', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const tsconfig = JSON.parse(files['tsconfig.json']!);
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('.gitignore excludes node_modules and dist', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    const gitignore = files['.gitignore']!;
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('dist');
  });

  it('vite.config.ts includes vgx asset handling', () => {
    const files = minimalThreeTemplate({ name: 'test-game' });
    expect(files['vite.config.ts']).toContain('**/*.vgx');
  });
});

describe('minimalPhaserTemplate', () => {
  it('generates required files', () => {
    const files = minimalPhaserTemplate({ name: 'phaser-game' });
    expect(files).toHaveProperty('package.json');
    expect(files).toHaveProperty('index.html');
    expect(files).toHaveProperty('src/main.ts');
    expect(files).toHaveProperty('src/scene.vgx');
  });

  it('uses phaser renderer dependency', () => {
    const files = minimalPhaserTemplate({ name: 'phaser-game' });
    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies).toHaveProperty('@vigame/renderer-phaser', 'latest');
    expect(pkg.dependencies).not.toHaveProperty('@vigame/renderer-three');
  });

  it('VGX scene uses phaser renderer', () => {
    const files = minimalPhaserTemplate({ name: 'phaser-game' });
    expect(files['src/scene.vgx']).toContain('renderer="phaser"');
  });

  it('src/main.ts imports PhaserRendererPlugin', () => {
    const files = minimalPhaserTemplate({ name: 'phaser-game' });
    expect(files['src/main.ts']).toContain('PhaserRendererPlugin');
    expect(files['src/main.ts']).toContain("from '@vigame/renderer-phaser'");
  });
});
