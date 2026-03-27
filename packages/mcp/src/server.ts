import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  mimeFromDataUrl,
  omitUndefined,
  parseDataUrl,
  resolveBridgePortFromEnv,
  resolveControlPortFromEnv,
} from '@vigame/protocol';

import { BridgeServer } from './bridge-server.js';
import { handleCliControlPost } from './cli-control-handler.js';
import { mcpJsonResult, mcpTextResult, textBlock, textBlockJson } from './mcp-content.js';
import { agentToolDefs, discover_controls, observe, run_policy } from './tools/agent.js';
import { asset_manifest, assetToolDefs, placeholder_asset } from './tools/assets.js';
import { act_and_observe, compoundToolDefs, watch_for } from './tools/compound.js';
import {
  eval_js,
  get_errors,
  inspect,
  inspectToolDefs,
  mutate,
  mutate_many,
  scene_graph,
} from './tools/inspect.js';
import { perf_snapshot, perfToolDefs } from './tools/perf.js';
import { init_project, project_context, projectToolDefs, update_context } from './tools/project.js';
import {
  fuzz_test,
  record,
  run_playtest,
  run_script,
  simulate_input,
  testingToolDefs,
} from './tools/testing.js';
import { track, trackingToolDefs } from './tools/tracking.js';
import { debug_screenshot, screenshot, visualToolDefs, watch } from './tools/visual.js';

/** All registered tool definitions in one flat array. */
const ALL_TOOL_DEFS = [
  ...visualToolDefs,
  ...inspectToolDefs,
  ...testingToolDefs,
  ...projectToolDefs,
  ...assetToolDefs,
  ...perfToolDefs,
  ...compoundToolDefs,
  ...trackingToolDefs,
  ...agentToolDefs,
];

type ToolArgs = Record<string, unknown>;

