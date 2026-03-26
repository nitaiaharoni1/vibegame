// Re-export public API for consumers who import @vigame/mcp as a library
export { BridgeServer } from './bridge-server.js';
export type { AssetEntry, PlaceholderAssetResult } from './tools/assets.js';
export { asset_manifest, placeholder_asset } from './tools/assets.js';
export type { InspectResult, MutateResult, SceneGraphResult } from './tools/inspect.js';
export type { PerfSnapshot } from './tools/perf.js';
export { init_project, project_context, update_context } from './tools/project.js';
export type { AssertionResult, InputEvent, RecordFrame } from './tools/testing.js';
export type { WatchFrame } from './tools/visual.js';
