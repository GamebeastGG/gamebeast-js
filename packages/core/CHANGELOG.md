# @gamebeast/core

## 1.1.0

### Minor Changes

- 04c61bb: Deeplink and UTM attribution for website deeplinks.

  - `@gamebeast/js` reads the landing URL when it starts. The first deeplink (`utm_id=gb_<slug>`) or UTM campaign in a session is kept for the whole session, shared across tabs, and sent with every marker. A Gamebeast deeplink also records a `$deeplink_landing` marker. New options `captureAttribution` (default `true`) and `stripAttributionParams` (default `false`), a `captureAttribution(url)` method for single-page apps, and an `attribution` getter.
  - `@gamebeast/node`: `markers.send(name, properties, { deeplink })` attributes server-side markers, e.g. with the browser's `attribution` forwarded in a request. `parseAttribution(url, referrer?)` is exported for server-rendered landings.
  - Requires `@gamebeast/sdk-contract` 1.1.0.