export async function startServer(): Promise<void> {
  const bridge = new BridgeServer(resolveBridgePortFromEnv());

  const server = new Server(
    { name: 'vigame-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // -------------------------------------------------------------------------
  // List tools
  // -------------------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: ALL_TOOL_DEFS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // -------------------------------------------------------------------------
  // Call tools
  // -------------------------------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as ToolArgs;

    try {
      switch (name) {
        // --- Visual ---
        case 'screenshot': {
          const img = await screenshot(
            bridge,
            omitUndefined({
              quality: a.quality as number | undefined,
              maxWidth: a.maxWidth as number | undefined,
              maxHeight: a.maxHeight as number | undefined,
              mode: a.mode as string | undefined,
            }),
          );
          return { content: [img] };
        }
        case 'watch': {
          const frames = await watch(bridge, {
            seconds: a.seconds as number,
            ...omitUndefined({
              interval: a.interval as number | undefined,
              diffThreshold: a.diffThreshold as number | undefined,
              maxWidth: a.maxWidth as number | undefined,
              maxHeight: a.maxHeight as number | undefined,
              mode: a.mode as string | undefined,
            }),
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: `Captured ${frames.length} frames over ${a.seconds}s`,
              },
              ...frames.map((f) => f.image),
            ],
          };
        }

        // --- Inspect ---
        case 'scene_graph': {
          const graph = await scene_graph(
            bridge,
            omitUndefined({ depth: a.depth as number | undefined }),
          );
          return mcpTextResult(graph);
        }
        case 'inspect': {
          const result = await inspect(bridge, { path: a.path as string });
          return mcpJsonResult(result);
        }
        case 'mutate': {
          const result = await mutate(bridge, {
            path: a.path as string,
            value: a.value,
          });
          return mcpJsonResult(result);
        }
        case 'mutate_many': {
          const result = await mutate_many(bridge, {
            mutations: a.mutations as Array<{ path: string; value: unknown }>,
          });
          return mcpJsonResult(result);
        }
        case 'eval_js': {
          const result = await eval_js(bridge, { code: a.code as string });
          return mcpJsonResult(result);
        }

        // --- Testing ---
        case 'simulate_input': {
          const result = await simulate_input(bridge, {
            sequence: a.sequence as Parameters<typeof simulate_input>[1]['sequence'],
          });
          return mcpTextResult(`Dispatched ${result.executed} input events`);
        }
        case 'record': {
          const result = await record(bridge, {
            seconds: a.seconds as number,
            ...omitUndefined({
              screenshotInterval: a.screenshotInterval as number | undefined,
              diffThreshold: a.diffThreshold as number | undefined,
            }),
          });
          const images = result.frames.flatMap((f) => {
            const url = f.screenshot;
            if (url === undefined) return [];
            const parsed = parseDataUrl(url);
            if (!parsed) return [];
            return [
              {
                type: 'image' as const,
                data: parsed.base64,
                mimeType: parsed.mimeType,
              },
            ];
          });
          const frameSummary = result.frames.map((f) => ({
            timestamp: f.timestamp,
            elapsed: f.elapsed,
            ...(f.sceneGraph !== undefined ? { sceneGraph: f.sceneGraph } : {}),
          }));
          return {
            content: [
              textBlockJson({ frameCount: result.frames.length, frames: frameSummary }),
              ...images,
            ],
          };
        }
        case 'run_playtest': {
          const result = await run_playtest(bridge, {
            ...omitUndefined({ name: a.name as string | undefined }),
            spec: a.spec as Parameters<typeof run_playtest>[1]['spec'],
          });
          return {
            content: [
              textBlockJson({ name: result.name, passed: result.passed, results: result.results }),
              ...result.screenshots.map((s) => ({
                type: 'image' as const,
                data: s.data,
                mimeType: s.mimeType,
              })),
            ],
          };
        }

        // --- Project ---
        case 'project_context': {
          const ctx = project_context({});
          return mcpTextResult(ctx);
        }
        case 'update_context': {
          const result = update_context({
            section: a.section as Parameters<typeof update_context>[0]['section'],
            content: a.content as string,
          });
          return mcpTextResult(`Updated: ${result.updated}`);
        }
        case 'init_project': {
          const result = init_project({
            gameDescription: a.gameDescription as string,
            renderer: a.renderer as 'three' | 'phaser',
          });
          return mcpTextResult(`Created project context:\n${result.created.join('\n')}`);
        }

        // --- Assets ---
        case 'placeholder_asset': {
          const result = placeholder_asset({
            type: a.type as 'texture' | 'sprite',
            width: a.width as number,
            height: a.height as number,
            ...omitUndefined({
              color: a.color as string | undefined,
              label: a.label as string | undefined,
            }),
          });
          const placeholderMeta = {
            width: result.width,
            height: result.height,
            format: result.format,
          };
          const parsedPlaceholder = parseDataUrl(result.dataUrl);
          return {
            content: [
              textBlockJson(placeholderMeta),
              {
                type: 'image' as const,
                data: parsedPlaceholder?.base64 ?? result.dataUrl.split(',')[1] ?? result.dataUrl,
                mimeType: parsedPlaceholder?.mimeType ?? 'image/svg+xml',
              },
            ],
          };
        }
        case 'asset_manifest': {
          const result = asset_manifest(
            omitUndefined({ projectDir: a.projectDir as string | undefined }),
          );
          return mcpJsonResult(result);
        }

        // --- Perf ---
        case 'perf_snapshot': {
          const result = await perf_snapshot(bridge);
          return mcpJsonResult(result);
        }

        // --- Compound ---
        case 'act_and_observe': {
          const result = await act_and_observe(
            bridge,
            a as unknown as Parameters<typeof act_and_observe>[1],
          );
          if (result.imageData) {
            return {
              content: [
                textBlock(result.textContent),
                {
                  type: 'image' as const,
                  data: result.imageData.data,
                  mimeType: result.imageData.mimeType,
                },
              ],
            };
          }
          return mcpTextResult(result.textContent);
        }
        case 'watch_for': {
          const result = await watch_for(bridge, a as unknown as Parameters<typeof watch_for>[1]);
          if (result.imageData) {
            return {
              content: [
                textBlock(result.textContent),
                {
                  type: 'image' as const,
                  data: result.imageData.data,
                  mimeType: result.imageData.mimeType,
                },
              ],
            };
          }
          return mcpTextResult(result.textContent);
        }

        // --- Tracking ---
        case 'track': {
          const result = await track(bridge, a as unknown as Parameters<typeof track>[1]);
          return mcpJsonResult(result);
        }

        // --- Agent tools ---
        case 'run_policy': {
          const result = await run_policy(bridge, a as unknown as Parameters<typeof run_policy>[1]);
          return mcpJsonResult(result);
        }
        case 'observe': {
          const result = await observe(bridge, a as unknown as Parameters<typeof observe>[1]);
          return mcpJsonResult(result);
        }
        case 'discover_controls': {
          const result = await discover_controls(
            bridge,
            a as unknown as Parameters<typeof discover_controls>[1],
          );
          return mcpJsonResult(result);
        }

        // --- Errors ---
        case 'get_errors': {
          const result = await get_errors(bridge);
          return mcpJsonResult(result);
        }

        // --- Debug visual ---
        case 'debug_screenshot': {
          const img = await debug_screenshot(bridge, {
            ...omitUndefined({
              boundingBoxes: a.boundingBoxes as boolean | undefined,
              grid: a.grid as boolean | undefined,
              quality: a.quality as number | undefined,
              mode: a.mode as string | undefined,
            }),
            ...(Array.isArray(a.properties) ? { properties: a.properties as string[] } : {}),
          });
          return { content: [img] };
        }

        // --- Fuzz testing ---
        case 'fuzz_test': {
          const result = await fuzz_test(bridge, {
            duration_ms: a.duration_ms as number,
            ...omitUndefined({
              input_rate: a.input_rate as number | undefined,
              include_mouse: a.include_mouse as boolean | undefined,
            }),
            ...(Array.isArray(a.keys) ? { keys: a.keys as string[] } : {}),
            ...(Array.isArray(a.watch_paths) ? { watch_paths: a.watch_paths as string[] } : {}),
          });
          const content: Array<
            { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
          > = [textBlockJson(result)];
          if (result.first_issue_screenshot) {
            const parsed = parseDataUrl(result.first_issue_screenshot);
            content.push({
              type: 'image' as const,
              data:
                parsed?.base64 ?? result.first_issue_screenshot.replace(/^data:[^;]+;base64,/, ''),
              mimeType: parsed?.mimeType ?? mimeFromDataUrl(result.first_issue_screenshot),
            });
          }
          return { content };
        }

        // --- Script runner ---
        case 'run_script': {
          const result = await run_script(bridge, a as unknown as Parameters<typeof run_script>[1]);
          const content: Array<
            { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
          > = [
            textBlockJson({
              completed: result.completed,
              steps_executed: result.steps_executed,
              total_steps: result.total_steps,
              elapsed_ms: result.elapsed_ms,
              assertions: result.assertions,
              inspections: result.inspections,
              errors: result.errors,
            }),
          ];
          for (const ss of result.screenshots) {
            const parsed = parseDataUrl(ss.dataUrl);
            if (parsed) {
              content.push(textBlock(`[${ss.label}] step ${ss.step_index}`));
              content.push({
                type: 'image' as const,
                data: parsed.base64,
                mimeType: parsed.mimeType,
              });
            }
          }
          return { content };
        }

        default:
          return {
            ...mcpTextResult(`Unknown tool: ${name}`),
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...mcpTextResult(`Error: ${message}`),
        isError: true,
      };
    }
  });

  // HTTP control server for CLI subcommands (port = bridge port + 1, default 7778)
  const controlPort = resolveControlPortFromEnv();
  const httpServer = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      void (async () => {
        const out = await handleCliControlPost(bridge, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify('error' in out ? { error: out.error } : { result: out.result }));
      })();
    });
  });
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Primary already owns the control port — skip in proxy mode.
      return;
    }
    process.stderr.write(`[vigame-mcp] Control server error: ${err.message}\n`);
  });
  httpServer.listen(controlPort);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
