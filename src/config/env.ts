import { readFileSync } from "node:fs";
import { z } from "zod";
import { err, ok, type Result } from "@/types/result";

const SECRET_FILE_VARS = [
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "OIDC_CLIENT_SECRET",
  "WS_TICKET_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "S3_SECRET_KEY",
  "MINIO_SECRET_KEY",
  "DATABASE_URL",
  "OAUTH_SIGNING_KEY",
  "INTERCOM_ACCESS_TOKEN",
  "BREVO_API_KEY",
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

const optionalBoolFromString = z.preprocess(
  (v) => (v === "" ? undefined : v),
  boolFromString.optional(),
);

const flagFromString = z.string().transform((v) => v === "true" || v === "1");

const optionalUrl = z
  .union([z.literal(""), z.string().url()])
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

const TRAILING_SLASHES = /\/+$/;

const oidcIssuerUrl = optionalUrl.transform((v) => v?.replace(TRAILING_SLASHES, ""));

const base = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GOOGLE_WORKSPACE_DOMAIN: z.string().default(""),
  GOOGLE_SIGNIN_ENABLED: optionalBoolFromString,
  OIDC_ISSUER_URL: oidcIssuerUrl,
  OIDC_CLIENT_ID: z.string().default(""),
  OIDC_CLIENT_SECRET: z.string().default(""),
  OIDC_ALLOWED_GROUPS: z.string().default(""),
  BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  WS_TICKET_SECRET: z.string().min(32),
  WS_PUBLIC_URL: z.string().min(1),
  NEXT_PUBLIC_WS_URL: z.union([z.literal(""), z.string().url()]).default(""),
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
  BASE_CURRENCY: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "must be a three-letter ISO 4217 currency code")
    .transform((v) => v.toUpperCase())
    .default("USD"),
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
  BREVO_API_KEY: z.string().default(""),
  X_CLIENT_ID: z.string().default(""),
  X_CLIENT_SECRET: z.string().default(""),
});

type BaseEnv = z.infer<typeof base>;
type IssueContext = z.RefinementCtx;

function requireWhenEmpty(v: BaseEnv, ctx: IssueContext, name: keyof BaseEnv): void {
  if (v[name] !== "") return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [name],
    message: `${name} is required for Google sign-in (or Gmail) or set GOOGLE_SIGNIN_ENABLED=false`,
  });
}

function googleSigninEnabled(v: BaseEnv): boolean {
  return v.GOOGLE_SIGNIN_ENABLED ?? v.GOOGLE_OAUTH_CLIENT_ID !== "";
}

function checkGoogleCredentials(v: BaseEnv, ctx: IssueContext): void {
  if (!googleSigninEnabled(v)) return;
  requireWhenEmpty(v, ctx, "GOOGLE_OAUTH_CLIENT_ID");
  requireWhenEmpty(v, ctx, "GOOGLE_OAUTH_CLIENT_SECRET");
  requireWhenEmpty(v, ctx, "GOOGLE_WORKSPACE_DOMAIN");
}

function checkOidcConfiguration(v: BaseEnv, ctx: IssueContext): void {
  if (v.OIDC_ISSUER_URL !== undefined) {
    for (const name of ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_ALLOWED_GROUPS"] as const) {
      if (v[name] === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} is required when OIDC_ISSUER_URL is set`,
        });
      }
    }
    return;
  }
  if (v.OIDC_CLIENT_ID === "" && v.OIDC_CLIENT_SECRET === "" && v.OIDC_ALLOWED_GROUPS === "")
    return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["OIDC_ISSUER_URL"],
    message: "OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_ALLOWED_GROUPS require OIDC_ISSUER_URL",
  });
}

const schema = base
  .superRefine((v, ctx) => {
    checkGoogleCredentials(v, ctx);
    checkOidcConfiguration(v, ctx);
    if (v.NODE_ENV === "production" && !googleSigninEnabled(v) && v.OIDC_ISSUER_URL === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NODE_ENV"],
        message: "at least one sign-in provider (Google or OIDC) must be configured",
      });
    }
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
  })
  .transform((v) => ({
    ...v,
    googleSigninEnabled: v.GOOGLE_SIGNIN_ENABLED ?? v.GOOGLE_OAUTH_CLIENT_ID !== "",
    oidcEnabled: v.OIDC_ISSUER_URL !== undefined,
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
