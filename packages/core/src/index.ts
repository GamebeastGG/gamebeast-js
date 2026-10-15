/**
 * `@gamebeast/core` — the platform-neutral internals shared by `@gamebeast/js` and
 * `@gamebeast/node`: the HTTP API client, configuration store, marker queue, targeting properties,
 * wire types and small primitives.
 *
 * This is an internal building block, not a public SDK. Install `@gamebeast/js` or
 * `@gamebeast/node` instead; this package's exports may change in any release.
 */
export * from "./api";
export * from "./attribution";
export * from "./configStore";
export * from "./context";
export * from "./environment";
export * from "./http";
export * from "./ids";
export * from "./json";
export * from "./latch";
export * from "./listeners";
export * from "./logger";
export * from "./lruCache";
export * from "./markerQueue";
export * from "./markers";
export * from "./options";
export * from "./singleFlight";
export * from "./timers";
export * from "./uuid";
export * from "./validation";
export * from "./wire";
