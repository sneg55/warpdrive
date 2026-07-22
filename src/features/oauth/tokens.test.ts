import { expect, test } from "vitest";
import { oauthClients } from "@/db/schema/oauth";
import { withTestDb } from "@/db/testing";
import {
  issueAccessToken,
  issueRefreshToken,
  revokeAllForClientUser,
  rotateRefreshToken,
  verifyAccessToken,
} from "./tokens";

const clientId = "token-test-client";
const userId = "00000000-0000-0000-0000-000000000001";

test("issued tokens verify and revoked tokens do not", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(5_000);
    await db.insert(oauthClients).values({
      id: clientId,
      name: "Token test",
      redirectUris: ["https://client.example.com/callback"],
    });

    const { token } = await issueAccessToken(db, { clientId, userId }, signal);
    const verified = await verifyAccessToken(db, token, signal);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.value.userId).toBe(userId);

    const refreshToken = await issueRefreshToken(db, { clientId, userId }, signal);
    const rotated = await rotateRefreshToken(db, refreshToken, signal);
    expect(rotated.ok).toBe(true);
    if (rotated.ok) expect(rotated.value.clientId).toBe(clientId);

    const reused = await rotateRefreshToken(db, refreshToken, signal);
    expect(reused.ok).toBe(false);

    await revokeAllForClientUser(db, clientId, userId, signal);
    const revoked = await verifyAccessToken(db, token, signal);
    expect(revoked.ok).toBe(false);
  });
});
