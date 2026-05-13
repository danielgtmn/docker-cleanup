import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { matchesAnyPattern } from "./policy/match.js";
import {
  selectTagsToPrune,
  type TagDecision,
} from "./policy/retention.js";
import { RegistryClient, RegistryResponseError } from "./registry/client.js";

export async function runCleanup(
  config: AppConfig,
  log: Logger,
  client: RegistryClient,
): Promise<void> {
  const repos = await resolveRepositories(config, log, client);

  for (const repo of repos) {
    if (matchesAnyPattern(repo, config.ignoreRepositoryPatterns)) {
      log.info("Skipping repository (ignore pattern)", { repo });
      continue;
    }

    const tags = await client.listTags(repo);
    if (tags.length === 0) {
      log.debug("No tags for repository", { repo });
      continue;
    }

    const decisions: TagDecision[] = [];
    for (const tag of tags) {
      const tagIgnored = matchesAnyPattern(tag, config.ignoreTagPatterns);
      const meta = await client.getTagMeta(repo, tag);
      if (!meta) {
        log.warn("Could not resolve manifest metadata; tag protected from deletion", {
          repo,
          tag,
        });
        decisions.push({
          tag,
          digest: "",
          manifestMediaType: "",
          protected: true,
          createdAt: null,
        });
        continue;
      }

      decisions.push({
        tag,
        digest: meta.digest,
        manifestMediaType: meta.manifestMediaType,
        protected: tagIgnored,
        createdAt: meta.createdAt,
      });
    }

    const toPrune = selectTagsToPrune(decisions, config.retentionCount);

    for (const d of decisions) {
      if (d.protected) {
        log.debug("Protected tag", { repo, tag: d.tag });
      }
    }

    const eligibleCount = decisions.filter((x) => !x.protected).length;
    const keepEligible = Math.min(config.retentionCount, eligibleCount);
    log.info("Repository summary", {
      repo,
      tags: tags.length,
      eligible: eligibleCount,
      keepEligible,
      prune: toPrune.length,
      deleteEnabled: config.deleteEnabled,
    });

    for (const cut of toPrune) {
      if (!cut.digest) {
        log.warn("Skipping prune without digest", { repo, tag: cut.tag });
        continue;
      }
      if (!config.deleteEnabled) {
        log.info("Dry-run: would delete tag manifest", {
          repo,
          tag: cut.tag,
          digest: cut.digest,
        });
        continue;
      }

      try {
        await client.deleteManifest(repo, cut.digest, cut.manifestMediaType);
        log.info("Deleted tag manifest", {
          repo,
          tag: cut.tag,
          digest: cut.digest,
        });
      } catch (e) {
        if (e instanceof RegistryResponseError) {
          log.error("Delete failed", {
            repo,
            tag: cut.tag,
            status: e.status,
            body: e.bodySnippet,
          });
        } else {
          log.error("Delete failed", { repo, tag: cut.tag, error: String(e) });
        }
      }
    }
  }
}

async function resolveRepositories(
  config: AppConfig,
  log: Logger,
  client: RegistryClient,
): Promise<string[]> {
  if (config.repositories.length > 0) {
    log.info("Using configured repository list", {
      count: config.repositories.length,
    });
    return config.repositories;
  }

  try {
    const all = await client.listRepositories();
    log.info("Discovered repositories via catalog", { count: all.length });
    return all;
  } catch (e) {
    if (e instanceof RegistryResponseError && (e.status === 403 || e.status === 404)) {
      throw new Error(
        "Catalog endpoint is not available for this registry. Set REPOSITORIES to a comma-separated list of repository names.",
      );
    }
    throw e;
  }
}
