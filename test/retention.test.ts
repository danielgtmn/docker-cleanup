import { describe, expect, it } from "vitest";

import {
  selectTagsToPrune,
  sortEligibleByNewestFirst,
} from "../src/policy/retention.js";

describe("retention policy", () => {
  it("keeps the newest eligible tags up to retentionCount", () => {
    const older = new Date("2020-01-01T00:00:00Z");
    const newer = new Date("2024-01-01T00:00:00Z");

    const decisions = [
      {
        tag: "a",
        digest: "d1",
        manifestMediaType: "application/vnd.docker.distribution.manifest.v2+json",
        protected: false,
        createdAt: older,
      },
      {
        tag: "b",
        digest: "d2",
        manifestMediaType: "application/vnd.docker.distribution.manifest.v2+json",
        protected: false,
        createdAt: newer,
      },
      {
        tag: "latest",
        digest: "d3",
        manifestMediaType: "application/vnd.docker.distribution.manifest.v2+json",
        protected: true,
        createdAt: newer,
      },
    ];

    const prune = selectTagsToPrune(decisions, 1);
    expect(prune.map((p) => p.tag)).toEqual(["a"]);

    const sorted = sortEligibleByNewestFirst(decisions).map((x) => x.tag);
    expect(sorted).toEqual(["b", "a"]);
  });
});
