#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import { join, dirname } from 'pathe';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { minimalThreeTemplate } from './templates/minimal-3d.js';
import { minimalPhaserTemplate } from './templates/minimal-2d.js';

const create = defineCommand({
  meta: { name: 'create-vigame', description: 'Create a new vigame project' },
  args: {
    name: {
      type: 'positional',
      description: 'Project name',
      required: false,
    },
    template: {
      type: 'string',
      alias: 't',
      description: 'Template: minimal-3d (default) | minimal-2d',
      default: 'minimal-3d',
    },
  },
  async run({ args }) {
    const rawName = args.name;
    const name = (typeof rawName === 'string' ? rawName : undefined) ?? 'my-vigame-game';
    const template = args.template ?? 'minimal-3d';
    const targetDir = join(process.cwd(), name);

    if (existsSync(targetDir)) {
      consola.error(`Directory "${name}" already exists.`);
      process.exit(1);
    }

    consola.start(`Creating vigame project: ${name} (${template})`);

    let files: Record<string, string>;
    if (template === 'minimal-2d') {
      files = minimalPhaserTemplate({ name });
    } else {
      files = minimalThreeTemplate({ name });
    }

    mkdirSync(targetDir, { recursive: true });

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(targetDir, filePath);
      const dir = dirname(fullPath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
    }

    consola.success(`Project created at ./${name}`);
    consola.box([
      `  cd ${name}`,
      `  pnpm install`,
      `  pnpm dev`,
    ].join('\n'));
  },
});

runMain(create);
