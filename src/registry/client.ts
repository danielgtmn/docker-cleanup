import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { parseBearerChallenge } from "./challenge.js";

const MANIFEST_ACCEPT =
  [
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
  ].join(", ");

export type TagManifestMeta = {
  digest: string;
  manifestMediaType: string;
  createdAt: Date | null;
};

export class RegistryResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodySnippet: string,
  ) {
    super(message);
    this.name = "RegistryResponseError";
  }
}

export class RegistryClient {
  constructor(
    private readonly config: AppConfig,
    private readonly log: Logger,
  ) {}

  async listRepositories(): Promise<string[]> {
    const repos: string[] = [];
    let path = "/v2/_catalog?n=100";

    for (;;) {
      const res = await this.request("GET", path, {
        headers: { Accept: "application/json" },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new RegistryResponseError(
          `catalog failed: ${res.status}`,
          res.status,
          clip(text),
        );
      }
      const data = JSON.parse(text) as { repositories?: string[] };
      if (Array.isArray(data.repositories)) repos.push(...data.repositories);

      const next = parseLinkNext(res.headers.get("link"));
      if (!next) break;
      path = next;
    }

    return repos;
  }

  async listTags(repo: string): Promise<string[]> {
    const name = encodeRepoName(repo);
    const tags: string[] = [];
    let path = `/v2/${name}/tags/list?n=100`;

    for (;;) {
      const res = await this.request("GET", path, {
        headers: { Accept: "application/json" },
      });
      const text = await res.text();
      if (res.status === 404) return [];
      if (!res.ok) {
        throw new RegistryResponseError(
          `tags list failed for ${repo}: ${res.status}`,
          res.status,
          clip(text),
        );
      }
      const data = JSON.parse(text) as { tags?: string[] };
      if (Array.isArray(data.tags)) tags.push(...data.tags);

      const next = parseLinkNext(res.headers.get("link"));
      if (!next) break;
      path = next;
    }

    return tags;
  }

  async getTagMeta(repo: string, tag: string): Promise<TagManifestMeta | null> {
    const name = encodeRepoName(repo);
    const res = await this.request(
      "GET",
      `/v2/${name}/manifests/${encodeURIComponent(tag)}`,
      {
        headers: {
          Accept: MANIFEST_ACCEPT,
        },
      },
    );

    const text = await res.text();
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new RegistryResponseError(
        `manifest get failed for ${repo}:${tag}: ${res.status}`,
        res.status,
        clip(text),
      );
    }

    const digest = res.headers.get("docker-content-digest");
    if (!digest) {
      this.log.warn("Missing Docker-Content-Digest header", { repo, tag });
      return null;
    }

    const manifestMediaType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

    let createdAt: Date | null = null;
    try {
      const manifest = JSON.parse(text) as Record<string, unknown>;
      createdAt = await this.resolveCreatedAtFromManifest(name, manifest);
    } catch (e) {
      this.log.warn("Failed to parse manifest or config blob", {
        repo,
        tag,
        error: String(e),
      });
    }

    return { digest, manifestMediaType, createdAt };
  }

  async deleteManifest(
    repo: string,
    digest: string,
    manifestMediaType: string,
  ): Promise<void> {
    const name = encodeRepoName(repo);
    const res = await this.request(
      "DELETE",
      `/v2/${name}/manifests/${digest}`,
      {
        headers: {
          Accept: manifestMediaType || MANIFEST_ACCEPT,
        },
      },
    );

    if (res.status === 202 || res.status === 204) return;

    const text = await res.text();
    throw new RegistryResponseError(
      `delete manifest failed for ${repo}@${digest}: ${res.status}`,
      res.status,
      clip(text),
    );
  }

  private async resolveCreatedAtFromManifest(
    encodedRepo: string,
    manifest: Record<string, unknown>,
  ): Promise<Date | null> {
    const mediaType =
      typeof manifest.mediaType === "string" ? manifest.mediaType : "";

    if (isIndexMediaType(mediaType)) {
      const manifests = manifest.manifests;
      if (!Array.isArray(manifests) || manifests.length === 0) return null;

      const preferred =
        manifests.find(
          (m) =>
            isRecord(m) &&
            m.platform &&
            isRecord(m.platform) &&
            m.platform.architecture === "amd64" &&
            m.platform.os === "linux",
        ) ?? manifests[0];

      if (!isRecord(preferred) || typeof preferred.digest !== "string")
        return null;

      const child = await this.fetchManifestJson(encodedRepo, preferred.digest);
      if (!child) return null;
      return this.resolveCreatedAtFromManifest(encodedRepo, child);
    }

    if (isImageManifestMediaType(mediaType)) {
      const config = manifest.config;
      if (!isRecord(config) || typeof config.digest !== "string") return null;
      return this.fetchConfigCreatedAt(encodedRepo, config.digest);
    }

    // Docker schema 1 or unknown
    this.log.debug("Unhandled manifest mediaType for date resolution", {
      mediaType,
    });
    return null;
  }

