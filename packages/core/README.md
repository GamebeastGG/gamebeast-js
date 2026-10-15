# @gamebeast/core

Internal building block shared by the Gamebeast JavaScript SDKs. **Don't install this directly.**

- Browsers and web apps: [`@gamebeast/js`](https://www.npmjs.com/package/@gamebeast/js)
- Node.js and other server runtimes: [`@gamebeast/node`](https://www.npmjs.com/package/@gamebeast/node)

This package holds the platform-neutral code both SDKs use: the HTTP API client, the
configuration store, the marker queue, targeting-property validation, wire types and small
primitives. Its exports are not a public API and may change in any release. It is released in
lockstep with `@gamebeast/js` and `@gamebeast/node`, which pin it to an exact version.

It must stay platform-neutral and Zod-free: it ships inside every browser bundle, so it imports
only `@gamebeast/sdk-contract/core`. `@gamebeast/js`'s `check:package` script enforces this.
