import { describe, expect, it } from "vitest";
import { z } from "zod";
import { envSchema } from "./env";

// Complete required-key base (the schema also requires the WS keys, which the
// Phase-4 brief's sample omitted; included here so failures are attributable to
// the assertion under test, not a missing unrelated key).
const base = {
  GOOGLE_OAUTH_CLIENT_ID: "cid",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_WORKSPACE_DOMAIN: "gunsnation.com",
  BASE_URL: "https://crm.example.com",
  DATABASE_URL: "postgres://u:p@h:5432/db",
  WS_TICKET_SECRET: "x".repeat(32),
  WS_PUBLIC_URL: "ws://localhost:8080",
  S3_ENDPOINT: "http://garage:3900",
  S3_ACCESS_KEY: "ak",
  S3_SECRET_KEY: "sk",
  S3_BUCKET: "warpdrive",
  MAX_FILE_BYTES: "26214400",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  OAUTH_SIGNING_KEY: Buffer.alloc(32, 8).toString("base64"),
};

describe("env schema (email/storage keys)", () => {
  it("coerces MAX_FILE_BYTES to a number", () => {
    const parsed = envSchema.parse(base);
    expect(parsed.MAX_FILE_BYTES).toBe(26_214_400);
  });

  it("rejects a TOKEN_ENCRYPTION_KEY that is not 32 bytes", () => {
    const bad = { ...base, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") };
    expect(() => envSchema.parse(bad)).toThrow(z.ZodError);
  });
});
