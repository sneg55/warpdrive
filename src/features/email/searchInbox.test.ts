import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { searchInbox } from "./searchInbox";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedAccount(
  db: TestDb,
  ownerId: string,
  email = "o@gunsnation.com",
): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

async function seedThread(
  db: TestDb,
  acctId: string,
  gmailThreadId: string,
  subject: string,
  visibility = "private",
): Promise<string> {
  const t = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, visibility)
          VALUES (${gmailThreadId}, ${acctId}, ${subject}, now(), ${visibility}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return t.id;
}

async function seedMessage(
  db: TestDb,
  threadId: string,
  acctId: string,
  gmailMessageId: string,
  fromEmail: string,
  bodyText: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_text, sent_at)
    VALUES (${threadId}, ${acctId}, ${gmailMessageId}, 'inbound', ${fromEmail}, ${bodyText}, now())
  `);
}

describe("searchInbox", () => {
  it("matches on subject and excludes non-matching threads", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const budget = await seedThread(db, acctId, "t1", "Budget review");
      await seedMessage(db, budget, acctId, "m1", "alice@x.com", "let's talk numbers");
      const lunch = await seedThread(db, acctId, "t2", "Team lunch");
      await seedMessage(db, lunch, acctId, "m2", "bob@x.com", "pizza friday?");

      const results = await searchInbox(db, { actor: actorOf(owner.id), q: "budget" }, SIG());
      expect(results.map((t) => t.subject)).toEqual(["Budget review"]);
    });
  });

  it("matches on sender (from_email) when the subject does not match", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = await seedThread(db, acctId, "t1", "Catch up");
      await seedMessage(db, thread, acctId, "m1", "priya@gunsnation.com", "hello there");

      const results = await searchInbox(db, { actor: actorOf(owner.id), q: "priya" }, SIG());
      expect(results.map((t) => t.subject)).toEqual(["Catch up"]);
    });
  });

  it("matches on the sender display name (from_name), not just the address", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = await seedThread(db, acctId, "t1", "Catch up");
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, body_text, sent_at)
        VALUES (${thread}, ${acctId}, 'm1', 'inbound', 'support@scrape.do', 'Scrape.do Team', 'hello there', now())
      `);

      // The name lives in from_name (from_email is the bare address), so searching the display
      // name must still find the thread.
      const results = await searchInbox(
        db,
        { actor: actorOf(owner.id), q: "Scrape.do Team" },
        SIG(),
      );
      expect(results.map((t) => t.subject)).toEqual(["Catch up"]);
    });
  });

  it("never surfaces a thread the actor cannot see (private, not owned, not shared)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const hidden = await seedThread(db, acctId, "t1", "Budget secrets", "private");
      await seedMessage(db, hidden, acctId, "m1", "owner@gunsnation.com", "confidential budget");

      const results = await searchInbox(db, { actor: actorOf(other.id), q: "budget" }, SIG());
      expect(results).toHaveLength(0);
    });
  });

  it("a shared thread linked to a deal the actor cannot see is filtered by canSeeEmail, not just SQL", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const p = await seedPipelineWithStages(db, ["A"]);
      const [deal] = await db
        .insert(deals)
        .values({
          title: "D",
          pipelineId: p.pipeline.id,
          stageId: p.stages[0]!.id,
          ownerId: owner.id,
          visibilityLevel: "owner",
        })
        .returning();
      if (!deal) throw new Error("deal seed failed");

      const linked = await seedThread(db, acctId, "t1", "Budget with client", "shared");
      await db.execute(sql`UPDATE email_threads SET deal_id = ${deal.id} WHERE id = ${linked}`);
      await seedMessage(db, linked, acctId, "m1", "owner@gunsnation.com", "budget details");

      const results = await searchInbox(db, { actor: actorOf(other.id), q: "budget" }, SIG());
      expect(results).toHaveLength(0);
    });
  });

  // Regression (codex review, P2 quick-filters): search results feed the same ThreadList as the
  // inbox, where the Has attachment / Unread only filters read InboxThread.hasAttachment / .unread.
  // If searchInbox does not project these, toInboxThread defaults both to false and toggling either
  // filter drops every search result. Mirror listInbox's projection.
  it("projects unread and hasAttachment so the client quick-filters work over search results", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = await seedThread(db, acctId, "t1", "Budget review");
      const msg = (
        await db.execute(sql`
          INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_text, sent_at)
          VALUES (${thread}, ${acctId}, 'm1', 'inbound', 'alice@x.com', 'budget numbers', now())
          RETURNING id
        `)
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
        VALUES (${msg.id}, ${acctId}, 'att1', 'q3.pdf', 'application/pdf', 1024)
      `);
      // No email_thread_reads row for the owner: the thread is unread.

      const results = await searchInbox(db, { actor: actorOf(owner.id), q: "budget" }, SIG());
      expect(results).toHaveLength(1);
      expect(results[0]?.hasAttachment).toBe(true);
      expect(results[0]?.unread).toBe(true);
    });
  });

  it("projects unread=false once the owner has read the thread", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = await seedThread(db, acctId, "t1", "Budget review");
      await seedMessage(db, thread, acctId, "m1", "alice@x.com", "budget numbers");
      // Reader row postdates last_message_at, so the thread reads as read.
      await db.execute(sql`
        INSERT INTO email_thread_reads (thread_id, user_id, read_at)
        VALUES (${thread}, ${owner.id}, now() + interval '1 minute')
      `);

      const results = await searchInbox(db, { actor: actorOf(owner.id), q: "budget" }, SIG());
      expect(results).toHaveLength(1);
      expect(results[0]?.unread).toBe(false);
      expect(results[0]?.hasAttachment).toBe(false);
    });
  });
});
