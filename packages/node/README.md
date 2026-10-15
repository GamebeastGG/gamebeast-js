# @gamebeast/node

The Gamebeast SDK for Node.js (≥ 20) and other server runtimes (Bun, Deno, edge, lambdas): remote
configuration, per-user evaluation, experiments, cohorts and analytics markers.

Use a **secret** API key and never ship it to browsers. For web apps, use
[`@gamebeast/js`](https://www.npmjs.com/package/@gamebeast/js).

Ships ESM and CommonJS builds with type declarations, and uses the platform `fetch`.

```sh
npm install @gamebeast/node
```

## Quick start

```ts
import { GamebeastServer } from "@gamebeast/node";

const gamebeast = new GamebeastServer({ apiKey: process.env.GAMEBEAST_SECRET_KEY! });
await gamebeast.configs.ready();

// Per-user values, with the user's experiment groups applied:
const config = await gamebeast.configs.evaluate({
  distinctId: user.id,
  configuration: "GameSettings", // omit for the primary configuration
  properties: { plan: user.plan },
});
const speed = config.get("PlayerSpeed", 16);

gamebeast.markers.send("purchase_completed", { sku: "gems_100" }, { distinctId: user.id });

process.on("SIGTERM", async () => {
  await gamebeast.shutdown(); // flushes buffered markers
  process.exit(0);
});
```

Create one instance per process and share it. Its timers never keep the process alive.

## Base configurations

On startup the server loads a snapshot of every configuration and active experiment. It then
polls a lightweight status endpoint (every 30 seconds by default, as advertised by the backend)
and refetches documents only when one of them changes.

```ts
gamebeast.configs.get("GameSettings.PlayerSpeed", 16); // base value, no experiments applied
gamebeast.configs.observe("GameSettings.MaintenanceMode", (on) => setMaintenance(on === true));
gamebeast.configs.list(); // [{ id, name, alias, hash, isPrimary }]
```

For short-lived processes (serverless functions), pass `autoRefresh: false` and call
`configs.refresh()` when you need current values.

## Evaluating for a user

`configs.evaluate` asks the backend to evaluate a configuration for one unit. The backend resolves
and records experiment assignments, and returns the document with the assigned group's changes
merged in. Results are reused for `evaluationCacheSeconds` (default 30). After that the SDK
revalidates by hash, and an unchanged result costs one `304` round trip.

`evaluate` never rejects. When the backend is unreachable, it falls back step by step; check
`config.source` when the difference matters:

| `source`        | Meaning                                                            |
| --------------- | ------------------------------------------------------------------ |
| `"evaluated"`   | Evaluated for this unit (fresh, or confirmed unchanged).           |
| `"stale"`       | Evaluation failed; this is the unit's last evaluated value.        |
| `"base"`        | Evaluation failed with nothing cached; the unevaluated base value. |
| `"unavailable"` | Nothing to serve. `get` returns your fallbacks.                    |

Use `unitType: "server"` to evaluate for a server unit (server-level experiments).

## Experiments

```ts
gamebeast.experiments.list(); // active user experiments, from the snapshot
gamebeast.experiments.list("server");

const assignments = await gamebeast.experiments.assign(
  ["u1", "u2", { distinctId: "u3", properties: { plan: "pro" } }],
  {
    sharedProperties: { region: "eu" },
  }
);
assignments.get("u1"); // [{ experimentId, groupId, status, source, ... }]
```

`assign` batches 250 units per request. If any batch fails it rejects with a `GamebeastError`
(carrying `status`, `errorCode` and `retryable`), because a partial answer would read as "not
enrolled" for the missing units.

## Cohorts

```ts
await gamebeast.cohorts.isMember("whales", user.id); // false on failure; never rejects
await gamebeast.cohorts.getMembership("whales", ids); // Map<id, boolean>; rejects on failure
```

Checks for the same cohort that arrive within a few milliseconds share one request. Results are
cached for a minute.

## Markers

```ts
gamebeast.markers.send("match_started", { mode: "ranked" }, { distinctId: user.id, sessionId });
gamebeast.markers.send("server_restarted"); // server-level marker: no user
await gamebeast.flush();
```

Batched 100 per request or every 5 seconds (configurable via `markers`). Transient failures retry
with backoff. During an outage the buffer is capped at 10,000 markers, and the oldest are dropped
first.

### Deeplink attribution

To attribute a server-side marker to the deeplink or UTM campaign a user arrived from, pass
`deeplink`: the `attribution` your `@gamebeast/js` page forwarded, or the result of
`parseAttribution` for a page rendered on the server.

```ts
import { parseAttribution } from "@gamebeast/node";

gamebeast.markers.send(
  "purchase_completed",
  { sku },
  { distinctId: user.id, deeplink: req.body.attribution }
);

// Server-rendered landing, no browser SDK on the page:
const deeplink = parseAttribution(`https://example.com${req.url}`, req.headers.referer);
if (deeplink?.deeplinkData) {
  gamebeast.markers.send("$deeplink_landing", {}, { distinctId: user.id, deeplink });
}
```

Malformed attribution is dropped with a warning and the marker is still sent. The backend ignores
deeplinks that belong to another project.

## Options

| Option                     | Default            | Description                                                              |
| -------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `apiKey`                   | —                  | Secret API key. Required.                                                |
| `environment`              | `"production"`     | Environment alias.                                                       |
| `serverId`                 | random per process | Identifies this instance; used for rate limiting and marker attribution. |
| `autoRefresh`              | `true`             | Poll for configuration and experiment changes.                           |
| `pollIntervalSeconds`      | backend (30)       | Override the poll interval (minimum 5).                                  |
| `evaluationCacheSeconds`   | `30`               | How long `evaluate` reuses a result. `0` always asks.                    |
| `markers`                  | —                  | `{ maxBatchSize, flushIntervalMs, maxBufferedMarkers }`.                 |
| `projectId`                | —                  | For keys that can access several projects.                               |
| `requestTimeoutMs`         | `10000`            | Per-request timeout.                                                     |
| `fetch`, `logger`, `debug` | global / console   | Transport and logging hooks.                                             |

## Targeting properties

Properties must be scalars (`string`, `number`, `boolean`, `null`), `Date`s (sent as epoch
milliseconds), or arrays of up to 100 values of one scalar type. At most 100 properties are sent.
Invalid entries are dropped with a warning instead of failing the call.

## Errors and logging

The SDK never throws from reads, `send`, or `evaluate`. Problems are logged, and you get a fallback.
Every API response is checked against the API contract (`@gamebeast/sdk-contract`). A response
this SDK version can't read is logged once per endpoint, with the field that didn't match, and the
last good data is kept. Upgrading `@gamebeast/node` usually fixes it.
Misconfiguration (a missing `apiKey`, an invalid `environment`) throws from the constructor.
Warnings and errors go to the console by default. Pass `logger` to route them elsewhere, and
`debug: true` to also see requests, cache hits and refreshes.
