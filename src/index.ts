import { loadConfig } from "./config.js";
import {
  runCleanupTask,
  scheduleCleanup,
} from "./cron.js";
import { createLogger } from "./logger.js";
import { RegistryClient } from "./registry/client.js";

function applyInsecureTls(config: ReturnType<typeof loadConfig>): void {
  if (config.insecureSkipTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  applyInsecureTls(config);
  const log = createLogger(config);
  const client = new RegistryClient(config, log);

  if (config.runOnce) {
    await runCleanupTask(config, log, client);
    return;
  }

  log.info("Registry cleanup scheduler started", {
    cron: config.cronExpression,
    tz: config.tz ?? "system default",
    deleteEnabled: config.deleteEnabled,
    retentionCount: config.retentionCount,
  });

  await runCleanupTask(config, log, client);

  const handle = scheduleCleanup(config, log, async () => {
    await runCleanupTask(config, log, client);
  });

  const shutdown = () => {
    log.info("Shutting down");
    handle.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
