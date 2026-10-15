# @gamebeast/js

The Gamebeast SDK for browsers and web apps: remote configuration, experiments, cohorts and
analytics markers.

Use a **public** API key. Anything in a browser bundle is visible to your users, so never put a
secret key in client code. For servers, use [`@gamebeast/node`](https://www.npmjs.com/package/@gamebeast/node).

Ships ESM and CommonJS builds with type declarations, and uses the platform `fetch`.

```sh
npm install @gamebeast/js
```

## Quick start

```ts
import { GamebeastClient } from "@gamebeast/js";

export const gamebeast = new GamebeastClient({
  apiKey: "YOUR_PUBLIC_KEY",
  configurations: ["GameSettings"], // loaded right away; they gate configs.ready()
  appVersion: "2.1.0",
});

await gamebeast.configs.ready({ timeoutMs: 3_000 }); // resolves false on timeout, never rejects
const speed = gamebeast.configs.get("GameSettings.PlayerSpeed", 16);

gamebeast.markers.send("level_completed", { level: 3 });
```

Create one instance per page (a module-level singleton works well).

## Identity and sessions

On first visit the client generates an anonymous id and keeps it in `localStorage`, so the same
browser reports as the same user across visits. When the user signs in:

```ts
gamebeast.identify(user.id); // configurations are re-evaluated for this user
gamebeast.resetIdentity(); // on sign-out: back to this browser's anonymous id
```

`identify` is not persisted. Call it again on each page load, or pass `distinctId` in the options.
Sessions are shared across tabs and roll over after `sessionTimeoutMinutes` of inactivity
(default 30).

## Configurations

Configuration values are evaluated **for the current user**. Any experiment the user is enrolled
in is already merged in, so `get` returns what this user should see.

```ts
gamebeast.configs.get("GameSettings.UI.ButtonColor", "blue"); // fallback on missing / wrong type
gamebeast.configs.get(["GameSettings", "key.with.dots"]); // array form for keys containing dots

const stop = gamebeast.configs.observe("GameSettings.PlayerSpeed", (value) => render(value));
gamebeast.configs.onChanged("GameSettings.PlayerSpeed", (value) => toast(`Speed is now ${value}`));
gamebeast.configs.onReady(() => startGame());
await gamebeast.configs.refresh();
```

- The first segment of a path is the configuration alias. A configuration that is not listed in
  `configurations` starts loading the first time you read it; use `observe` to wait for it.
- Values are cached per user and app version. On the next page load they are served immediately
  (so `isReady` can already be `true`), then refreshed in the background.
- While the page is visible, configurations are re-checked every `configRefreshIntervalSeconds`
  (default 60). Change detection is hash-based, so an unchanged configuration costs one small
  `304` round trip. They are also re-checked when the tab becomes visible again.
- `setProperties({ plan: "pro" })` sets targeting properties and re-evaluates. The SDK always adds
  `platform: "web"`, `systemLanguage` and `appVersion`.

## Experiments

Enrollment happens on the backend during evaluation. The client reports what the user is in:

```ts
gamebeast.experiments.assignments;
// [{ experimentId, experimentName, groupId, groupLabel, configuration, source }]
gamebeast.experiments.onAssignmentsChanged((assignments) => analytics.setTraits({ assignments }));
```

## Cohorts

```ts
if (await gamebeast.cohorts.isMember("whales")) showVipOffer();
```

Results are cached for a minute, and concurrent checks share one request. Failures resolve
`false`.

## Markers

Markers are batched (10 per request, or every 10 seconds). When the page is hidden or closed,
buffered markers go out with `fetch` `keepalive` so they survive the unload. If the browser is
offline, they are saved to `localStorage` and sent on the next visit. Failed sends retry with
exponential backoff.

## Server-side rendering

Constructing a `GamebeastClient` during SSR (Next.js, Remix, Nuxt, ...) is safe. With no page
there is no user, so the instance stays inert: reads return their fallbacks, `ready()` resolves
`false`, and markers are dropped. Use [`@gamebeast/node`](https://www.npmjs.com/package/@gamebeast/node) for server-side evaluation.

## Options

| Option                         | Default          | Description                                                        |
| ------------------------------ | ---------------- | ------------------------------------------------------------------ |
| `apiKey`                       | —                | Public API key. Required.                                          |
| `environment`                  | `"production"`   | Environment alias, e.g. `"development"` or a custom `"staging"`.   |
| `configurations`               | `[]`             | Aliases to load immediately; they gate readiness.                  |
| `distinctId`                   | anonymous id     | The signed-in user's id.                                           |
| `properties`                   | `{}`             | Targeting properties.                                              |
| `appVersion`                   | —                | Sent as the `appVersion` property; scopes the configuration cache. |
| `configRefreshIntervalSeconds` | `60`             | Background re-check interval. `0` disables it.                     |
| `sessionTimeoutMinutes`        | `30`             | Inactivity before a new session. `0` never rolls over.             |
| `storage`                      | `localStorage`   | A `KeyValueStorage`, or `null` to persist nothing.                 |
| `projectId`                    | —                | For keys that can access several projects.                         |
| `requestTimeoutMs`             | `10000`          | Per-request timeout.                                               |
| `fetch`, `logger`, `debug`     | global / console | Transport and logging hooks.                                       |

## Targeting properties

Properties must be scalars (`string`, `number`, `boolean`, `null`), `Date`s (sent as epoch
milliseconds), or arrays of up to 100 values of one scalar type. At most 100 properties are sent.
Invalid entries are dropped with a warning instead of failing the call.

## Errors and logging

The SDK never throws from reads or `send`. Problems are logged, and you get a fallback.
Misconfiguration (a missing `apiKey`, an invalid `environment`) throws from the constructor.
Warnings and errors go to the console by default. Pass `logger` to route them elsewhere, and
`debug: true` to also see requests, cache hits and refreshes.

## Bundle size

This package imports only [`@gamebeast/core`](https://www.npmjs.com/package/@gamebeast/core) and the Zod-free part of
`@gamebeast/sdk-contract`. Responses get structural checks instead of schema validation, so the
contract's schemas stay out of browser bundles. `npm run check:package` fails if that changes.
