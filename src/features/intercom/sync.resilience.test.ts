import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INTERCOM_MAX_STALLED_RUNS } from "@/constants/intercom";
import { intercomContacts, intercomConversations, intercomSyncState } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { comment, type IntercomFake, makeIntercomFake, source } from "./intercomFake.test-helpers";
import { runIntercomSync } from "./sync";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

const NOW_S = 1_800_000_000;
const nowMs = (): number => NOW_S * 1000;
const SIG = (): AbortSignal => new AbortController().signal;

function addConversation(fake: IntercomFake, id: string, updatedAt: number, contacts: string[]) {
  fake.conversations.set(id, {
    id,
    updated_at: updatedAt,
    source: source(`<p>${id}</p>`),
    contacts,
    parts: [comment(`${id}-p1`, updatedAt)],
  });
}

function run(db: TestDb, fake: IntercomFake) {
  return runIntercomSync({ db, client: fake.client, nowMs }, SIG());
}

async function cursorOf(db: TestDb): Promise<number | undefined> {
  const [row] = await db.select().from(intercomSyncState);
  return row?.cursorUpdatedAt;
}

describe("runIntercomSync resilience", () => {
  it("writes a page where two conversations share one contact", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 20, ["k1"]);
      addConversation(fake, "c2", NOW_S - 10, ["k1"]);
      await run(db, fake);
      expect(await db.select().from(intercomConversations)).toHaveLength(2);
      expect(await db.select().from(intercomContacts)).toHaveLength(1);
    });
  });

  it("does not refetch a conversation in the overlap window that has not changed", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 20, ["k1"]);
      await run(db, fake);
      fake.requests.length = 0;
      await run(db, fake);
      expect(fake.requests).toEqual(["/conversations/search"]);
    });
  });

  it("leaves a conversation unstored and the cursor held while its contact cannot be fetched", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 20, ["k1"]);
      fake.failContact.set("k1", 503);
      await run(db, fake);
      expect(await db.select().from(intercomConversations)).toHaveLength(0);
      expect(await cursorOf(db)).toBe(NOW_S - 21);
      fake.failContact.clear();
      await run(db, fake);
      const [contact] = await db.select().from(intercomContacts);
      expect(contact?.email).toBe("pat@example.com");
      expect(await db.select().from(intercomConversations)).toHaveLength(1);
    });
  });

  it("stops holding the cursor once a conversation has failed for too many runs", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 30, ["k1"]);
      addConversation(fake, "c2", NOW_S - 20, ["k1"]);
      fake.failConversation.set("c1", 500);
      for (let i = 0; i < INTERCOM_MAX_STALLED_RUNS; i += 1) {
        await run(db, fake);
        expect(await cursorOf(db)).toBe(NOW_S - 31);
      }
      await run(db, fake);
      expect(await cursorOf(db)).toBe(NOW_S - 20);
      const ids = await db
        .select({ id: intercomConversations.id })
        .from(intercomConversations)
        .orderBy(asc(intercomConversations.id));
      expect(ids.map((r) => r.id)).toEqual(["c2"]);
    });
  });
});
