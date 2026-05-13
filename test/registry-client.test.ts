import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { RegistryClient } from "../src/registry/client.js";

describe("RegistryClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists repositories from catalog pages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v2/_catalog?n=100")) {
        return new Response(
          JSON.stringify({ repositories: ["a/b"] }),
          {
            status: 200,
            headers: {
              link: '</v2/_catalog?last=z&n=100>; rel="next"',
            },
          },
        );
      }
      if (url.includes("/v2/_catalog?last=z")) {
        return new Response(JSON.stringify({ repositories: ["c/d"] }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = loadConfig({
      REGISTRY_URL: "https://registry.example",
      RETENTION_COUNT: "5",
      REGISTRY_TOKEN: "tok",
    });
    const client = new RegistryClient(config, createLogger(config));
    const repos = await client.listRepositories();
    expect(repos).toEqual(["a/b", "c/d"]);
  });

  it("renews bearer token after 401", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/token")) {
          expect(init?.headers).toBeDefined();
          return new Response(JSON.stringify({ token: "fresh" }), {
            status: 200,
          });
        }

        if (url.endsWith("/v2/_catalog?n=100")) {
          const hdrs = new Headers(init?.headers as HeadersInit | undefined);
          const auth = hdrs.get("Authorization");
          if (auth !== "Bearer fresh") {
            return new Response("nope", {
              status: 401,
              headers: {
                "www-authenticate":
                  'Bearer realm="https://registry.example/token",service="svc",scope="registry:catalog:*"',
              },
            });
          }
          return new Response(JSON.stringify({ repositories: [] }), {
            status: 200,
          });
        }

        return new Response("unexpected", { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = loadConfig({
      REGISTRY_URL: "https://registry.example",
      RETENTION_COUNT: "5",
      REGISTRY_USERNAME: "u",
      REGISTRY_PASSWORD: "p",
    });
    const client = new RegistryClient(config, createLogger(config));
    await client.listRepositories();

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
