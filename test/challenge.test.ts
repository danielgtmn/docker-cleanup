import { describe, expect, it } from "vitest";

import { parseBearerChallenge } from "../src/registry/challenge.js";

describe("parseBearerChallenge", () => {
  it("parses quoted bearer params", () => {
    const h =
      'Bearer realm="https://auth.example/token",service="registry.example",scope="repository:my/app:pull"';
    expect(parseBearerChallenge(h)).toEqual({
      realm: "https://auth.example/token",
      service: "registry.example",
      scope: "repository:my/app:pull",
    });
  });

  it("returns null for basic auth", () => {
    expect(parseBearerChallenge('Basic realm="x"')).toBeNull();
  });
});
