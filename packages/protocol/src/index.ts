export {
  BRIDGE_COMMANDS,
  type BridgeCommandName,
} from './commands.js';
export type {
  ActAndObserveArgs,
  ActAndObserveWireResult,
  BridgeInputEventWire,
  WatchForArgs,
  WatchForResult,
} from './compound.js';
export {
  mimeFromDataUrl,
  type ParsedDataUrl,
  parseDataUrl,
} from './data-url.js';
export { VigameError, VigameErrorCode } from './errors.js';
export { SPECIAL_KEY_CODES, SPECIAL_KEY_CODES_TO_CODE } from './keys.js';
export { omitUndefined } from './object.js';
export type {
  ControlMapping,
  DiscoverControlsArgs,
  DiscoverControlsResult,
  EpisodeLogEntry,
  ObserveArgs,
  ObservedEntity,
  ObserveResult,
  RunPolicyArgs,
  RunPolicyResult,
  SpatialRelation,
  StateChangeEntry,
} from './policy.js';
export {
  controlPortFromBridgePort,
  DEFAULT_BRIDGE_PORT,
  resolveBridgePortFromEnv,
  resolveControlPortFromEnv,
} from './ports.js';
export type {
  RunScriptArgs,
  RunScriptResult,
  ScriptAssertionResult,
  ScriptInspection,
  ScriptScreenshot,
  ScriptStep,
} from './script.js';
export type {
  FuzzArgsWire,
  FuzzIssueTypeWire,
  FuzzIssueWire,
  FuzzResultWire,
  TimedInputEventWire,
  TrackArgsWire,
  TrackResultWire,
  TrackSampleWire,
  TrackStatsWire,
} from './track-fuzz.js';
