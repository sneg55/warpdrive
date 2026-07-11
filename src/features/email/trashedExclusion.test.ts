import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThread } from "./emailReads";
import { listThreadsForDeal } from "./entityThreadReads";
import { listArchivedThreads, listSentThreads } from "./folderReads";
import { listInbox } from "./inboxList";
import { inboxUnreadCount } from "./readState";
import { searchInbox } from "./searchInbox";
import { getThreadNeighbors } from "./threadNeighbors";

// P4: a trashed thread (trashed_at set) must leave EVERY local view immediately, since the real
// Gmail conversation is gone. One thread, trashed, asserted absent from inbox / sent / archive /
// search / neighbor navigation.

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

// A thread with one outbound sent message (so it qualifies for Sent), plus a body to match search.
async function seedThread(
  db: TestDb,
  acctId: string,
  gmailId: string,
  opts: { archived?: boolean; trashed?: boolean } = {},
): Promise<string> {
  const t = (
    await db.execute(sql`
      INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, archived_at, trashed_at)
      VALUES (${gmailId}, ${acctId}, 'Budget review', now(),
              ${opts.archived === true ? sql`now()` : null},
              ${opts.trashed === true ? sql`now()` : null})
      RETURNING id
    `)
  ).rows[0] as { id: string };
  await db.execute(sql`
    INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_text, sent_at)
    VALUES (${t.id}, ${acctId}, ${`${gmailId}-m`}, 'outbound', 'me@gunsnation.com', 'budget numbers', now())
  `);
  return t.id;
}

describe("trashed thread exclusion", () => {
  it("is absent from the inbox list", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const live = await seedThread(db, acctId, "live");
      await seedThread(db, acctId, "trash", { trashed: true });

      const page = await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG());
      expect(page.threads.map((t) => t.id)).toEqual([live]);
    });
  });

  it("is absent from Sent and Archive", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      // A trashed thread that is also archived: must show in neither folder.
      await seedThread(db, acctId, "trash", { archived: true, trashed: true });

      const sent = await listSentThreads(db, actorOf(owner.id), SIG());
      expect(sent.threads).toHaveLength(0);
      const archived = await listArchivedThreads(db, actorOf(owner.id), SIG());
      expect(archived.threads).toHaveLength(0);
    });
  });

  it("is absent from search results", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await seedThread(db, acctId, "trash", { trashed: true });

      const results = await searchInbox(db, { actor: actorOf(owner.id), q: "budget" }, SIG());
      expect(results).toHaveLength(0);
    });
  });

  it("is excluded from the inbox neighbor set", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const live = await seedThread(db, acctId, "live");
      await seedThread(db, acctId, "trash", { trashed: true });

      const out = await getThreadNeighbors(
        db,
        { actor: actorOf(owner.id), threadId: live, folder: "inbox" },
        SIG(),
      );
      // Only the live thread remains, so total is 1 and it has no neighbors.
      expect(out).toMatchObject({ index: 1, total: 1, prevId: null, nextId: null });
    });
  });

  it("is not counted in the unread badge", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      // Two unread threads (no read rows); trashing one must drop the badge to 1.
      await seedThread(db, acctId, "live");
      await seedThread(db, acctId, "trash", { trashed: true });

      const n = await inboxUnreadCount(db, { actor: actorOf(owner.id) }, SIG());
      expect(n).toBe(1);
    });
  });

  it("is not openable by direct URL (getThread returns not-found)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const trashed = await seedThread(db, acctId, "trash", { trashed: true });

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: trashed, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.id).toBe("E_GMAIL_011");
    });
  });

  it("is absent from a linked deal's Email tab", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const deal = (
        await db.execute(sql`
          INSERT INTO deals (title, owner_id, visibility_level, pipeline_id, stage_id)
          VALUES ('D', ${owner.id}, 'all', ${pipe.pipeline.id}, ${pipe.stages[0]?.id}) RETURNING id
        `)
      ).rows[0] as { id: string };
      const trashed = await seedThread(db, acctId, "trash", { trashed: true });
      await db.execute(sql`UPDATE email_threads SET deal_id = ${deal.id} WHERE id = ${trashed}`);

      const threads = await listThreadsForDeal(
        db,
        { actor: actorOf(owner.id), dealId: deal.id },
        SIG(),
      );
      expect(threads).toHaveLength(0);
    });
  });
});
