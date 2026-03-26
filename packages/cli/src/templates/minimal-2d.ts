export function minimalPhaserTemplate(opts: { name: string }): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: opts.name,
      version: '0.0.1',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: {
        '@vigame/core': 'latest',
        '@vigame/scene': 'latest',
        '@vigame/renderer-phaser': 'latest',
        '@vigame/input': 'latest',
        '@vigame/mcp': 'latest',
      },
      devDependencies: { vite: '^6.0.0', typescript: '^5.7.0' },
    }, null, 2),

    'vite.config.ts': `import { defineConfig } from 'vite';
export default defineConfig({ assetsInclude: ['**/*.vgx'] });
`,

    'index.html': `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${opts.name}</title>
  <style>* { margin: 0; padding: 0; } body { background: #000; overflow: hidden; }</style>
</head>
<body>
  <canvas id="game"></canvas>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`,

    'src/main.ts': `import { createWorld, startWorld } from '@vigame/core';
import { PhaserRendererPlugin } from '@vigame/renderer-phaser';
import { InputPlugin } from '@vigame/input';
import { parseVGX, hydrateScene } from '@vigame/scene';
import sceneUrl from './scene.vgx?raw';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;

const world = createWorld({
  plugins: [
    PhaserRendererPlugin({ canvas, width: 800, height: 600 }),
    InputPlugin(canvas),
  ],
});

hydrateScene(parseVGX(sceneUrl), world);
startWorld(world);
`,

    'src/scene.vgx': `<world renderer="phaser">
  <config width="800" height="600" />

  <entity name="Player">
    <position x="400" y="300" />
    <sprite texture="player" />
    <arcade-body gravity-y="300" collide-world-bounds="true" />
  </entity>
</world>
`,

    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        lib: ['ES2022', 'DOM'],
      },
      include: ['src'],
    }, null, 2),

    '.gitignore': 'node_modules\ndist\n.env\n',
  };
}
