import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // ES2020 keeps the output loadable by every evergreen browser without a downstream transpile step.
  target: "es2020",
  treeshake: true,
  // `@gamebeast/core` stays an external dependency (it is in `dependencies`).
  define: { __SDK_VERSION__: JSON.stringify(version) },
});
