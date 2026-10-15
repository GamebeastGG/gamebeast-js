import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // ES2020 keeps the output loadable by every evergreen browser and Node >= 20 without a
  // downstream transpile step.
  target: "es2020",
  treeshake: true,
});
