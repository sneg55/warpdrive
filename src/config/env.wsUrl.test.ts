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
  MCP_ENABLED: "false",
} as NodeJS.ProcessEnv;

describe("browser WebSocket URL", () => {
  test("is read from NEXT_PUBLIC_WS_URL at runtime", () => {
    const result = parseEnv({ ...base, NEXT_PUBLIC_WS_URL: "wss://crm.example.com/_ws" });
    expect(result.ok && result.value.NEXT_PUBLIC_WS_URL).toBe("wss://crm.example.com/_ws");
  });

  test("is empty when unset, which leaves realtime off", () => {
    const result = parseEnv(base);
    expect(result.ok && result.value.NEXT_PUBLIC_WS_URL).toBe("");
  });

  test("rejects a value that is not a URL", () => {
    expect(parseEnv({ ...base, NEXT_PUBLIC_WS_URL: "not a url" }).ok).toBe(false);
  });
});
