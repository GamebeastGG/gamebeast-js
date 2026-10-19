---
"@gamebeast/core": minor
"@gamebeast/js": minor
"@gamebeast/node": minor
---

Markers can name their own server unit for server-unit experiments.

- `@gamebeast/node`: `markers.send(name, properties, { serverId })` overrides the process's `serverId` for that marker, so one multi-tenant process can report for many units (e.g. one per organization).
- `@gamebeast/js`: `markers.send(name, properties, { serverId })` attributes a browser marker to a server unit.
- A malformed `serverId` (empty, or over 128 characters) is dropped with a warning; the marker is still sent.
- Requires `@gamebeast/sdk-contract` 1.2.0.
