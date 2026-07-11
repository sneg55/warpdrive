import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThreadNeighbors } from "./threadNeighbors";

// P3: reader prev/next navigation. neighbors() returns the previous/next thread ids plus the 1-based
// index and total over the owner's mailbox for a folder, ordered like the inbox list
// (last_message_at DESC NULLS LAST, id DESC). A non-owner (shared-thread viewer) gets no nav.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedAccount(db: TestDb, ownerId: string): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

// Three inbox threads, newest first: t3 (newest) > t2 > t1 (oldest).
async function seedThreeInbox(
  db: TestDb,
  acctId: string,
): Promise<{ t1: string; t2: string; t3: string }> {
  const mk = async (gmailId: string, at: string): Promise<string> => {
    const r = (
      await db.execute(
        sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
            VALUES (${gmailId}, ${acctId}, ${gmailId}, ${at}) RETURNING id`,
      )
    ).rows[0] as { id: string };
    return r.id;
  };
  const t1 = await mk("t1", "2026-07-01T10:00:00Z");
  const t2 = await mk("t2", "2026-07-02T10:00:00Z");
  const t3 = await mk("t3", "2026-07-03T10:00:00Z");
  return { t1, t2, t3 };
}

describe("getThreadNeighbors", () => {
  it("returns prev/next and 1-based index/total for a middle thread (inbox order)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const { t1, t2, t3 } = await seedThreeInbox(db, acctId);

      const out = await getThreadNeighbors(
        db,
        { actor: actorOf(owner.id), threadId: t2, folder: "inbox" },
        SIG(),
      );
      // Order is newest-first: t3 (1), t2 (2), t1 (3). t2's prev is the newer t3, next is the older t1.
      expect(out).toEqual({ prevId: t3, nextId: t1, index: 2, total: 3 });
    });
  });

  it("gives the newest thread a null prevId and the oldest a null nextId", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const { t1, t3 } = await seedThreeInbox(db, acctId);

      const newest = await getThreadNeighbors(
        db,
        { actor: actorOf(owner.id), threadId: t3, folder: "inbox" },
        SIG(),
      );
      expect(newest).toMatchObject({ prevId: null, index: 1, total: 3 });

      const oldest = await getThreadNeighbors(
        db,
        { actor: actorOf(owner.id), threadId: t1, folder: "inbox" },
        SIG(),
      );
      expect(oldest).toMatchObject({ nextId: null, index: 3, total: 3 });
    });
  });

  it("excludes archived threads from the inbox neighbor set", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const { t2, t3 } = await seedThreeInbox(db, acctId);
      // Archive the middle thread: the inbox set is now just t3, t1.
      await db.execute(sql`UPDATE email_threads SET archived_at = now() WHERE id = ${t2}`);

      const out = await getThreadNeighbors(
        db,
        { actor: actorOf(owner.id), threadId: t3, folder: "inbox" },
        SIG(),
      );
      expect(out).toMatchObject({ index: 1, total: 2 });
    });
  });

  it("orders the Sent folder by latest outbound sent_at, not last_message_at", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      // A: newest by last_message_at but OLDEST outbound. B: oldest by last_message_at but NEWEST
      // outbound. Sent orders by outbound sent_at (matching listSentThreads), so B leads, not A.
      const mk = async (gmailId: string, lastAt: string, sentAt: string): Promise<string> => {
        const r = (
          await db.execute(
            sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
                VALUES (${gmailId}, ${acctId}, ${gmailId}, ${lastAt}) RETURNING id`,
          )
        ).rows[0] as { id: string };
        await db.execute(sql`
          INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, sent_at)
          VALUES (${r.id}, ${acctId}, ${`${gmailId}-m`}, 'outbound', 'me@gunsnation.com', ${sentAt})
        `);
        return r.id;
      };
      const a = await mk("A", "2026-07-03T10:00:00Z", "2026-07-01T10:00:00Z");
      const b = await mk("B", "2026-07-01T10:00:00Z", "2026-07-03T10:00:00Z");

      const out = await getThreadNeighbors(
        db,
        { actor: actorOf(owner.id), threadId: b, folder: "sent" },
        SIG(),
      );
      expect(out).toEqual({ prevId: null, nextId: a, index: 1, total: 2 });
    });
  });

  it("returns null for a non-owner (shared-thread viewer gets no nav)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const { t2 } = await seedThreeInbox(db, acctId);

      const out = await getThreadNeighbors(
        db,
        { actor: actorOf(other.id), threadId: t2, folder: "inbox" },
        SIG(),
      );
      expect(out).toBeNull();
    });
  });
});
