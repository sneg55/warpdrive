import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { beforeEach, describe, expect, test } from "vitest";
import {
  buildOidcAuthUrl,
  clearOidcConfigCache,
  discoveryUrl,
  fetchOidcConfig,
  type OidcProviderConfig,
  parseAllowedGroups,
  verifyOidcIdToken,
} from "./oidc";

const ISSUER = "http://authelia.localhost:9091";
const CLIENT_ID = "warpdrive";
const NONCE = "testnonce";

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
    sub: "authelia-user-1",
    nonce: NONCE,
    groups: ["warpdrive-users"],
    aud: CLIENT_ID,
    iss: ISSUER,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "key1" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function verify(
  token: string,
  getKey: ReturnType<typeof createLocalJWKSet>,
  overrides: { nonce?: string; allowedGroups?: string[]; issuer?: string } = {},
) {
  return verifyOidcIdToken(token, {
    getKey,
    clientId: CLIENT_ID,
    nonce: overrides.nonce ?? NONCE,
    issuer: overrides.issuer ?? ISSUER,
    allowedGroups: overrides.allowedGroups ?? ["warpdrive-users"],
    signal: AbortSignal.timeout(5000),
  });
}

describe("verifyOidcIdToken", () => {
  test("accepts a valid token and returns its identity claims", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, {
      name: "Alice",
      preferred_username: "alice",
      picture: "https://pics.example.com/alice.png",
    });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.email).toBe("alice@example.com");
      expect(result.value.sub).toBe("authelia-user-1");
      expect(result.value.name).toBe("Alice");
      expect(result.value.preferredUsername).toBe("alice");
      expect(result.value.avatarUrl).toBe("https://pics.example.com/alice.png");
      expect(result.value.groups).toEqual(["warpdrive-users"]);
    }
  });

  test("accepts a token whose issuer has a trailing slash", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { iss: `${ISSUER}/` });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(true);
  });

  test("accepts a token whose issuer lacks a trailing slash when configured with one", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey);

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)), {
      issuer: `${ISSUER}/`,
    });

    expect(result.ok).toBe(true);
  });

  test("rejects a token from a different issuer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { iss: "https://evil.example.com" });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(false);
  });

  test("maps absent name, username and picture claims to null", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { name: undefined });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.name).toBeNull();
      expect(result.value.preferredUsername).toBeNull();
      expect(result.value.avatarUrl).toBeNull();
    }
  });

  test("REJECTS a token signed with the WRONG key", async () => {
    const { privateKey: signingKey } = await generateKeyPair("RS256");
    const { publicKey: otherKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(signingKey);

    const result = await verify(token, getKeyFor(await jwkFor(otherKey)));

    expect(result.ok).toBe(false);
  });

  test("rejects an unverified email claim", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { email_verified: false });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(false);
  });

  test("rejects a nonce mismatch", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey);

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)), {
      nonce: "differentnonce",
    });

    expect(result.ok).toBe(false);
  });

  test("fails closed when the groups claim is missing", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { groups: undefined });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(false);
  });

  test("rejects when no group intersects the allow-list", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await makeSignedToken(privateKey, { groups: ["other-users"] });

    const result = await verify(token, getKeyFor(await jwkFor(publicKey)));

    expect(result.ok).toBe(false);
  });
});

describe("discovery and authorization url construction", () => {
  test("builds the well-known path under the issuer", () => {
    expect(discoveryUrl("http://idp.example.com:9091")).toBe(
      "http://idp.example.com:9091/.well-known/openid-configuration",
    );
  });

  test("normalizes a trailing slash on the issuer", () => {
    expect(discoveryUrl("http://idp.example.com:9091/")).toBe(
      "http://idp.example.com:9091/.well-known/openid-configuration",
    );
  });

  test("builds a PKCE authorization code request with the identity and groups scopes", () => {
    const config: OidcProviderConfig = {
      issuer: ISSUER,
      authorizationEndpoint: `${ISSUER}/api/oidc/authorization`,
      tokenEndpoint: `${ISSUER}/api/oidc/token`,
      jwksUri: `${ISSUER}/jwks.json`,
    };
    const url = new URL(
      buildOidcAuthUrl({
        config,
        clientId: CLIENT_ID,
        redirectUri: "http://localhost:3000/auth/callback/oidc",
        state: "st",
        nonce: "nn",
        codeChallenge: "cc",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${ISSUER}/api/oidc/authorization`);
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile groups");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("nonce")).toBe("nn");
    expect(url.searchParams.get("code_challenge")).toBe("cc");
  });
});

describe("parseAllowedGroups", () => {
  test("splits and trims a comma list", () => {
    expect(parseAllowedGroups(" warpdrive-users , admins ")).toEqual(["warpdrive-users", "admins"]);
  });

  test("yields an empty list for an empty string", () => {
    expect(parseAllowedGroups("")).toEqual([]);
  });
});

describe("fetchOidcConfig", () => {
  beforeEach(() => {
    clearOidcConfigCache();
  });

  function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/oidc/authorization`,
      token_endpoint: `${ISSUER}/api/oidc/token`,
      jwks_uri: `${ISSUER}/jwks.json`,
      ...overrides,
    };
  }

  test("validates and caches the discovery document", async () => {
    let calls = 0;
    const fetchImpl = (): Promise<Response> => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify(document()), { status: 200 }));
    };
    const first = await fetchOidcConfig(ISSUER, AbortSignal.timeout(5000), { fetchImpl });
    const second = await fetchOidcConfig(ISSUER, AbortSignal.timeout(5000), { fetchImpl });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls).toBe(1);
  });

  test("rejects a document whose issuer does not match", async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(document({ issuer: "http://evil.example.com" })), {
          status: 200,
        }),
      );
    const result = await fetchOidcConfig(ISSUER, AbortSignal.timeout(5000), { fetchImpl });
    expect(result.ok).toBe(false);
  });

  test("rejects a document missing the token endpoint", async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(document({ token_endpoint: undefined })), { status: 200 }),
      );
    const result = await fetchOidcConfig(ISSUER, AbortSignal.timeout(5000), { fetchImpl });
    expect(result.ok).toBe(false);
  });

  test("rejects a non-200 response", async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(new Response("nope", { status: 500 }));
    const result = await fetchOidcConfig(ISSUER, AbortSignal.timeout(5000), { fetchImpl });
    expect(result.ok).toBe(false);
  });
});
