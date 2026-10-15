# Changesets

Every user-facing change to `@gamebeast/js`, `@gamebeast/node` or `@gamebeast/core` needs a
changeset. Run `npm run changeset`, pick the packages and the bump, and describe the change for the
changelog.

The three packages are a `fixed` group: they always release together with the same version, and
`@gamebeast/js` / `@gamebeast/node` pin `@gamebeast/core` to that exact version.

On merge to `main`, the release workflow opens (or updates) a "Version packages" PR. Merging that
PR publishes to npm. See [docs/RELEASING.md](../docs/RELEASING.md) for the full process.
