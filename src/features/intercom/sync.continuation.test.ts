import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INTERCOM_CONTACT_CACHE_TTL_MS } from "@/constants/intercom";
import { intercomContacts, intercomConversations, intercomSyncState } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { comment, type IntercomFake, makeIntercomFake, source } from "./intercomFake.test-helpers";
import { runIntercomSync } from "./sync";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

const NOW_S = 1_800_000_000;
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

function run(db: TestDb, fake: IntercomFake, opts: { nowMs?: number; maxPages?: number } = {}) {
  return runIntercomSync(
    {
      db,
      client: fake.client,
      nowMs: () => opts.nowMs ?? NOW_S * 1000,
      perPage: 2,
      maxPages: opts.maxPages,
    },
    SIG(),
  );
}

async function storedIds(db: TestDb): Promise<string[]> {
  const rows = await db
    .select({ id: intercomConversations.id })
    .from(intercomConversations)
    .orderBy(asc(intercomConversations.id));
  return rows.map((r) => r.id);
}

describe("runIntercomSync continuation", () => {
  it("resumes the same search on the next run when the page cap cut it short", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      for (const id of ["c1", "c2", "c3", "c4", "c5"])
        addConversation(fake, id, NOW_S - 50, ["k1"]);
      await run(db, fake, { maxPages: 1 });
      await run(db, fake, { maxPages: 1 });
      await run(db, fake, { maxPages: 1 });
      expect(await storedIds(db)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    });
  });

  it("keeps a transient failure's hold while a capped search resumes", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 9_000, ["k1"]);
      addConversation(fake, "c2", NOW_S - 8_000, ["k1"]);
      addConversation(fake, "c3", NOW_S - 7_000, ["k1"]);
      addConversation(fake, "c4", NOW_S - 6_000, ["k1"]);
      fake.failConversation.set("c1", 503);
      await run(db, fake, { maxPages: 1 });
      await run(db, fake, { maxPages: 1 });
      const [state] = await db.select().from(intercomSyncState);
      expect(state?.cursorUpdatedAt).toBe(NOW_S - 9_001);
      fake.failConversation.clear();
      await run(db, fake);
      expect(await storedIds(db)).toEqual(["c1", "c2", "c3", "c4"]);
    });
  });

  it("never moves the cursor backwards while re-reading the overlap window", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 200, ["k1"]);
      addConversation(fake, "c2", NOW_S - 100, ["k1"]);
      await run(db, fake);
      await db.update(intercomSyncState).set({ cursorUpdatedAt: NOW_S - 50 });
      await run(db, fake, { maxPages: 1 });
      const [state] = await db.select().from(intercomSyncState);
      expect(state?.cursorUpdatedAt).toBe(NOW_S - 50);
    });
  });

  it("refreshes an expired contact even when none of its conversations changed", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "old@example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      await run(db, fake);
      fake.contacts.set("k1", { id: "k1", email: "new@example.com" });
      await run(db, fake, { nowMs: NOW_S * 1000 + INTERCOM_CONTACT_CACHE_TTL_MS + 1000 });
      const [contact] = await db.select().from(intercomContacts);
      expect(contact?.email).toBe("new@example.com");
    });
  });

  it("keeps a cached email when the refresh finds the contact gone", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      await run(db, fake);
      fake.failContact.set("k1", 404);
      const later = NOW_S * 1000 + INTERCOM_CONTACT_CACHE_TTL_MS + 1000;
      await run(db, fake, { nowMs: later });
      const [contact] = await db.select().from(intercomContacts);
      expect(contact?.email).toBe("pat@example.com");
      expect(contact?.updatedAt.getTime()).toBe(later);
    });
  });

  it("skips the contact refresh when the search itself failed", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      await run(db, fake);
      fake.conversations.clear();
      fake.failSearch = 401;
      fake.requests.length = 0;
      await run(db, fake, { nowMs: NOW_S * 1000 + INTERCOM_CONTACT_CACHE_TTL_MS + 1000 });
      expect(fake.requests).toEqual(["/conversations/search"]);
    });
  });
});
