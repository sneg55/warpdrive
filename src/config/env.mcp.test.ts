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

// RFC 7591 dynamic registration is what lets an MCP client self-onboard without an admin
// pre-provisioning it, so it stays open by default or every existing deploy breaks on upgrade.
// But an open registration endpoint means any stranger can mint a client whose name the consent
// screen then shows to a user, which is the setup for consent phishing. A deploy that has
// already connected the clients it needs should be able to shut the door.
describe("OAUTH_REGISTRATION", () => {
  const withKey = { ...base, OAUTH_SIGNING_KEY: Buffer.alloc(32).toString("base64") };

  test("defaults to open so existing MCP clients keep working after upgrade", () => {
    const result = parseEnv(withKey);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.OAUTH_REGISTRATION).toBe("open");
  });

  test("accepts disabled", () => {
    const result = parseEnv({ ...withKey, OAUTH_REGISTRATION: "disabled" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.OAUTH_REGISTRATION).toBe("disabled");
  });

  test("rejects a typo rather than silently falling back to open", () => {
    expect(parseEnv({ ...withKey, OAUTH_REGISTRATION: "off" }).ok).toBe(false);
  });
});
