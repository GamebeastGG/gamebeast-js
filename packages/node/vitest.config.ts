import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineProject({
  // tsup injects the same constant at build time.
  define: { __SDK_VERSION__: JSON.stringify(version) },
  resolve: {
    // Test against the workspace sources, not a stale build.
    alias: {
      "@gamebeast/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@gamebeast/test-utils": fileURLToPath(
        new URL("../test-utils/src/index.ts", import.meta.url)
      ),
    },
  },
  test: {
    name: "node",
    include: ["test/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
