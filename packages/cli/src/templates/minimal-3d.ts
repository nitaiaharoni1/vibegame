export interface TemplateOptions {
  name: string;
  description?: string;
}

export function minimalThreeTemplate(opts: TemplateOptions): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: opts.name,
      version: '0.0.1',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        '@vigame/core': 'latest',
        '@vigame/scene': 'latest',
        '@vigame/renderer-three': 'latest',
        '@vigame/input': 'latest',
        '@vigame/mcp': 'latest',
      },
      devDependencies: {
        vite: '^6.0.0',
        typescript: '^5.7.0',
      },
    }, null, 2),

    'vite.config.ts': `import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.vgx'],
});
`,

    'index.html': `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${opts.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`,

    'src/main.ts': `import { createWorld, startWorld } from '@vigame/core';
import { ThreeRendererPlugin } from '@vigame/renderer-three';
import { InputPlugin } from '@vigame/input';
import { parseVGX, hydrateScene } from '@vigame/scene';
import sceneUrl from './scene.vgx?raw';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;

const world = createWorld({
  plugins: [
    ThreeRendererPlugin({ canvas }),
    InputPlugin(canvas),
  ],
});

hydrateScene(parseVGX(sceneUrl), world);
startWorld(world);

// MCP bridge (dev only)
if (import.meta.env.DEV) {
  import('@vigame/mcp').then(({ VigameBridgePlugin }) => {
    // VigameBridgePlugin is a vigame plugin \u2014 would need to register before startWorld
    // For live MCP control, add VigameBridgePlugin() to the plugins array above
    console.log('[vigame] MCP bridge available');
  });
}
`,

    'src/scene.vgx': `<world renderer="three">
  <config gravity="0 -9.81 0" clear-color="#1a1a2e" />

  <entity name="Camera">
    <transform pos="0 5 10" rx="-23" />
    <camera fov="75" active="true" />
  </entity>

  <entity name="Sun">
    <transform pos="5 10 5" />
    <directional-light color="#ffffff" intensity="1" cast-shadow="true" />
  </entity>

  <entity name="Sky">
    <ambient-light color="#404080" intensity="0.4" />
  </entity>

  <entity name="Ground">
    <transform pos="0 -0.5 0" />
    <mesh shape="box" size="50 1 50" color="#2d5a27" />
  </entity>

  <entity name="Cube">
    <transform pos="0 1 0" />
    <mesh shape="box" size="1 1 1" color="#ff6b35" />
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

    '.gitignore': `node_modules
dist
.env
`,
  };
}
