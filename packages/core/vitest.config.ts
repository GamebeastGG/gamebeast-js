import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    alias: {
      "@gamebeast/test-utils": fileURLToPath(
        new URL("../test-utils/src/index.ts", import.meta.url)
      ),
    },
  },
  test: {
    name: "core",
    include: ["test/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
