import { readFileSync } from "node:fs";
import { z } from "zod";
import { err, ok, type Result } from "@/types/result";

const SECRET_FILE_VARS = [
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "WS_TICKET_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "S3_SECRET_KEY",
  "MINIO_SECRET_KEY",
  "DATABASE_URL",
  "OAUTH_SIGNING_KEY",
  "INTERCOM_ACCESS_TOKEN",
  "X_CLIENT_SECRET",
] as const;

function resolveFileVars(raw: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...raw };
  for (const name of SECRET_FILE_VARS) {
    const filePath = raw[`${name}_FILE`];
    if (filePath != null && filePath.length > 0) {
      out[name] = readFileSync(filePath, "utf8").trim();
    }
  }
  return out;
}

const LEGACY_STORAGE_NAMES = {
  S3_ENDPOINT: "MINIO_ENDPOINT",
  S3_ACCESS_KEY: "MINIO_ACCESS_KEY",
  S3_SECRET_KEY: "MINIO_SECRET_KEY",
  S3_BUCKET: "MINIO_BUCKET",
} as const;

function applyLegacyStorageNames(
  vars: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out = { ...vars };
  for (const [current, legacy] of Object.entries(LEGACY_STORAGE_NAMES)) {
    const value = out[current];
    if (value == null || value.length === 0) out[current] = out[legacy];
  }
  return out;
}

const boolFromString = z.enum(["true", "false"]).transform((v) => v === "true");

const flagFromString = z.string().transform((v) => v === "true" || v === "1");

const optionalUrl = z
  .union([z.literal(""), z.string().url()])
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

const base = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),
  BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  WS_TICKET_SECRET: z.string().min(32),
  WS_PUBLIC_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_SERVER_ENDPOINT: optionalUrl,
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1).default("warpdrive"),
  S3_REGION: z
    .string()
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v)),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(26_214_400),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be base64 of exactly 32 bytes"),
  MCP_ENABLED: boolFromString.default(true),
  OAUTH_SIGNING_KEY: z.string().default(""),
  OAUTH_REGISTRATION: z.enum(["open", "disabled"]).default("open"),
  BASE_CURRENCY: z.string().length(3).default("USD"),
  SEED_ADMIN_EMAIL: z.string().email().or(z.literal("")).default(""),
  ALLOW_FIRST_LOGIN_ADMIN: boolFromString.default(false),
  APP_VERSION: z.string().default(""),
  POSTHOG_KEY: z.string().default(""),
  POSTHOG_HOST: z.string().default(""),
  DISABLE_TELEMETRY: boolFromString.default(false),
  TELEMETRY_CONSOLE_FORWARDING: boolFromString.default(false),
  APP_COMMIT: z.string().default(""),
  DISABLE_UPDATE_CHECK: boolFromString.default(false),
  AGENTIC_INBOX_ENABLED: flagFromString.default(false),
  INTERCOM_ACCESS_TOKEN: z.string().default(""),
  INTERCOM_REGION: z.enum(["us", "eu", "au"]).default("us"),
  X_CLIENT_ID: z.string().default(""),
  X_CLIENT_SECRET: z.string().default(""),
});

const schema = base.superRefine((v, ctx) => {
  if (v.MCP_ENABLED && Buffer.from(v.OAUTH_SIGNING_KEY, "base64").length !== 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OAUTH_SIGNING_KEY"],
      message: "OAUTH_SIGNING_KEY (base64 32 bytes) is required when MCP_ENABLED",
    });
  }
  if (v.NODE_ENV === "production") {
    if (v.ALLOW_FIRST_LOGIN_ADMIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ALLOW_FIRST_LOGIN_ADMIN"],
        message: "ALLOW_FIRST_LOGIN_ADMIN must be false in production",
      });
    }
    if (v.SEED_ADMIN_EMAIL === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SEED_ADMIN_EMAIL"],
        message: "SEED_ADMIN_EMAIL is required in production",
      });
    }
  }
}).transform((v) => ({
  ...v,
  S3_SERVER_ENDPOINT: v.S3_SERVER_ENDPOINT ?? v.S3_ENDPOINT,
}));

export const envSchema = schema;

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Result<Env, string> {
  const resolved = applyLegacyStorageNames(resolveFileVars(raw));
  const parsed = schema.safeParse(resolved);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return ok(parsed.data);
}

function loadOrThrow(): Env {
  const result = parseEnv(process.env);
  if (!result.ok) {
    throw new Error(`Invalid environment: ${result.error}`);
  }
  return result.value;
}

export const env: Env = loadOrThrow();
