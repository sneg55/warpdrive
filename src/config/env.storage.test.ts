import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
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
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  MCP_ENABLED: "false",
} as NodeJS.ProcessEnv;

type EnvFragment = Record<string, string>;

const s3 = {
  S3_ENDPOINT: "https://s3.example.com",
  S3_ACCESS_KEY: "GKnew",
  S3_SECRET_KEY: "new-secret",
} satisfies EnvFragment;

const legacy = {
  MINIO_ENDPOINT: "https://legacy.example.com",
  MINIO_ACCESS_KEY: "old-access",
  MINIO_SECRET_KEY: "old-secret",
  MINIO_BUCKET: "old-bucket",
} satisfies EnvFragment;

function storageOf(raw: EnvFragment) {
  const result = parseEnv({ ...base, ...raw });
  if (!result.ok) throw new Error(result.error);
  const { S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION } = result.value;
  return { S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION };
}

describe("storage env", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  test("reads the S3_* names with bucket warpdrive and no region by default", () => {
    expect(storageOf(s3)).toEqual({
      S3_ENDPOINT: "https://s3.example.com",
      S3_ACCESS_KEY: "GKnew",
      S3_SECRET_KEY: "new-secret",
      S3_BUCKET: "warpdrive",
      S3_REGION: undefined,
    });
  });

  test("an empty S3_REGION leaves the region to bucket discovery", () => {
    expect(storageOf({ ...s3, S3_REGION: "" }).S3_REGION).toBeUndefined();
  });

  test("an install still on the MINIO_* names keeps booting with the same values", () => {
    expect(storageOf(legacy)).toEqual({
      S3_ENDPOINT: "https://legacy.example.com",
      S3_ACCESS_KEY: "old-access",
      S3_SECRET_KEY: "old-secret",
      S3_BUCKET: "old-bucket",
      S3_REGION: undefined,
    });
  });

  test("S3_* wins over MINIO_* when both are set", () => {
    expect(storageOf({ ...legacy, ...s3, S3_BUCKET: "new-bucket" })).toMatchObject({
      S3_ENDPOINT: "https://s3.example.com",
      S3_ACCESS_KEY: "GKnew",
      S3_BUCKET: "new-bucket",
    });
  });

  test("an empty S3_* value falls back to the MINIO_* value", () => {
    expect(storageOf({ ...legacy, S3_ENDPOINT: "" }).S3_ENDPOINT).toBe(
      "https://legacy.example.com",
    );
  });

  test("S3_REGION pins the signing region when set", () => {
    expect(storageOf({ ...s3, S3_REGION: "garage" }).S3_REGION).toBe("garage");
  });

  test("rejects a bare-hostname endpoint the browser could not reach", () => {
    expect(parseEnv({ ...base, ...s3, S3_ENDPOINT: "garage" }).ok).toBe(false);
  });

  test("fails when neither name supplies the storage keys", () => {
    expect(parseEnv({ ...base }).ok).toBe(false);
  });

  test.each([
    "S3_SECRET_KEY_FILE",
    "MINIO_SECRET_KEY_FILE",
  ])("reads the secret from %s", (fileVar) => {
    const dir = mkdtempSync(join(tmpdir(), "env-storage-"));
    dirs.push(dir);
    const path = join(dir, "secret");
    writeFileSync(path, "from-file\n");
    const withoutSecret = { S3_ENDPOINT: s3.S3_ENDPOINT, S3_ACCESS_KEY: s3.S3_ACCESS_KEY };
    expect(storageOf({ ...withoutSecret, [fileVar]: path }).S3_SECRET_KEY).toBe("from-file");
  });
});
