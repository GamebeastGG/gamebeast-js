import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { SDK_VERSION } from "../src";

describe("SDK_VERSION", () => {
  it("is this package's version", () => {
    expect(SDK_VERSION).toBe(packageJson.version);
  });
});
