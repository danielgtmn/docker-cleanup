# docker-registry-cleanup

Container that connects to an **OCI Distribution / Docker Registry HTTP API v2** registry, lists repositories (or uses a fixed list), applies **per-repository tag retention** (keep the `N` newest non-ignored tags), and optionally **deletes** older manifest digests.

**Garbage collection:** Deleting a manifest often leaves blobs until the registry runs its own GC (e.g. Harbor, GitLab). Plan storage reclamation according to your registry product.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REGISTRY_URL` | yes | Base URL, e.g. `https://registry.example.com` |
| `RETENTION_COUNT` | yes | Per repository: number of **newest eligible** tags to keep (non-negative integer). |
| `DELETE_ENABLED` | no | `true` / `false` (default `false`). If `false`, only logs what would be deleted (dry-run). |
| `REGISTRY_TOKEN` | one of auth | Bearer token for registry API. |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | one of auth | HTTP Basic credentials (used for API and token endpoint when challenged). |
| `REPOSITORIES` | no | Comma-separated repo names (e.g. `my/app,my/worker`). If unset, uses `GET /v2/_catalog` (if enabled). |
| `IGNORE_REPOSITORY_PATTERNS` | no | Comma-separated [picomatch](https://github.com/micromatch/picomatch) globs; matching repos are skipped entirely. |
| `IGNORE_TAG_PATTERNS` | no | Comma-separated picomatch globs; matching tags are never deleted (always retained). |
| `CRON_EXPRESSION` | no | Default `0 3 * * *` (cron syntax for `node-cron`). |
| `TZ` | no | IANA timezone for the schedule (e.g. `Europe/Berlin`). |
| `LOG_LEVEL` | no | `info` or `debug` (default `info`). |
| `REGISTRY_INSECURE_SKIP_TLS_VERIFY` | no | `true` / `false` (default `false`). If `true`, TLS certificate verification is disabled (**insecure**; dev/test only). |
| `RUN_ONCE` | no | `true` / `false` (default `false`). If `true`, runs one cleanup and exits (no scheduler). |

## Behaviour

- Tag age is inferred from the image **config** blob `created` timestamp when possible; if unknown, lexicographic order is used among tags without dates.
- On startup the process runs **one** cleanup immediately, then schedules further runs by `CRON_EXPRESSION` unless `RUN_ONCE=true`.
- Send `SIGTERM` / `SIGINT` to stop.

## Build

```bash
docker build -t registry-cleanup:local .
```

## Publishing (GitHub Releases → GHCR)

When you [create a GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and publish it, [`.github/workflows/release-ghcr.yml`](.github/workflows/release-ghcr.yml) builds the image and pushes to the GitHub Container Registry:

- `ghcr.io/<owner>/<repo>:<release-tag>` — always (uses the release’s tag name, e.g. `v1.2.3`)
- `ghcr.io/<owner>/<repo>:latest` — only for **non-prerelease** releases (avoids overwriting `latest` with a pre-release)

The workflow uses `GITHUB_TOKEN`; ensure **Packages** write permission is allowed for workflows (default for new repos). The package may be **private** until you mark it public under the org’s Packages settings.

Pull example:

```bash
docker pull ghcr.io/OWNER/docker-cleanup:v1.0.0
```

## Example

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
  registry-cleanup:local
```
