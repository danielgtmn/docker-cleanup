import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires auth", () => {
    expect(() =>
      loadConfig({
        REGISTRY_URL: "https://r",
        RETENTION_COUNT: "3",
      }),
    ).toThrow(/Set REGISTRY_TOKEN/);
  });

  it("parses booleans with defaults", () => {
    const c = loadConfig({
      REGISTRY_URL: "https://r",
      RETENTION_COUNT: "2",
      REGISTRY_TOKEN: "t",
    });
    expect(c.deleteEnabled).toBe(false);
    expect(c.insecureSkipTls).toBe(false);
  });
});
