import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("Intercom env", () => {
  test("is off by default with the US region", () => {
    const result = parseEnv(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.INTERCOM_ACCESS_TOKEN).toBe("");
    expect(result.value.INTERCOM_REGION).toBe("us");
  });

  test("accepts the eu and au regions", () => {
    for (const region of ["eu", "au"]) {
      const result = parseEnv({ ...base, INTERCOM_ACCESS_TOKEN: "tok", INTERCOM_REGION: region });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.INTERCOM_REGION).toBe(region);
    }
  });

  test("rejects an unknown region instead of guessing a host", () => {
    expect(parseEnv({ ...base, INTERCOM_REGION: "apac" }).ok).toBe(false);
  });

  test("reads the token from a secret file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ic-"));
    const file = join(dir, "token");
    writeFileSync(file, "file-token\n");
    const result = parseEnv({ ...base, INTERCOM_ACCESS_TOKEN_FILE: file });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.INTERCOM_ACCESS_TOKEN).toBe("file-token");
  });
});
