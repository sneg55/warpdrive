import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { oauthClients, users } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { issueAccessToken } from "@/features/oauth/tokens";
import { authenticateMcp } from "./auth";

test("authenticates bearer tokens and rejects unusable identities", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(5_000);
    const user = await seedUser(db);
    const clientId = "mcp-auth-test-client";
    await db.insert(oauthClients).values({
      id: clientId,
      name: "MCP auth test",
      redirectUris: ["https://client.example.com/callback"],
    });
    const { token } = await issueAccessToken(db, { clientId, userId: user.id }, signal);

    const authenticated = await authenticateMcp(db, `Bearer ${token}`, signal);
    expect(authenticated.ok).toBe(true);
    if (authenticated.ok) {
      expect(authenticated.value.ctx.actor?.id).toBe(user.id);
      expect(authenticated.value.authInfo.clientId).toBe(clientId);
    }

    expect((await authenticateMcp(db, null, signal)).ok).toBe(false);
    expect((await authenticateMcp(db, "Bearer garbage", signal)).ok).toBe(false);

    await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
    const deactivated = await authenticateMcp(db, `Bearer ${token}`, signal);
    expect(deactivated.ok).toBe(false);
  });
});
