import { defineConfig } from "vitest/config";

// One run covers every package; each package's vitest.config.ts holds its own settings.
export default defineConfig({
  test: {
    projects: ["packages/core", "packages/js", "packages/node"],
  },
});
