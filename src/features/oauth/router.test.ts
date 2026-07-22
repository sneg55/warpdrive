import { expect, test } from "vitest";
import { oauthClients } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";
import { issueAccessToken, revokeAllForClientUser } from "./tokens";

test("lists active OAuth client connections and omits revoked clients", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const clients = [
      { id: "settings-client-one", name: "Settings client one" },
      { id: "settings-client-two", name: "Settings client two" },
    ];
    await db.insert(oauthClients).values(
      clients.map((client) => ({
        ...client,
        redirectUris: [`https://${client.id}.example.com/callback`],
      })),
    );
    const signal = AbortSignal.timeout(5_000);
    for (const client of clients) {
      await issueAccessToken(db, { clientId: client.id, userId: user.id }, signal);
    }

    const actor = await hydrateActor(db, user.id, signal);
    expect(actor).not.toBeNull();
    if (actor === null) return;
    const caller = createCaller({
      db,
      actor,
      session: { userId: user.id, sessionId: "oauth-settings-test" },
    });

    const connected = await caller.oauth.listConnections();
    expect(connected.map((row) => row.clientName).sort()).toEqual([
      "Settings client one",
      "Settings client two",
    ]);

    await revokeAllForClientUser(db, clients[0]!.id, user.id, signal);
    const remaining = await caller.oauth.listConnections();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.clientId).toBe(clients[1]!.id);
  });
});
