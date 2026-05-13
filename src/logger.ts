import type { AppConfig } from "./config.js";

export function createLogger(config: Pick<AppConfig, "logLevel">) {
  const debugEnabled = config.logLevel === "debug";

  return {
    info(message: string, meta?: Record<string, unknown>) {
      console.log(formatLine("INFO", message, meta));
    },
    debug(message: string, meta?: Record<string, unknown>) {
      if (!debugEnabled) return;
      console.log(formatLine("DEBUG", message, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      console.warn(formatLine("WARN", message, meta));
    },
    error(message: string, meta?: Record<string, unknown>) {
      console.error(formatLine("ERROR", message, meta));
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

function formatLine(
  level: string,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  const suffix =
    meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}] ${message}${suffix}`;
}
