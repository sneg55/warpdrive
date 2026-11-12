import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INTERCOM_BACKFILL_DAYS, INTERCOM_CURSOR_OVERLAP_SECONDS } from "@/constants/intercom";
import {
  intercomContacts,
  intercomConversationContacts,
  intercomConversationParts,
  intercomConversations,
  intercomSyncState,
} from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { comment, type IntercomFake, makeIntercomFake, source } from "./intercomFake.test-helpers";
import { runIntercomSync } from "./sync";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

const NOW_S = 1_800_000_000;
const nowMs = (): number => NOW_S * 1000;
const SIG = (): AbortSignal => new AbortController().signal;

function seedWorkspace(fake: IntercomFake, count: number): void {
  for (let i = 1; i <= count; i += 1) {
    const id = `c${i}`;
    fake.conversations.set(id, {
      id,
      updated_at: NOW_S - 10_000 + i,
      source: source(`<p>Question ${i}</p>`),
      contacts: [`k${i}`],
      parts: [
        comment(`${id}-p1`, NOW_S - 10_000 + i),
        { ...comment(`${id}-n1`, NOW_S - 10_000 + i), part_type: "note" },
      ],
    });
    fake.contacts.set(`k${i}`, { id: `k${i}`, email: `Person${i}@Example.com` });
  }
}

async function cursorOf(db: TestDb): Promise<number | undefined> {
  const [row] = await db.select().from(intercomSyncState);
  return row?.cursorUpdatedAt;
}

function run(db: TestDb, fake: IntercomFake, signal: AbortSignal = SIG(), perPage?: number) {
  return runIntercomSync({ db, client: fake.client, nowMs, perPage }, signal);
}

describe("runIntercomSync", () => {
  it("backfills a year on the first run and stores only visible parts", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 2);
      await run(db, fake);
      const firstSearch = fake.requests.indexOf("/conversations/search");
      expect(firstSearch).toBe(0);
      const convs = await db
        .select()
        .from(intercomConversations)
        .orderBy(asc(intercomConversations.id));
      expect(convs.map((c) => c.id)).toEqual(["c1", "c2"]);
      expect(convs[0]?.messageCount).toBe(2);
      const parts = await db.select().from(intercomConversationParts);
      expect(parts.map((p) => p.partType).sort()).toEqual([
        "comment",
        "comment",
        "source",
        "source",
      ]);
      const contacts = await db.select().from(intercomContacts).orderBy(asc(intercomContacts.id));
      expect(contacts.map((c) => c.email)).toEqual(["person1@example.com", "person2@example.com"]);
      expect(await cursorOf(db)).toBe(NOW_S - 10_000 + 2);
    });
  });

  it("queries from the cursor minus the overlap and from a year back on first run", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      const seen: number[] = [];
      const original = fake.client.searchConversations.bind(fake.client);
      fake.client.searchConversations = (args, signal) => {
        seen.push(args.updatedAfter);
        return original(args, signal);
      };
      await run(db, fake);
      await db
        .insert(intercomSyncState)
        .values({ cursorUpdatedAt: 5_000 })
        .onConflictDoUpdate({
          target: intercomSyncState.id,
          set: { cursorUpdatedAt: 5_000 },
        });
      await run(db, fake);
      expect(seen).toEqual([
        NOW_S - INTERCOM_BACKFILL_DAYS * 86_400 - INTERCOM_CURSOR_OVERLAP_SECONDS,
        5_000 - INTERCOM_CURSOR_OVERLAP_SECONDS,
      ]);
    });
  });

  it("is idempotent and replaces parts when a part is later redacted", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 1);
      await run(db, fake);
      await run(db, fake);
      expect(await db.select().from(intercomConversationParts)).toHaveLength(2);
      const c = fake.conversations.get("c1");
      if (c === undefined) throw new Error("seed missing");
      c.parts = [{ ...comment("c1-p1", NOW_S - 9_999), redacted: true }];
      c.updated_at = NOW_S - 5;
      await run(db, fake);
      const parts = await db.select().from(intercomConversationParts);
      expect(parts.map((p) => p.id)).toEqual(["source-c1"]);
      const [conv] = await db.select().from(intercomConversations);
      expect(conv?.messageCount).toBe(1);
    });
  });

  it("skips a malformed or deleted conversation but keeps the rest of the batch", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 3);
      fake.malformedConversation.add("c1");
      fake.failConversation.set("c2", 404);
      await run(db, fake);
      const convs = await db.select().from(intercomConversations);
      expect(convs.map((c) => c.id)).toEqual(["c3"]);
      expect(await cursorOf(db)).toBe(NOW_S - 10_000 + 3);
    });
  });

  it("holds the cursor below a conversation that failed transiently", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 3);
      fake.failConversation.set("c2", 503);
      await run(db, fake);
      const convs = await db
        .select()
        .from(intercomConversations)
        .orderBy(asc(intercomConversations.id));
      expect(convs.map((c) => c.id)).toEqual(["c1", "c3"]);
      expect(await cursorOf(db)).toBe(NOW_S - 10_000 + 2 - 1);
      fake.failConversation.clear();
      await run(db, fake);
      expect(await db.select().from(intercomConversations)).toHaveLength(3);
      expect(await cursorOf(db)).toBe(NOW_S - 10_000 + 3);
    });
  });

  it("stores a merged or missing contact with no email and links it anyway", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 2);
      fake.failContact.set("k1", 410);
      fake.contacts.set("k2", { id: "k2", email: "no-reply@example.com" });
      await run(db, fake);
      const contacts = await db.select().from(intercomContacts).orderBy(asc(intercomContacts.id));
      expect(contacts.map((c) => c.email)).toEqual([null, null]);
      expect(await db.select().from(intercomConversationContacts)).toHaveLength(2);
    });
  });

  it("resumes after an abort without skipping or duplicating anything", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 5);
      const ctrl = new AbortController();
      fake.onRequest = (path) => {
        if (path === "/conversations/c4") ctrl.abort();
      };
      await expect(run(db, fake, ctrl.signal, 2)).rejects.toThrow();
      const partial = await db.select().from(intercomConversations);
      expect(partial.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
      expect(await cursorOf(db)).toBe(NOW_S - 10_000 + 2);
      fake.onRequest = () => {};
      await run(db, fake, SIG(), 2);
      const all = await db
        .select()
        .from(intercomConversations)
        .orderBy(asc(intercomConversations.id));
      expect(all.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
      expect(await db.select().from(intercomConversationParts)).toHaveLength(10);
      const c1Parts = await db
        .select()
        .from(intercomConversationParts)
        .where(eq(intercomConversationParts.conversationId, "c1"));
      expect(c1Parts).toHaveLength(2);
      expect(await cursorOf(db)).toBe(NOW_S - 10_000 + 5);
    });
  });

  it("does not refetch a contact cached recently", async () => {
    await withTestDb(async (db) => {
      const fake = makeIntercomFake();
      seedWorkspace(fake, 1);
      await run(db, fake);
      fake.requests.length = 0;
      await run(db, fake);
      expect(fake.requests.filter((p) => p.startsWith("/contacts/"))).toEqual([]);
    });
  });
});
