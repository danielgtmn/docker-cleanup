import cron from "node-cron";

import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { runCleanup } from "./run-cleanup.js";
import type { RegistryClient } from "./registry/client.js";

export type CronHandle = { stop: () => void };

export function scheduleCleanup(
  config: AppConfig,
  log: Logger,
  task: () => Promise<void>,
): CronHandle {
  const job = cron.schedule(
    config.cronExpression,
    () => {
      void task().catch((err: unknown) => {
        log.error("Scheduled cleanup run failed", { error: String(err) });
      });
    },
    config.tz ? { timezone: config.tz } : {},
  );

  return {
    stop: () => {
      job.stop();
    },
  };
}

export async function runCleanupTask(
  config: AppConfig,
  log: Logger,
  client: RegistryClient,
): Promise<void> {
  log.info("Starting cleanup run");
  await runCleanup(config, log, client);
  log.info("Cleanup run finished");
}
