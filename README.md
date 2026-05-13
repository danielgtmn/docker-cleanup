# docker-registry-cleanup

Automated tag retention for OCI / Docker Registry HTTP API v2 registries. Connects to a registry, applies a per-repository retention policy (keep the `N` newest non-ignored tags), and deletes older manifests on a cron schedule.

Source: [github.com/danielgtmn/docker-cleanup](https://github.com/danielgtmn/docker-cleanup)

## Quick start

Pull the image and run a dry-run against your registry:

```bash
docker run --rm \
  -e REGISTRY_URL=https://registry.example.com \
  -e REGISTRY_USERNAME=user \
  -e REGISTRY_PASSWORD=pass \
  -e RETENTION_COUNT=10 \
  -e IGNORE_TAG_PATTERNS='latest,release-*' \
  -e RUN_ONCE=true \
  ghcr.io/danielgtmn/docker-cleanup:latest
```

`DELETE_ENABLED` defaults to `false`, so this only logs what *would* be deleted. Set it to `true` once you've verified the plan.

## How it works

1. **Discover repositories** — uses `REPOSITORIES` if set, otherwise `GET /v2/_catalog`.
2. **Filter** — skips any repo matching `IGNORE_REPOSITORY_PATTERNS`.
3. **List tags** — fetches all tags for each repository.
4. **Sort by age** — uses the image config blob's `created` timestamp; falls back to lexicographic order when unavailable.
5. **Retain** — keeps the `N` newest tags plus any tag matching `IGNORE_TAG_PATTERNS`.
6. **Delete** — removes the manifest for each remaining tag (or logs only, if `DELETE_ENABLED=false`).

On startup the process runs one cleanup immediately, then schedules further runs via `CRON_EXPRESSION`. Set `RUN_ONCE=true` to skip scheduling. `SIGTERM` / `SIGINT` shut it down cleanly.

> **Blob garbage collection** — deleting a manifest does not always free blob storage. Run your registry's GC (Harbor, GitLab, Distribution, etc.) to reclaim space.

## Configuration

All configuration is via environment variables.

### Connection

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REGISTRY_URL` | yes | — | Base URL, e.g. `https://registry.example.com` |
| `REGISTRY_TOKEN` | one of auth | — | Bearer token for the registry API. |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | one of auth | — | HTTP Basic credentials (also used against the token endpoint when challenged). |
| `REGISTRY_INSECURE_SKIP_TLS_VERIFY` | no | `false` | Disable TLS verification. **Dev/test only.** |

### Retention policy

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RETENTION_COUNT` | yes | — | Per repository: number of newest eligible tags to keep (non-negative integer). |
| `DELETE_ENABLED` | no | `false` | If `false`, dry-run only — logs the deletion plan without executing it. |
| `REPOSITORIES` | no | catalog | Comma-separated repo names (e.g. `my/app,my/worker`). Falls back to `GET /v2/_catalog`. |
| `IGNORE_REPOSITORY_PATTERNS` | no | — | Comma-separated [picomatch](https://github.com/micromatch/picomatch) globs; matching repos are skipped entirely. |
| `IGNORE_TAG_PATTERNS` | no | — | Comma-separated picomatch globs; matching tags are always retained. |

### Scheduling & logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CRON_EXPRESSION` | no | `0 3 * * *` | `node-cron` syntax. |
| `TZ` | no | system | IANA timezone for the schedule (e.g. `Europe/Berlin`). |
| `RUN_ONCE` | no | `false` | Run one cleanup and exit (no scheduler). |
| `LOG_LEVEL` | no | `info` | `info` or `debug`. |

## Build from source

```bash
docker build -t registry-cleanup:local .
```

## Releases

Published to GitHub Container Registry via [`release-ghcr.yml`](https://github.com/danielgtmn/docker-cleanup/blob/main/.github/workflows/release-ghcr.yml) on every GitHub Release:

- `ghcr.io/danielgtmn/docker-cleanup:<release-tag>` — always (e.g. `v1.2.3`).
- `ghcr.io/danielgtmn/docker-cleanup:latest` — only for non-prerelease releases.

The workflow uses `GITHUB_TOKEN`, so the repository needs **Packages: write** enabled for workflows (default for new repos). Newly published packages are private until made public under the org's Packages settings.

```bash
docker pull ghcr.io/danielgtmn/docker-cleanup:v1.0.0
```

## Full example

```bash
docker run --rm \
  -e REGISTRY_URL=https://registry.internal \
  -e REGISTRY_USERNAME=user \
  -e REGISTRY_PASSWORD=pass \
  -e RETENTION_COUNT=10 \
  -e DELETE_ENABLED=false \
  -e REPOSITORIES=my/api \
  -e IGNORE_TAG_PATTERNS='latest,release-*' \
  -e CRON_EXPRESSION='0 4 * * *' \
  -e TZ=Europe/Berlin \
  ghcr.io/danielgtmn/docker-cleanup:latest
```
