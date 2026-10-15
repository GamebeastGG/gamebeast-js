/**
 * `@gamebeast/js` — the Gamebeast SDK for browsers and web apps.
 *
 * Use a **public** API key here: anything in a browser bundle is visible to your users.
 */
export { GamebeastClient } from "./client";
export type { GamebeastClientOptions } from "./client";
export type { ClientConfigs } from "./configs";
export type { ClientMarkers } from "./markers";
export type { ClientExperiments, ExperimentAssignment } from "./experiments";
export type { ClientCohorts } from "./cohorts";
export type { KeyValueStorage } from "./storage";
export { SDK_VERSION } from "./version";

export type {
  AssignmentSource,
  ConfigPath,
  FetchLike,
  GamebeastLogger,
  JsonObject,
  JsonValue,
  MarkerProperties,
  Properties,
  PropertyValue,
  Unsubscribe,
} from "@gamebeast/core";
