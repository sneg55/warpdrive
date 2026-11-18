import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { describe, expect, test } from "vitest";
import { verifyGoogleIdToken } from "./verifyGoogleIdToken";

async function jwkFor(publicKey: CryptoKey): Promise<JWK> {
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.kid = "key1";
  return jwk;
}

function getKeyFor(jwk: JWK): ReturnType<typeof createLocalJWKSet> {
  return createLocalJWKSet({ keys: [jwk] });
}

async function makeSignedToken(
  privateKey: CryptoKey,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return new SignJWT({
    email: "alice@example.com",
    email_verified: true,
    hd: "example.com",
    sub: "1234567890",
    name: "Alice",
    nonce: "testnonce",
    aud: "test-client-id",
    iss: "https://accounts.google.com",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "key1" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

describe("verifyGoogleIdToken", () => {
  test("accepts a token signed with the correct key", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { aud: "test-client-id" });

    const result = await verifyGoogleIdToken(token, {
      getKey: getKeyFor(await jwkFor(publicKey)),
      clientId: "test-client-id",
      nonce: "testnonce",
      workspaceDomain: "example.com",
      signal: AbortSignal.timeout(5000),
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.email).toBe("alice@example.com");
    }
  });

  test("REJECTS a token signed with the WRONG key", async () => {
    const { privateKey: signingKey } = await generateKeyPair("RS256");
    const { publicKey: differentPublicKey } = await generateKeyPair("RS256");

    const token = await makeSignedToken(signingKey, { aud: "test-client-id" });

    const result = await verifyGoogleIdToken(token, {
      getKey: getKeyFor(await jwkFor(differentPublicKey)),
      clientId: "test-client-id",
      nonce: "testnonce",
      workspaceDomain: "example.com",
      signal: AbortSignal.timeout(5000),
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toBe("rejected");
    }
  });

  test("REJECTS a token with the wrong nonce", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, {
      aud: "test-client-id",
      nonce: "correctnonce",
    });

    const result = await verifyGoogleIdToken(token, {
      getKey: getKeyFor(await jwkFor(publicKey)),
      clientId: "test-client-id",
      nonce: "wrongnonce",
      workspaceDomain: "example.com",
      signal: AbortSignal.timeout(5000),
    });

    expect(result.ok).toBe(false);
  });

  test("REJECTS a token for a different workspace domain", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, {
      aud: "test-client-id",
      hd: "otherdomain.com",
    });

    const result = await verifyGoogleIdToken(token, {
      getKey: getKeyFor(await jwkFor(publicKey)),
      clientId: "test-client-id",
      nonce: "testnonce",
      workspaceDomain: "example.com",
      signal: AbortSignal.timeout(5000),
    });

    expect(result.ok).toBe(false);
  });

  test("REJECTS a token with the wrong audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { aud: "other-client-id" });

    const result = await verifyGoogleIdToken(token, {
      getKey: getKeyFor(await jwkFor(publicKey)),
      clientId: "test-client-id",
      nonce: "testnonce",
      workspaceDomain: "example.com",
      signal: AbortSignal.timeout(5000),
    });

    expect(result.ok).toBe(false);
  });

  test.each([
    ["email_verified is false", { email_verified: false }],
    ["hd is missing", { hd: undefined }],
    ["hd is a look-alike suffix domain", { hd: "evil-example.com" }],
  ])("REJECTS a correctly signed token when %s", async (_label, overrides) => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, overrides);

    const result = await verifyGoogleIdToken(token, {
      getKey: getKeyFor(await jwkFor(publicKey)),
      clientId: "test-client-id",
      nonce: "testnonce",
      workspaceDomain: "example.com",
      signal: AbortSignal.timeout(5000),
    });

    expect(result).toEqual({ ok: false, error: "rejected" });
  });
});
