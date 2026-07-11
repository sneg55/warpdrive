import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const REQUIRED = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_WORKSPACE_DOMAIN",
  "BASE_URL",
  "DATABASE_URL",
  "WS_TICKET_SECRET",
  "WS_PUBLIC_URL",
  "MINIO_ENDPOINT",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
  "MAX_FILE_BYTES",
  "TOKEN_ENCRYPTION_KEY",
  "BASE_CURRENCY",
  "SEED_ADMIN_EMAIL",
  "ALLOW_FIRST_LOGIN_ADMIN",
];

describe(".env.example", () => {
  const text = readFileSync(".env.example", "utf8");
  test("lists every required key", () => {
    for (const key of REQUIRED) expect(text, `missing ${key}`).toContain(`${key}=`);
  });
  test("contains no real secret values (keys are empty or placeholder)", () => {
    const secretLine = text.split("\n").find((l) => l.startsWith("TOKEN_ENCRYPTION_KEY="));
    expect(secretLine).toBe("TOKEN_ENCRYPTION_KEY=");
  });
});
