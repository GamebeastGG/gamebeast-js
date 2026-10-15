# Gamebeast JavaScript SDKs

| Package                            | For                                                  | API key    |
| ---------------------------------- | ---------------------------------------------------- | ---------- |
| [`@gamebeast/js`](packages/js)     | Browsers, web apps, web workers                      | **Public** |
| [`@gamebeast/node`](packages/node) | Node.js ≥ 20, Bun, Deno, edge, lambdas               | **Secret** |
| [`@gamebeast/core`](packages/core) | Internal, shared by both. Don't install it directly. | —          |

Anything in a browser bundle is visible to your users, so never put a secret key in client code.

```sh
npm install @gamebeast/js    # web apps
npm install @gamebeast/node  # servers
```

Docs: [docs.gamebeast.gg](https://docs.gamebeast.gg)

## Repository layout

```
packages/
  core/        @gamebeast/core       shared, platform-neutral internals (published)
  js/          @gamebeast/js         browser SDK
  node/        @gamebeast/node       server SDK
  test-utils/  @gamebeast/test-utils fake Gamebeast API for tests (private, never published)
```

`@gamebeast/js` and `@gamebeast/node` depend on `@gamebeast/core`, pinned to an exact version.
Inside the repo, TypeScript (`paths` in `tsconfig.base.json`) and Vitest (`resolve.alias`)
resolve workspace packages to their sources, so typechecking and tests never need a build.

## Development

```sh
npm install
npm test               # vitest, every package
npm run typecheck
npm run lint
npm run format:check
npm run build          # tsup → packages/*/dist (ESM + CJS + .d.ts)
npm run check:package  # publint + are-the-types-wrong + browser-bundle import check
```

### The API contract

Request and response shapes come from
[`@gamebeast/sdk-contract`](https://www.npmjs.com/package/@gamebeast/sdk-contract), the same package
core-backend declares its `/sdk/*` routes with (`packages/sdk-contract` in service-monorepo), along
with `toAliasSlug` and the request limits. `packages/core/src/wire.ts` only maps the SDK's names
onto it. Don't define wire shapes here: change the contract, release it, then bump the dependency.

`@gamebeast/node` validates responses with the contract's Zod schemas
(`packages/node/src/validation.ts`). `@gamebeast/core` and `@gamebeast/js` import only
`@gamebeast/sdk-contract/core` (no Zod) and type-only imports, and do structural checks instead, so
the schemas stay out of browser bundles. `packages/js/scripts/check-client-bundle.mjs` (part of
`check:package`) fails the build if that changes.

### SDK version

Each package's `SDK_VERSION` is injected from its own `package.json` at build time (tsup `define`)
and in tests (Vitest `define`). It is sent to the backend in the `sdkversion` header as
`gamebeast-js/<version>` or `gamebeast-node/<version>`.

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets). The three published packages
are a `fixed` group, so they always share one version.

1. In your PR, run `npm run changeset` and describe the change.
2. On merge to `main`, the Release workflow (`.github/workflows/release.yml`) opens or updates a
   "Version packages" PR.
3. Merging that PR runs every check and publishes the changed packages to npm with provenance.

Publishing uses npm trusted publishing, so there is no npm token. See
[docs/RELEASING.md](docs/RELEASING.md) for the full CI/CD setup: the npm and GitHub configuration,
updating the API contract, adding a new package, and troubleshooting a failed release.
