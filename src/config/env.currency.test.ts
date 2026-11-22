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

function currencyOf(value: string | undefined): string | undefined {
  const result = parseEnv({ ...base, BASE_CURRENCY: value });
  return result.ok ? result.value.BASE_CURRENCY : undefined;
}

describe("BASE_CURRENCY env", () => {
  test("defaults to USD", () => {
    expect(currencyOf(undefined)).toBe("USD");
  });

  test("accepts an ISO 4217 code", () => {
    expect(currencyOf("EUR")).toBe("EUR");
  });

  test("normalizes a lowercase code to uppercase", () => {
    expect(currencyOf("gbp")).toBe("GBP");
  });

  test("rejects a three-character value that is not letters, which would crash money rendering", () => {
    expect(parseEnv({ ...base, BASE_CURRENCY: "123" }).ok).toBe(false);
  });

  test("rejects a value of the wrong length", () => {
    expect(parseEnv({ ...base, BASE_CURRENCY: "EURO" }).ok).toBe(false);
  });
});
