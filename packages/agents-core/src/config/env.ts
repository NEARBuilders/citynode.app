import { z } from "zod";
import { sponsorKeysSchema } from "./sponsor-keys.js";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const rpcUrls = z
  .string()
  .default("https://near.drpc.org,https://free.rpc.fastnear.com")
  .transform((value, context) => {
    const urls = value.split(",").map((url) => url.trim());
    if (urls.some((url) => !z.string().url().safeParse(url).success)) {
      context.addIssue({
        code: "custom",
        message: "NEAR_RPC_URLS must contain comma-separated URLs",
      });
      return z.NEVER;
    }
    return urls;
  });
const encryptionKeyId = z.string().regex(/^env:v[1-9][0-9]*$/);
const encryptionKeys = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined) return undefined;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "SECRET_ENCRYPTION_KEYS must be JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.record(encryptionKeyId, z.string().min(32)).optional()),
);

export const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    TRUSTED_ORIGINS: z
      .string()
      .transform((v) => v.split(",").map((s) => z.string().url().parse(s.trim()))),
    NODE_ENV: z.string().optional(),
    LOG_LEVEL: z.preprocess(
      emptyToUndefined,
      z.enum(["debug", "info", "warn", "error"]).optional(),
    ),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    METRICS_TOKEN: z.preprocess(
      emptyToUndefined,
      z.string().min(32).max(256).regex(/^\S+$/).optional(),
    ),
    SECRET_ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
    SECRET_ENCRYPTION_KEYS: encryptionKeys,
    SECRET_ENCRYPTION_ACTIVE_KEY_ID: z.preprocess(emptyToUndefined, encryptionKeyId.optional()),
    NEAR_RPC_URLS: rpcUrls,
    BETTER_AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
    NEAR_SPONSOR_KEYS: sponsorKeysSchema,
    SPONSOR_QUEUE_WAIT_MS: z.coerce.number().int().min(1).max(60_000).default(5_000),
    SPONSOR_QUEUE_MAX: z.coerce.number().int().min(1).max(10_000).default(100),
    // Spendable sponsor balance below this logs `sponsor_balance_low`; default 1 NEAR.
    SPONSOR_BALANCE_WARN_YOCTO: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,32})$/)
      .default("1000000000000000000000000"),
    NEAR_RELAYER_ALLOWED_RECEIVERS: z.string().default(""),
    NEAR_POLICY_GAS: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,23})$/)
      .default("100000000000000"),
    NEAR_POLICY_STORAGE_DEPOSIT_YOCTO: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,77})$/)
      .default("100000000000000000000000"),
    SPONSOR_DAILY_GLOBAL_LIMIT: z.coerce.number().int().min(1).default(100),
    SPONSOR_DAILY_TENANT_LIMIT: z.coerce.number().int().min(1).default(20),
    SPONSOR_DAILY_AGENT_LIMIT: z.coerce.number().int().min(1).default(10),
    TENANT_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).optional(),
    API_KEY_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).optional(),
    MAX_AGENTS_PER_TENANT: z.coerce.number().int().min(1).optional(),
    // Lifetime admissions per tenant, abandoned and deleted agents included; operator-approved 200.
    MAX_CREATED_AGENTS_PER_TENANT: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(200),
    ),
    MAX_API_KEYS_PER_TENANT: z.coerce.number().int().min(1).optional(),
    // Comma-separated, in priority order. Defaults to a header Railway's edge proxy overwrites
    // itself (a client cannot set it), with X-Forwarded-For only as a fallback: see createAuth.
    TRUSTED_CLIENT_IP_HEADER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    REQUIRE_EMAIL_VERIFICATION: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((config, context) => {
    const keys = { ...config.SECRET_ENCRYPTION_KEYS };
    if (config.SECRET_ENCRYPTION_KEY) {
      if (keys["env:v1"] && keys["env:v1"] !== config.SECRET_ENCRYPTION_KEY)
        context.addIssue({
          code: "custom",
          path: ["SECRET_ENCRYPTION_KEYS"],
          message: "env:v1 conflicts with SECRET_ENCRYPTION_KEY",
        });
      keys["env:v1"] = config.SECRET_ENCRYPTION_KEY;
    }
    if (!keys[config.SECRET_ENCRYPTION_ACTIVE_KEY_ID ?? "env:v1"])
      context.addIssue({
        code: "custom",
        path: ["SECRET_ENCRYPTION_ACTIVE_KEY_ID"],
        message: "Active encryption key must be configured",
      });
  })
  .transform((config) => ({
    ...config,
    // Defaults here so every consumer shares one rule: verbose locally, quieter in production.
    LOG_LEVEL: config.LOG_LEVEL ?? (config.NODE_ENV === "production" ? "info" : "debug"),
  }));
export type Config = z.infer<typeof envSchema>;
