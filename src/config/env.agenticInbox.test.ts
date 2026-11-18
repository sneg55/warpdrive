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

function flag(value: string | undefined): boolean | undefined {
  const result = parseEnv(value === undefined ? base : { ...base, AGENTIC_INBOX_ENABLED: value });
  return result.ok ? result.value.AGENTIC_INBOX_ENABLED : undefined;
}

describe("AGENTIC_INBOX_ENABLED", () => {
  test("is false when unset or empty", () => {
    expect(flag(undefined)).toBe(false);
    expect(flag("")).toBe(false);
  });
  test("is true for true and 1", () => {
    expect(flag("true")).toBe(true);
    expect(flag("1")).toBe(true);
  });
  test("is false for anything else", () => {
    expect(flag("false")).toBe(false);
    expect(flag("yes")).toBe(false);
  });
});
