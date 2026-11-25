import { describe, expect, test } from "vitest";
import { parseEnv } from "./env";

const BASE = {
  BASE_URL: "https://app.example.com",
  DATABASE_URL: "postgres://u:p@localhost:5432/wd",
  WS_TICKET_SECRET: "test-ws-ticket-secret-at-least-32-bytes!!",
  WS_PUBLIC_URL: "wss://app.example.com/ws",
  S3_ENDPOINT: "http://garage:3900",
  S3_ACCESS_KEY: "a",
  S3_SECRET_KEY: "b",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  OAUTH_SIGNING_KEY: Buffer.alloc(32, 2).toString("base64"),
  SEED_ADMIN_EMAIL: "admin@example.com",
} as Record<string, string>;

function raw(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...BASE, ...overrides } as NodeJS.ProcessEnv;
}

describe("sign-in provider configuration", () => {
  test("parses with no providers configured outside production", () => {
    const result = parseEnv(raw({}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.googleSigninEnabled).toBe(false);
      expect(result.value.oidcEnabled).toBe(false);
    }
  });

  test("derives google sign-in enabled from the presence of a client id", () => {
    const result = parseEnv(
      raw({
        GOOGLE_OAUTH_CLIENT_ID: "cid",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        GOOGLE_WORKSPACE_DOMAIN: "example.com",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.googleSigninEnabled).toBe(true);
  });

  test("treats an empty GOOGLE_SIGNIN_ENABLED as unset", () => {
    const result = parseEnv(raw({ GOOGLE_SIGNIN_ENABLED: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.googleSigninEnabled).toBe(false);
  });

  test("an empty GOOGLE_SIGNIN_ENABLED still defers to the client id", () => {
    const result = parseEnv(
      raw({
        GOOGLE_SIGNIN_ENABLED: "",
        GOOGLE_OAUTH_CLIENT_ID: "cid",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        GOOGLE_WORKSPACE_DOMAIN: "example.com",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.googleSigninEnabled).toBe(true);
  });

  test("rejects a client id without secret or workspace domain", () => {
    const result = parseEnv(raw({ GOOGLE_OAUTH_CLIENT_ID: "cid" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("GOOGLE_OAUTH_CLIENT_SECRET");
      expect(result.error).toContain("GOOGLE_WORKSPACE_DOMAIN");
    }
  });

  test("rejects a google secret without the client id and workspace domain", () => {
    const result = parseEnv(raw({ GOOGLE_OAUTH_CLIENT_SECRET: "secret" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("GOOGLE_OAUTH_CLIENT_ID");
      expect(result.error).toContain("GOOGLE_WORKSPACE_DOMAIN");
    }
  });

  test("rejects a google workspace domain without the client id and secret", () => {
    const result = parseEnv(raw({ GOOGLE_WORKSPACE_DOMAIN: "example.com" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("GOOGLE_OAUTH_CLIENT_ID");
      expect(result.error).toContain("GOOGLE_OAUTH_CLIENT_SECRET");
    }
  });

  test("rejects a partial google set even when google sign-in is disabled", () => {
    const result = parseEnv(
      raw({ GOOGLE_SIGNIN_ENABLED: "false", GOOGLE_OAUTH_CLIENT_SECRET: "secret" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("GOOGLE_OAUTH_CLIENT_ID");
      expect(result.error).toContain("GOOGLE_WORKSPACE_DOMAIN");
    }
  });

  test("reports google as configured when the full set is present", () => {
    const result = parseEnv(
      raw({
        GOOGLE_SIGNIN_ENABLED: "false",
        GOOGLE_OAUTH_CLIENT_ID: "cid",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        GOOGLE_WORKSPACE_DOMAIN: "example.com",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.googleConfigured).toBe(true);
      expect(result.value.googleSigninEnabled).toBe(false);
    }
  });

  test("reports google as not configured when no google value is present", () => {
    const result = parseEnv(raw({}));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.googleConfigured).toBe(false);
  });

  test("rejects GOOGLE_SIGNIN_ENABLED=true without the google credentials", () => {
    const result = parseEnv(raw({ GOOGLE_SIGNIN_ENABLED: "true" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("GOOGLE_OAUTH_CLIENT_ID");
  });

  test("GOOGLE_SIGNIN_ENABLED=false allows a gmail-only client id", () => {
    const result = parseEnv(
      raw({
        GOOGLE_SIGNIN_ENABLED: "false",
        GOOGLE_OAUTH_CLIENT_ID: "cid",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        GOOGLE_WORKSPACE_DOMAIN: "example.com",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.googleSigninEnabled).toBe(false);
  });

  test("enables oidc when the issuer is fully configured", () => {
    const result = parseEnv(
      raw({
        OIDC_ISSUER_URL: "http://authelia.localhost:9091",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
        OIDC_ALLOWED_GROUPS: "warpdrive-users",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.oidcEnabled).toBe(true);
  });

  test("normalizes a trailing slash on the oidc issuer", () => {
    const result = parseEnv(
      raw({
        OIDC_ISSUER_URL: "http://authelia.localhost:9091/",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
        OIDC_ALLOWED_GROUPS: "warpdrive-users",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.OIDC_ISSUER_URL).toBe("http://authelia.localhost:9091");
  });

  test("normalizes repeated trailing slashes on the oidc issuer", () => {
    const result = parseEnv(
      raw({
        OIDC_ISSUER_URL: "http://authelia.localhost:9091//",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
        OIDC_ALLOWED_GROUPS: "warpdrive-users",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.OIDC_ISSUER_URL).toBe("http://authelia.localhost:9091");
  });

  test("strips only the trailing slash from an issuer with a path", () => {
    const result = parseEnv(
      raw({
        OIDC_ISSUER_URL: "https://auth.example.com/realms/warpdrive/",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
        OIDC_ALLOWED_GROUPS: "warpdrive-users",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.OIDC_ISSUER_URL).toBe("https://auth.example.com/realms/warpdrive");
    }
  });

  test("leaves an issuer without a trailing slash unchanged", () => {
    const result = parseEnv(
      raw({
        OIDC_ISSUER_URL: "http://authelia.localhost:9091",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
        OIDC_ALLOWED_GROUPS: "warpdrive-users",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.OIDC_ISSUER_URL).toBe("http://authelia.localhost:9091");
  });

  test("fails closed when OIDC groups are missing", () => {
    const result = parseEnv(
      raw({
        OIDC_ISSUER_URL: "http://authelia.localhost:9091",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("OIDC_ALLOWED_GROUPS");
  });

  test("rejects oidc credentials without an issuer", () => {
    const result = parseEnv(raw({ OIDC_CLIENT_ID: "warpdrive", OIDC_CLIENT_SECRET: "s" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("OIDC_ISSUER_URL");
  });

  test("production requires at least one sign-in provider", () => {
    const result = parseEnv(raw({ NODE_ENV: "production" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("sign-in provider");
  });

  test("production passes with oidc only", () => {
    const result = parseEnv(
      raw({
        NODE_ENV: "production",
        OIDC_ISSUER_URL: "http://authelia.localhost:9091",
        OIDC_CLIENT_ID: "warpdrive",
        OIDC_CLIENT_SECRET: "oidc-secret",
        OIDC_ALLOWED_GROUPS: "warpdrive-users",
      }),
    );
    expect(result.ok).toBe(true);
  });
});
