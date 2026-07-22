import { expect, test } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { oauthAuthCodes, oauthClients } from "@/db/schema/oauth";
import { withTestDb } from "@/db/testing";
import { consumeAuthCode, issueAuthCode } from "./authorize";
import { sha256Base64Url } from "./pkce";

const clientId = "authorize-test-client";
const userId = "00000000-0000-0000-0000-000000000002";
const redirectUri = "https://client.example.com/callback";
const verifier = "authorize-verifier-123456789012345678901234567890";

test("authorization codes enforce PKCE, expiry, binding, and single use", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(5_000);
    await db.insert(oauthClients).values({
      id: clientId,
      name: "Authorize test",
      redirectUris: [redirectUri],
    });

    const code = await issueAuthCode(
      db,
      { clientId, userId, redirectUri, codeChallenge: sha256Base64Url(verifier) },
      signal,
    );
    const consumed = await consumeAuthCode(
      db,
      { code, clientId, redirectUri, codeVerifier: verifier },
      signal,
    );
    expect(consumed).toEqual({ ok: true, value: { userId } });

    const reused = await consumeAuthCode(
      db,
      { code, clientId, redirectUri, codeVerifier: verifier },
      signal,
    );
    expect(reused.ok).toBe(false);

    const wrongPkceCode = await issueAuthCode(
      db,
      { clientId, userId, redirectUri, codeChallenge: sha256Base64Url(verifier) },
      signal,
    );
    const wrongPkce = await consumeAuthCode(
      db,
      { code: wrongPkceCode, clientId, redirectUri, codeVerifier: "wrong-verifier" },
      signal,
    );
    expect(wrongPkce.ok).toBe(false);
    if (!wrongPkce.ok) expect(wrongPkce.error.id).toBe(ERROR_IDS.OAUTH_INVALID_PKCE);

    const expiredCode = "expired-authorization-code";
    await db.insert(oauthAuthCodes).values({
      codeHash: sha256Base64Url(expiredCode),
      clientId,
      userId,
      redirectUri,
      codeChallenge: sha256Base64Url(verifier),
      expiresAt: new Date(Date.now() - 1_000),
    });
    const expired = await consumeAuthCode(
      db,
      { code: expiredCode, clientId, redirectUri, codeVerifier: verifier },
      signal,
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.id).toBe(ERROR_IDS.OAUTH_CODE_EXPIRED);
  });
});
