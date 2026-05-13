import { z } from "zod";

function boolEnv(defaultValue: boolean) {
  const defStr = defaultValue ? "true" : "false";
  return z
    .string()
    .default(defStr)
    .transform((v) => {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes") return true;
      if (s === "false" || s === "0" || s === "no") return false;
      throw new Error(`Invalid boolean env value: ${v}`);
    });
}

const logLevelSchema = z.enum(["info", "debug"]);

function splitCommaList(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function optionalNonEmptyString() {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const t = v.trim();
      return t.length > 0 ? t : undefined;
    });
}

const envSchema = z
  .object({
    REGISTRY_URL: z.string().min(1).transform((v) => v.trim()),
    RETENTION_COUNT: z.coerce.number().int().min(0),
    DELETE_ENABLED: boolEnv(false),

    REGISTRY_USERNAME: optionalNonEmptyString(),
    REGISTRY_PASSWORD: optionalNonEmptyString(),
    REGISTRY_TOKEN: optionalNonEmptyString(),

    REPOSITORIES: z.string().optional(),
    IGNORE_REPOSITORY_PATTERNS: z.string().optional(),
    IGNORE_TAG_PATTERNS: z.string().optional(),

    CRON_EXPRESSION: z.string().default("0 3 * * *"),
    TZ: z.string().optional(),
    LOG_LEVEL: logLevelSchema.default("info"),

    REGISTRY_INSECURE_SKIP_TLS_VERIFY: boolEnv(false),

    RUN_ONCE: boolEnv(false),
  })
  .superRefine((data, ctx) => {
    const hasBasic =
      Boolean(data.REGISTRY_USERNAME) || Boolean(data.REGISTRY_PASSWORD);
    if (hasBasic && !(data.REGISTRY_USERNAME && data.REGISTRY_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "REGISTRY_USERNAME and REGISTRY_PASSWORD must both be set when using basic auth",
      });
    }
    const hasToken = Boolean(data.REGISTRY_TOKEN);
    if (!hasBasic && !hasToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Set REGISTRY_TOKEN or REGISTRY_USERNAME+REGISTRY_PASSWORD for registry auth",
      });
    }
  });

export type AppConfig = {
  registryUrl: string;
  retentionCount: number;
  deleteEnabled: boolean;
  username?: string;
  password?: string;
  token?: string;
  repositories: string[];
  ignoreRepositoryPatterns: string[];
  ignoreTagPatterns: string[];
  cronExpression: string;
  tz?: string;
  logLevel: "info" | "debug";
  insecureSkipTls: boolean;
  runOnce: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid configuration: ${msg}`);
  }
  const d = parsed.data;

  return {
    registryUrl: d.REGISTRY_URL.replace(/\/+$/, ""),
    retentionCount: d.RETENTION_COUNT,
    deleteEnabled: d.DELETE_ENABLED,
    username: d.REGISTRY_USERNAME,
    password: d.REGISTRY_PASSWORD,
    token: d.REGISTRY_TOKEN,
    repositories: splitCommaList(d.REPOSITORIES),
    ignoreRepositoryPatterns: splitCommaList(d.IGNORE_REPOSITORY_PATTERNS),
    ignoreTagPatterns: splitCommaList(d.IGNORE_TAG_PATTERNS),
    cronExpression: d.CRON_EXPRESSION,
    tz: d.TZ?.trim() || undefined,
    logLevel: d.LOG_LEVEL,
    insecureSkipTls: d.REGISTRY_INSECURE_SKIP_TLS_VERIFY,
    runOnce: d.RUN_ONCE,
  };
}
