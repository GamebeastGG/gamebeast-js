/**
 * `@gamebeast/node` — the Gamebeast SDK for Node.js and other server runtimes.
 *
 * Use a **secret** API key here and never ship it to browsers.
 */
export { GamebeastServer } from "./server";
export type { GamebeastServerOptions } from "./server";
export type {
  ServerConfigs,
  EvaluatedConfiguration,
  EvaluateOptions,
  EvaluationSource,
} from "./configs";
export type { ConfigurationInfo } from "./snapshot";
export type { ServerExperiments, AssignUnit, AssignOptions } from "./experiments";
export type { ServerCohorts } from "./cohorts";
export type { ServerMarkers, ServerMarkerOptions, MarkerQueueSettings } from "./markers";
export { GamebeastError } from "./errors";
export { SDK_VERSION } from "./version";
export { parseAttribution } from "@gamebeast/core";

export type {
  AssignmentEntry,
  AssignmentSource,
  ConfigPath,
  DeeplinkAttribution,
  DeeplinkData,
  ExperimentAssignmentMetadata,
  FetchLike,
  GamebeastLogger,
  JsonObject,
  JsonValue,
  MarkerProperties,
  Properties,
  PropertyValue,
  SdkExperimentDescriptor,
  SdkExperimentGroup,
  UnitType,
  Unsubscribe,
  UtmParameters,
} from "@gamebeast/core";
