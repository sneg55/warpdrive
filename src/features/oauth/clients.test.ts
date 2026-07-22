import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { oauthClients } from "@/db/schema/oauth";
import { withTestDb } from "@/db/testing";
import { registerClient } from "./clients";

test("registers distinct OAuth clients", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(5_000);
    const input = {
      name: "Test client",
      redirectUris: ["https://client.example.com/callback"],
    };

    const first = await registerClient(db, input, signal);
    const second = await registerClient(db, input, signal);
    expect(first.clientId).not.toBe("");
    expect(second.clientId).not.toBe(first.clientId);

    const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, first.clientId));
    expect(row?.name).toBe(input.name);
    expect(row?.redirectUris).toEqual(input.redirectUris);
  });
});
