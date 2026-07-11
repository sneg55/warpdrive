import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseEnv } from "./env";

describe("env boundary", () => {
  test("loads a valid env from process.env (vitest.setup defaults)", async () => {
    const { env } = await import("./env");
    expect(env.BASE_URL).toBe("https://app.example.com");
    expect(env.GOOGLE_WORKSPACE_DOMAIN).toBe("example.com");
    expect(env.ALLOW_FIRST_LOGIN_ADMIN).toBe(false);
    expect(Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64")).toHaveLength(32);
  });

  test("rejects production with no SEED_ADMIN_EMAIL and no dev flag", () => {
    const result = parseEnv({
      ...process.env,
      NODE_ENV: "production",
      SEED_ADMIN_EMAIL: "",
      ALLOW_FIRST_LOGIN_ADMIN: "false",
    });
    expect(result.ok).toBe(false);
  });

  test("rejects ALLOW_FIRST_LOGIN_ADMIN=true in production", () => {
    const result = parseEnv({
      ...process.env,
      NODE_ENV: "production",
      SEED_ADMIN_EMAIL: "admin@example.com",
      ALLOW_FIRST_LOGIN_ADMIN: "true",
    });
    expect(result.ok).toBe(false);
  });

  test("accepts production with SEED_ADMIN_EMAIL and dev flag false", () => {
    const result = parseEnv({
      ...process.env,
      NODE_ENV: "production",
      SEED_ADMIN_EMAIL: "admin@example.com",
      ALLOW_FIRST_LOGIN_ADMIN: "false",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects a bare-hostname MINIO_ENDPOINT that is not a parseable URL", () => {
    // Regression: the prod deploy prescribed MINIO_ENDPOINT=minio, which passes a min(1)
    // check but throws "Invalid URL" in buildMinioClient (new URL(endpoint)) on the FIRST
    // storage call, surfacing as a generic "Something went wrong" at import upload. The
    // browser also has to reach this host directly, so it must be a full public URL.
    const result = parseEnv({ ...process.env, MINIO_ENDPOINT: "minio" });
    expect(result.ok).toBe(false);
  });

  test("accepts a full-URL MINIO_ENDPOINT", () => {
    const result = parseEnv({ ...process.env, MINIO_ENDPOINT: "https://s3.example.com" });
    expect(result.ok).toBe(true);
  });

  describe("Docker secret <VAR>_FILE resolution", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "warpdrive-secret-"));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    test("TOKEN_ENCRYPTION_KEY_FILE contents take preference over the plain var", () => {
      // Two DISTINCT valid 32-byte base64 keys: byte-0 vs byte-9 fill.
      // The file holds keyFromFile, the plain var holds keyFromPlain.
      // If resolveFileVars works, the parsed value MUST equal keyFromFile.
      const keyFromFile = Buffer.alloc(32, 0).toString("base64");
      const keyFromPlain = Buffer.alloc(32, 9).toString("base64");
      expect(keyFromFile).not.toBe(keyFromPlain); // guard: assertion is not vacuous

      const filePath = join(dir, "token_encryption_key");
      // Trailing whitespace/newline must be trimmed by resolveFileVars.
      writeFileSync(filePath, `${keyFromFile}\n`, "utf8");

      const result = parseEnv({
        ...process.env,
        TOKEN_ENCRYPTION_KEY: keyFromPlain,
        TOKEN_ENCRYPTION_KEY_FILE: filePath,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return; // narrow for TypeScript
      expect(result.value.TOKEN_ENCRYPTION_KEY).toBe(keyFromFile);
      expect(result.value.TOKEN_ENCRYPTION_KEY).not.toBe(keyFromPlain);
    });
  });
});
