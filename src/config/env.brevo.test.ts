import { describe, expect, test } from "vitest";
import { parseEnv } from "./env";

const base = {
  NODE_ENV: "test",
  GOOGLE_OAUTH_CLIENT_ID: "x",
  GOOGLE_OAUTH_CLIENT_SECRET: "x",
  GOOGLE_WORKSPACE_DOMAIN: "example.com",
  BASE_URL: "https://app.example.com",
  DATABASE_URL: "postgres://localhost/x",
  WS_TICKET_SECRET: "a".repeat(32),
  WS_PUBLIC_URL: "ws://ws:8080",
  S3_ENDPOINT: "https://s3.example.com",
  S3_ACCESS_KEY: "x",
  S3_SECRET_KEY: "x",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  OAUTH_SIGNING_KEY: Buffer.alloc(32).toString("base64"),
} as NodeJS.ProcessEnv;

describe("Brevo env", () => {
  test("is off by default", () => {
    const result = parseEnv(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.BREVO_API_KEY).toBe("");
  });

  test("reads the key", () => {
    const result = parseEnv({ ...base, BREVO_API_KEY: "k" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.BREVO_API_KEY).toBe("k");
  });
});
