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
  MINIO_ENDPOINT: "https://s3.example.com",
  MINIO_ACCESS_KEY: "x",
  MINIO_SECRET_KEY: "x",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
} as NodeJS.ProcessEnv;

describe("MCP env", () => {
  test("MCP_ENABLED defaults true and OAUTH_SIGNING_KEY validates 32-byte base64", () => {
    const result = parseEnv({
      ...base,
      OAUTH_SIGNING_KEY: Buffer.alloc(32).toString("base64"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.MCP_ENABLED).toBe(true);
      expect(result.value.OAUTH_SIGNING_KEY.length).toBeGreaterThan(0);
    }
  });

  test("rejects a non-32-byte signing key when MCP enabled", () => {
    const result = parseEnv({
      ...base,
      MCP_ENABLED: "true",
      OAUTH_SIGNING_KEY: "short",
    });
    expect(result.ok).toBe(false);
  });
});
