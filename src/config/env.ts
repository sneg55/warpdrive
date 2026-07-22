import { readFileSync } from "node:fs";
import { z } from "zod";
import { err, ok, type Result } from "@/types/result";

// Secret vars may be supplied as <VAR>_FILE pointing at a Docker secret file.
const SECRET_FILE_VARS = [
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "WS_TICKET_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "MINIO_SECRET_KEY",
  "DATABASE_URL",
  "OAUTH_SIGNING_KEY",
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

const boolFromString = z.enum(["true", "false"]).transform((v) => v === "true");

const base = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),
  BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  WS_TICKET_SECRET: z.string().min(32),
  WS_PUBLIC_URL: z.string().min(1),
  // Full URL, not a bare hostname: buildMinioClient does new URL(MINIO_ENDPOINT), and the
  // browser POSTs uploads directly to the presigned host, so it must be publicly reachable
  // (e.g. https://s3.example.com), never an internal-only compose alias like "minio".
  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1).default("warpdrive"),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(26_214_400),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be base64 of exactly 32 bytes"),
  MCP_ENABLED: boolFromString.default(true),
  OAUTH_SIGNING_KEY: z.string().default(""),
  BASE_CURRENCY: z.string().length(3).default("USD"),
  SEED_ADMIN_EMAIL: z.string().email().or(z.literal("")).default(""),
  ALLOW_FIRST_LOGIN_ADMIN: boolFromString.default(false),
  // Optional build-time stamp of the running version (e.g. a release tag). Empty when unstamped;
  // the release feature then falls back to package.json, then "dev". See resolveVersion.
  APP_VERSION: z.string().default(""),
  // Client PostHog config is passed to the browser via the server layout (props), not
  // NEXT_PUBLIC vars, so this stays the single env boundary. Empty key disables telemetry.
  POSTHOG_KEY: z.string().default(""),
  POSTHOG_HOST: z.string().default(""),
  DISABLE_TELEMETRY: boolFromString.default(false),
  // Console.warn/error forwarding is off by default (widens the event surface); opt in per deploy.
  TELEMETRY_CONSOLE_FORWARDING: boolFromString.default(false),
  // Git SHA of the running build, for regression attribution alongside APP_VERSION.
  APP_COMMIT: z.string().default(""),
  // Kill switch for the GitHub update-check banner. A hosted/managed deployment sets this true;
  // OSS self-hosters leave it false to get the banner.
  DISABLE_UPDATE_CHECK: boolFromString.default(false),
});

// Production guardrails for the first-run bootstrap (ops spec E6).
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
});

// Named export of the full validated schema (with production guardrails) so
// boundary tests can parse a candidate env map directly.
export const envSchema = schema;

export type Env = z.infer<typeof base>;

// Pure, testable: validates a given source map without touching the global env.
export function parseEnv(raw: NodeJS.ProcessEnv): Result<Env, string> {
  const resolved = resolveFileVars(raw);
  const parsed = schema.safeParse(resolved);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return ok(parsed.data);
}

function loadOrThrow(): Env {
  const result = parseEnv(process.env);
  if (!result.ok) {
    // Fail fast at import time so misconfiguration is a boot error, not a first-use error.
    throw new Error(`Invalid environment: ${result.error}`);
  }
  return result.value;
}

export const env: Env = loadOrThrow();