  private async fetchManifestJson(
    encodedRepo: string,
    digest: string,
  ): Promise<Record<string, unknown> | null> {
    const res = await this.request(
      "GET",
      `/v2/${encodedRepo}/manifests/${digest}`,
      {
        headers: { Accept: MANIFEST_ACCEPT },
      },
    );
    const text = await res.text();
    if (!res.ok) return null;
    return JSON.parse(text) as Record<string, unknown>;
  }

  private async fetchConfigCreatedAt(
    encodedRepo: string,
    configDigest: string,
  ): Promise<Date | null> {
    const res = await this.request(
      "GET",
      `/v2/${encodedRepo}/blobs/${configDigest}`,
      {
        headers: {
          Accept: "application/vnd.docker.container.image.v1+json",
        },
      },
    );
    const text = await res.text();
    if (!res.ok) return null;
    try {
      const cfg = JSON.parse(text) as { created?: string };
      if (typeof cfg.created !== "string") return null;
      const d = new Date(cfg.created);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  private async request(
    method: string,
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = joinRegistryUrl(this.config.registryUrl, path);
    const response = await this.sendWithAuth(method, url, init);

    if (response.status !== 401) return response;

    const renewed = await this.tryRenewBearer(response);
    if (!renewed) return response;

    const headers2 = new Headers(init.headers);
    headers2.set("Authorization", `Bearer ${renewed}`);
    return fetch(url, { ...init, method, headers: headers2 });
  }

  private async sendWithAuth(
    method: string,
    url: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.config.token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.config.token}`);
    } else if (this.config.username && this.config.password) {
      const basic = Buffer.from(
        `${this.config.username}:${this.config.password}`,
        "utf8",
      ).toString("base64");
      headers.set("Authorization", `Basic ${basic}`);
    }

    return fetch(url, { ...init, method, headers });
  }

  private async tryRenewBearer(triggerResponse: Response): Promise<string | null> {
    const challenge = parseBearerChallenge(
      triggerResponse.headers.get("www-authenticate"),
    );
    if (!challenge) return null;

    const tokenUrl = new URL(challenge.realm);
    if (challenge.service)
      tokenUrl.searchParams.set("service", challenge.service);
    if (challenge.scope) tokenUrl.searchParams.set("scope", challenge.scope);
    if (this.config.username)
      tokenUrl.searchParams.set("account", this.config.username);

    const headers = new Headers({ Accept: "application/json" });
    if (this.config.username && this.config.password) {
      const basic = Buffer.from(
        `${this.config.username}:${this.config.password}`,
        "utf8",
      ).toString("base64");
      headers.set("Authorization", `Basic ${basic}`);
    }

    this.log.debug("Fetching registry bearer token", {
      realm: challenge.realm,
      hasService: Boolean(challenge.service),
      hasScope: Boolean(challenge.scope),
    });

    const res = await fetch(tokenUrl.toString(), { headers });
    const text = await res.text();
    if (!res.ok) {
      this.log.warn("Token endpoint failed", {
        status: res.status,
        body: clip(text),
      });
      return null;
    }

    try {
      const data = JSON.parse(text) as { token?: string; access_token?: string };
      const token = data.token ?? data.access_token;
      if (!token) return null;
      return token;
    } catch {
      return null;
    }
  }
}

function encodeRepoName(repo: string): string {
  return repo
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function joinRegistryUrl(base: string, path: string): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  const rel = path.startsWith("/") ? path.slice(1) : path;
  return new URL(rel, root).toString();
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const p of parts) {
    const section = p.trim();
    const match = section.match(/^<([^>]+)>;\s*rel="?next"?$/i);
    if (match) {
      try {
        const u = new URL(match[1]);
        return `${u.pathname}${u.search}`;
      } catch {
        return match[1].startsWith("/") ? match[1] : `/${match[1]}`;
      }
    }
  }
  return null;
}

function clip(s: string, max = 512): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isIndexMediaType(mt: string): boolean {
  return (
    mt === "application/vnd.docker.distribution.manifest.list.v2+json" ||
    mt === "application/vnd.oci.image.index.v1+json"
  );
}

function isImageManifestMediaType(mt: string): boolean {
  return (
    mt === "application/vnd.docker.distribution.manifest.v2+json" ||
    mt === "application/vnd.oci.image.manifest.v1+json"
  );
}
