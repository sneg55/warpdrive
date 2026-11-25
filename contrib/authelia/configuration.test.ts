import { spawnSync } from "node:child_process";
import { pbkdf2Sync, X509Certificate } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const ROOT = new URL("./", import.meta.url);
const ROOT_DIR = fileURLToPath(ROOT);
const read = (name: string): string => readFileSync(new URL(name, ROOT), "utf8");

const configuration = read("configuration.yml");
const users = read("users_database.yml");
const compose = read("../../docker-compose.dev.yml");

const DEV_PASSWORD = "warpdrive-dev";
const ISSUER = "https://authelia.localhost:9091";
const GENERATED = "/config/generated";
const GENERATED_FILES = [
  "ca.crt",
  "authelia.crt",
  "authelia.key",
  "authelia-chain.crt",
  "oidc_jwks.pem",
  "session_secret",
  "storage_encryption_key",
  "oidc_hmac_secret",
  "oidc_client_secret",
  "oidc_client_secret_digest",
] as const;

const hasAuthelia = spawnSync("authelia", ["--version"]).status === 0;

function adaptedBase64Decode(value: string): Buffer {
  const padded = value
    .replace(/\./g, "+")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function committedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...committedFiles(full));
    else if (!entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("authelia configuration loads on 4.39", () => {
  test("uses no configuration keys that 4.39 rejects or has retired", () => {
    expect(configuration).not.toMatch(/^duo:/m);
    expect(configuration).not.toMatch(/^ {2}issuer_private_key:/m);
    expect(configuration).not.toMatch(/^default_redirection_url:/m);
  });

  test("disables password reset so no reset jwt secret is required", () => {
    expect(configuration).toMatch(
      /authentication_backend:\n {2}password_reset:\n {4}disable: true/,
    );
  });

  test("does not redefine the standard groups scope", () => {
    expect(configuration).not.toMatch(/scopes:\n\s+groups:\n/);
  });

  test("signs with a jwks entry rather than the retired issuer_private_key", () => {
    expect(configuration).toMatch(
      /jwks:\n\s+- key_id: .+\n\s+algorithm: RS256\n\s+use: sig\n\s+key: \{\{ secret /,
    );
  });
});

describe("no secret material is committed", () => {
  test("no committed authelia file holds a private key, a 64 character hex secret or a pbkdf2 digest", () => {
    for (const file of committedFiles(ROOT_DIR)) {
      const text = readFileSync(file, "utf8");
      const where = path.relative(ROOT_DIR, file);
      expect(text, where).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
      expect(text, where).not.toMatch(/\b[0-9a-f]{64}\b/);
      expect(text, where).not.toMatch(/\$pbkdf2-/);
    }
  });

  test("the gitleaks config exempts only the git-ignored generated directory", () => {
    const config = readFileSync(new URL("../../.gitleaks.toml", ROOT), "utf8");
    const exemptions = [...config.matchAll(/^paths = \[(.+)\]$/gm)].map((m) => m[1]);
    expect(exemptions).toEqual(["'''contrib/authelia/generated/'''"]);
  });

  test("the old committed certificate directory is gone", () => {
    expect(existsSync(new URL("certs", ROOT))).toBe(false);
  });

  test("the generated directory exists in a checkout and ignores everything but its own ignore file", () => {
    expect(read("generated/.gitignore").trim().split("\n")).toEqual(["*", "!.gitignore"]);
  });

  test.each([
    ["session secret", `\n  secret: '{{ secret "${GENERATED}/session_secret" }}'`],
    [
      "storage encryption key",
      `\n  encryption_key: '{{ secret "${GENERATED}/storage_encryption_key" }}'`,
    ],
    ["oidc hmac secret", `hmac_secret: '{{ secret "${GENERATED}/oidc_hmac_secret" }}'`],
    [
      "jwks private key",
      `key: {{ secret "${GENERATED}/oidc_jwks.pem" | mindent 10 "|" | msquote }}`,
    ],
    [
      "oidc client secret digest",
      `client_secret: '{{ secret "${GENERATED}/oidc_client_secret_digest" }}'`,
    ],
  ])("reads the %s from the generated directory", (_name, expected) => {
    expect(configuration).toContain(expected);
  });
});

describe("session and issuer", () => {
  test("uses a secure authelia_url the cookie domain covers", () => {
    expect(configuration).toContain(`authelia_url: ${ISSUER}`);
    expect(configuration).toMatch(/domain: authelia\.localhost/);
    expect(new URL(ISSUER).protocol).toBe("https:");
  });

  test("serves the issuer over tls with the generated certificate files", () => {
    expect(configuration).toContain(`certificate: ${GENERATED}/authelia-chain.crt`);
    expect(configuration).toContain(`key: ${GENERATED}/authelia.key`);
  });

  test("compose points the app at the same issuer", () => {
    expect(compose).toContain(`OIDC_ISSUER_URL: ${ISSUER}`);
  });
});

describe("oidc client", () => {
  test("requests the standard groups scope and emits groups in the id token", () => {
    expect(configuration).toMatch(/scopes:\n\s+- openid\n\s+- email\n\s+- profile\n\s+- groups/);
    expect(configuration).toMatch(/claims_policies:\n\s+warpdrive:\n\s+id_token:/);
    expect(configuration).toContain("claims_policy: warpdrive");
  });

  test("the claims policy lists every claim the app reads, because setting one suppresses the defaults", () => {
    const policy =
      configuration.match(/claims_policies:\n\s+warpdrive:\n\s+id_token:\n((?:\s+- .+\n)+)/)?.[1] ??
      "";
    for (const claim of ["email", "email_verified", "name", "preferred_username", "groups"]) {
      expect(policy).toContain(`- ${claim}`);
    }
  });

  test("skips the consent screen so the dev flow lands straight back on the callback", () => {
    expect(configuration).toContain("consent_mode: implicit");
  });

  test("redirects back to the route the app serves", () => {
    expect(configuration).toContain("http://localhost:3000/auth/callback/oidc");
  });

  test("requires pkce and authenticates with client_secret_basic, as the app does", () => {
    expect(configuration).toContain("require_pkce: true");
    expect(configuration).toContain("token_endpoint_auth_method: client_secret_basic");
  });
});

describe("dev users", () => {
  test("allowed users sit in the allowed group", () => {
    for (const email of ["admin@example.com", "colleague@example.com"]) {
      const block = users.split(`${email}:`)[1] ?? "";
      expect(block).toContain("warpdrive-users");
    }
  });

  test("the outsider is a valid login that the app will reject", () => {
    const block = users.split("outsider@example.com:")[1] ?? "";
    expect(block).toContain("other-team");
    expect(block).not.toContain("warpdrive-users");
  });

  test("every password is an argon2id digest of the documented dev password", () => {
    const digests = [...users.matchAll(/password: '(\$argon2id\$[^']+)'/g)].map((m) => m[1] ?? "");
    expect(digests.length).toBe(3);
    for (const digest of digests) {
      expect(digest.startsWith("$argon2id$v=19$m=65536,t=3,p=4$")).toBe(true);
    }
    expect(DEV_PASSWORD.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasAuthelia)("generate.sh with the authelia binary", () => {
  const work = mkdtempSync(path.join(tmpdir(), "authelia-generate-"));
  const out = path.join(work, "generated");
  const script = path.join(ROOT_DIR, "generate.sh");
  const generated = (name: string): string => readFileSync(path.join(out, name), "utf8");

  function generate(): ReturnType<typeof spawnSync> {
    return spawnSync("sh", [script, out], { encoding: "utf8" });
  }

  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  test("writes every file the configuration and the app read", () => {
    const run = generate();
    expect(run.status, String(run.stderr)).toBe(0);
    for (const name of GENERATED_FILES) {
      expect(statSync(path.join(out, name)).size, name).toBeGreaterThan(0);
    }
  });

  test("the ca is a ca and the leaf is issued by it for the issuer hostname", () => {
    const ca = new X509Certificate(generated("ca.crt"));
    const leaf = new X509Certificate(generated("authelia.crt"));
    expect(ca.ca).toBe(true);
    expect(leaf.subjectAltName).toBe("DNS:authelia.localhost");
    expect(leaf.checkIssued(ca)).toBe(true);
    expect(leaf.verify(ca.publicKey)).toBe(true);
    expect(new Date(leaf.validTo).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(ca.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  test("the chain serves the leaf followed by the ca", () => {
    const pems = generated("authelia-chain.crt").match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    );
    expect(pems).toHaveLength(2);
    const [first, second] = (pems ?? []).map((pem) => new X509Certificate(pem));
    expect(first?.raw.equals(new X509Certificate(generated("authelia.crt")).raw)).toBe(true);
    expect(second?.raw.equals(new X509Certificate(generated("ca.crt")).raw)).toBe(true);
  });

  test("the secrets are distinct random 64 character hex values", () => {
    const secrets = [
      "session_secret",
      "storage_encryption_key",
      "oidc_hmac_secret",
      "oidc_client_secret",
    ].map(generated);
    for (const secret of secrets) expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(secrets).size).toBe(secrets.length);
  });

  test("the client secret digest verifies against the secret the app sends", () => {
    const encoded = generated("oidc_client_secret_digest");
    expect(encoded).toMatch(/^\$pbkdf2-sha512\$\d+\$[^$]+\$[^$]+$/);
    const [, , iterations, salt, key] = encoded.split("$");
    const recomputed = pbkdf2Sync(
      generated("oidc_client_secret"),
      adaptedBase64Decode(salt ?? ""),
      Number(iterations),
      64,
      "sha512",
    );
    expect(recomputed.equals(adaptedBase64Decode(key ?? ""))).toBe(true);
  });

  test("private keys are private and what the app reads is readable", () => {
    for (const name of ["authelia.key", "oidc_jwks.pem"]) {
      expect(statSync(path.join(out, name)).mode & 0o077, name).toBe(0);
      expect(generated(name)).toContain("PRIVATE KEY");
    }
    for (const name of ["ca.crt", "oidc_client_secret"]) {
      expect(statSync(path.join(out, name)).mode & 0o004, name).toBe(0o004);
    }
  });

  test("a second run keeps the existing material", () => {
    const before = GENERATED_FILES.map(generated);
    const run = generate();
    expect(run.status, String(run.stderr)).toBe(0);
    expect(GENERATED_FILES.map(generated)).toEqual(before);
  });

  test("an incomplete set is regenerated in full", () => {
    rmSync(path.join(out, "oidc_hmac_secret"));
    const before = generated("session_secret");
    const run = generate();
    expect(run.status, String(run.stderr)).toBe(0);
    expect(generated("oidc_hmac_secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(generated("session_secret")).not.toBe(before);
  });

  test("authelia accepts the committed configuration with the generated files and reports nothing about secrets", () => {
    const resolved = configuration.replaceAll("/config/generated", out);
    const file = path.join(work, "configuration.yml");
    writeFileSync(file, resolved);
    writeFileSync(path.join(work, "users_database.yml"), users);
    const withPaths = readFileSync(file, "utf8").replaceAll("/config/", `${work}/`);
    writeFileSync(file, withPaths);
    const run = spawnSync(
      "authelia",
      ["validate-config", "--config", file, "--config.experimental.filters", "template"],
      { encoding: "utf8" },
    );
    const output = `${run.stdout}${run.stderr}`;
    expect(run.status, output).toBe(0);
    expect(output).not.toContain("with errors");
    expect(output).not.toMatch(/plaintext/i);
  });
});
