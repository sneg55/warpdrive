import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { oauthAccessTokens, oauthClients } from "@/db/schema/oauth";
import { withTestDb } from "@/db/testing";

test("OAuth client and access token rows round trip", async () => {
  await withTestDb(async (db) => {
    const clientId = "test-client-schema";
    const jti = "jti-schema-1";

    await db.insert(oauthClients).values({
      id: clientId,
      name: "Test",
      redirectUris: ["https://client.example.com/callback"],
    });
    await db.insert(oauthAccessTokens).values({
      jti,
      clientId,
      userId: "00000000-0000-0000-0000-000000000000",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const [row] = await db.select().from(oauthAccessTokens).where(eq(oauthAccessTokens.jti, jti));
    expect(row?.clientId).toBe(clientId);
    expect(row?.revokedAt).toBeNull();
  });
});
