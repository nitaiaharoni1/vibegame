import * as fs from 'node:fs';
import * as path from 'node:path';

const VIGAME_DIR = '.vigame';

type ContextSection = 'manifest' | 'design' | 'decisions' | 'known-issues';

function sectionFileName(section: ContextSection): string {
  return section === 'manifest' ? 'manifest.json' : `${section}.md`;
}

function vigamePath(cwd: string, filename: string): string {
  return path.join(cwd, VIGAME_DIR, filename);
}

/**
 * Read all project context files from .vigame/ and return them concatenated.
 */
export function project_context(args: { cwd?: string }): string {
  const cwd = args.cwd ?? process.cwd();
  const dir = path.join(cwd, VIGAME_DIR);

  if (!fs.existsSync(dir)) {
    return 'No project context found. Use update_context to initialize.';
  }

  const sections: string[] = [];

  const manifestPath = vigamePath(cwd, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    sections.push(`## manifest.json\n\`\`\`json\n${fs.readFileSync(manifestPath, 'utf8')}\n\`\`\``);
  }

  for (const section of ['design', 'decisions', 'known-issues'] as const) {
    const filePath = vigamePath(cwd, `${section}.md`);
    if (fs.existsSync(filePath)) {
      sections.push(`## ${section}.md\n${fs.readFileSync(filePath, 'utf8')}`);
    }
  }

  if (sections.length === 0) {
    return 'No project context found. Use update_context to initialize.';
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Write or overwrite a specific section of the project context.
 */
export function update_context(args: { section: ContextSection; content: string; cwd?: string }): {
  updated: string;
} {
  const cwd = args.cwd ?? process.cwd();
  const dir = path.join(cwd, VIGAME_DIR);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = sectionFileName(args.section);
  const filePath = vigamePath(cwd, filename);
  fs.writeFileSync(filePath, args.content, 'utf8');

  return { updated: filePath };
}

/**
 * Initialize a new project context directory with starter files.
 */
export function init_project(args: {
  gameDescription: string;
  renderer: 'three' | 'phaser';
  cwd?: string;
}): { created: string[] } {
  const cwd = args.cwd ?? process.cwd();
  const dir = path.join(cwd, VIGAME_DIR);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const created: string[] = [];

  // manifest.json
  const manifestPath = vigamePath(cwd, 'manifest.json');
  const manifest = {
    renderer: args.renderer,
    files: [] as string[],
    created: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  created.push(manifestPath);

  // design.md
  const designPath = vigamePath(cwd, 'design.md');
  fs.writeFileSync(designPath, `# Game Design\n\n${args.gameDescription}\n`, 'utf8');
  created.push(designPath);

  // decisions.md
  const decisionsPath = vigamePath(cwd, 'decisions.md');
  fs.writeFileSync(
    decisionsPath,
    `# Architectural Decisions\n\n_No decisions recorded yet._\n`,
    'utf8',
  );
  created.push(decisionsPath);

  // known-issues.md
  const issuesPath = vigamePath(cwd, 'known-issues.md');
  fs.writeFileSync(issuesPath, `# Known Issues\n\n_No known issues._\n`, 'utf8');
  created.push(issuesPath);

  return { created };
}

/** Tool definitions for registration */
export const projectToolDefs = [
  {
    name: 'project_context',
    description:
      'Read all project context files from .vigame/ (design, decisions, known issues, manifest). Returns a combined summary of the game project.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'update_context',
    description:
      'Write or update a specific section of the project context in .vigame/. Creates the directory if needed.',
    inputSchema: {
      type: 'object' as const,
      required: ['section', 'content'],
      properties: {
        section: {
          type: 'string',
          enum: ['manifest', 'design', 'decisions', 'known-issues'],
          description: 'Which context file to update',
        },
        content: {
          type: 'string',
          description: 'Full file content to write',
        },
      },
    },
  },
  {
    name: 'init_project',
    description:
      'Initialize .vigame/ project context directory with starter files (manifest, design doc, decisions log, known issues).',
    inputSchema: {
      type: 'object' as const,
      required: ['gameDescription', 'renderer'],
      properties: {
        gameDescription: {
          type: 'string',
          description: 'A description of the game being built',
        },
        renderer: {
          type: 'string',
          enum: ['three', 'phaser'],
          description: 'The renderer this game uses',
        },
      },
    },
  },
] as const;
