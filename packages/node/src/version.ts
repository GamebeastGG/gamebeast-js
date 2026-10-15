/** Replaced at build time (tsup `define`) and in tests (vitest `define`) with `package.json`'s version. */
declare const __SDK_VERSION__: string;

/** This package's version. Sent to the backend in the `sdkversion` header as `gamebeast-node/<version>`. */
export const SDK_VERSION: string = __SDK_VERSION__;

/** The SDK half of the `sdkversion` header. */
export const SDK_NAME = "gamebeast-node";
