import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseEnv } from "./env";

const DEPLOYER_VALUES: Record<string, string> = {
  BASE_URL: "https://app.example.com",
  DATABASE_URL: "postgres://u:p@localhost:5432/wd",
  WS_TICKET_SECRET: "x".repeat(40),
  WS_PUBLIC_URL: "wss://app.example.com/ws",
  S3_ENDPOINT: "https://s3.example.com",
  S3_ACCESS_KEY: "access",
  S3_SECRET_KEY: "secret",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  OAUTH_SIGNING_KEY: Buffer.alloc(32, 2).toString("base64"),
  SEED_ADMIN_EMAIL: "admin@example.com",
  GOOGLE_OAUTH_CLIENT_ID: "cid",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_WORKSPACE_DOMAIN: "example.com",
};

function templateVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(".env.example", "utf8").split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1] !== undefined) vars[match[1]] = match[2] ?? "";
  }
  return vars;
}

describe(".env.example against the env schema", () => {
  test("parses once the deployer supplies the required secrets", () => {
    const result = parseEnv({ ...templateVars(), ...DEPLOYER_VALUES } as NodeJS.ProcessEnv);
    expect(result.ok ? "ok" : result.error).toBe("ok");
  });

  test("an empty GOOGLE_SIGNIN_ENABLED in the template defers to the client id", () => {
    expect(templateVars().GOOGLE_SIGNIN_ENABLED).toBe("");
    const result = parseEnv({ ...templateVars(), ...DEPLOYER_VALUES } as NodeJS.ProcessEnv);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.googleSigninEnabled).toBe(true);
  });
});
