import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";
import { syncMailbox } from "./sync";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

// Build a minimal full GmailMessage with a text/plain body and the given sender.
function msg(id: string, threadId: string, from: string): GmailMessage {
  return {
    id,
    threadId,
    labelIds: [],
    snippet: "hi",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: from },
        { name: "To", value: "o@gunsnation.com" },
        { name: "Subject", value: "Hello" },
      ],
      body: { data: Buffer.from("body").toString("base64url") },
    },
  };
}

async function seedAccount(
  db: TestDb,
  startHistoryId: string,
): Promise<{ acctId: string; userId: string }> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('o@gunsnation.com','O','sub-o') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const a = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address, last_history_id, status)
          VALUES (${u.id},'o@gunsnation.com',${startHistoryId},'connected') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return { acctId: a.id, userId: u.id };
}

async function count(
  db: TestDb,
  table: "email_messages" | "email_threads",
  acctId: string,
): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE account_id=${acctId}`,
  );
  return (r.rows[0] as { n: number }).n;
}

describe("syncMailbox", () => {
  // Regression: a freshly connected mailbox has a null history cursor. syncMailbox used to
  // no-op on a null cursor ("seeded by bootstrap"), but no bootstrap ever seeded it, so the
  // mailbox synced forever with applied:0 and last_sync_at stayed null. The first run must
  // seed the cursor from the mailbox's current historyId so go-forward delta polling starts.
  it("seeds the history cursor from the Gmail profile on the first run (null cursor)", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('first@gunsnation.com','F','sub-f') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctId = (
        (
          await db.execute(
            sql`INSERT INTO email_accounts (user_id, email_address, last_history_id, status)
                VALUES (${u.id},'first@gunsnation.com', NULL, 'connected') RETURNING id`,
          )
        ).rows[0] as { id: string }
      ).id;

      const fake = new FakeGmailClient();
      fake.profileHistoryId = "4242";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);

      const row = (
        await db.execute(
          sql`SELECT last_history_id, last_sync_at FROM email_accounts WHERE id=${acctId}`,
        )
      ).rows[0] as { last_history_id: string | null; last_sync_at: Date | null };
      expect(row.last_history_id).toBe("4242");
      expect(row.last_sync_at).not.toBeNull();
    });
  });

  it("pages through all history pages and advances the cursor once at the end", async () => {
    await withTestDb(async (db) => {
      const { acctId } = await seedAccount(db, "100");
      const fake = new FakeGmailClient();
      fake.historyPages = [
        {
          historyId: "100",
          nextPageToken: "1",
          history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
        },
        {
          historyId: "200",
          history: [{ messagesAdded: [{ message: { id: "m2", threadId: "t1" } }] }],
        },
      ];
      fake.messages.set("m1", msg("m1", "t1", "jane@acme.com"));
      fake.messages.set("m2", msg("m2", "t1", "jane@acme.com"));

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(2);

      const cursor = (
        await db.execute(sql`SELECT last_history_id FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string };
      // Cursor advanced to the FINAL page historyId, only after both pages applied.
      expect(cursor.last_history_id).toBe("200");
      expect(await count(db, "email_messages", acctId)).toBe(2);
      expect(await count(db, "email_threads", acctId)).toBe(1);
    });
  });

  it("is idempotent: re-running the same deltas does not duplicate", async () => {
    await withTestDb(async (db) => {
      const { acctId } = await seedAccount(db, "100");
      const fake = new FakeGmailClient();
      fake.historyPages = [
        {
          historyId: "120",
          history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
        },
      ];
      fake.messages.set("m1", msg("m1", "t1", "jane@acme.com"));

      await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      // Simulate a crash before checkpoint: rewind the cursor and re-run the same page.
      await db.execute(sql`UPDATE email_accounts SET last_history_id='100' WHERE id=${acctId}`);
      await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });

      expect(await count(db, "email_messages", acctId)).toBe(1);
      expect(await count(db, "email_threads", acctId)).toBe(1);
    });
  });

  it("links the message to a visible person when a participant matches", async () => {
    await withTestDb(async (db) => {
      const { acctId, userId } = await seedAccount(db, "100");
      // A person owned by the mailbox owner (visible to all), matching the sender.
      await db.execute(sql`
        INSERT INTO persons (name, primary_email, owner_id, visibility_level)
        VALUES ('Jane','jane@acme.com',${userId},'all')
      `);
      const person = (
        await db.execute(sql`SELECT id FROM persons WHERE primary_email='jane@acme.com'`)
      ).rows[0] as { id: string };

      const fake = new FakeGmailClient();
      fake.historyPages = [
        {
          historyId: "110",
          history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
        },
      ];
      fake.messages.set("m1", msg("m1", "t1", "jane@acme.com"));

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);

      const thread = (
        await db.execute(sql`SELECT person_id FROM email_threads WHERE account_id=${acctId}`)
      ).rows[0] as { person_id: string | null };
      expect(thread.person_id).toBe(person.id);
    });
  });

  it("does not advance the cursor when a page fetch fails mid-run", async () => {
    await withTestDb(async (db) => {
      const { acctId } = await seedAccount(db, "100");
      const fake = new FakeGmailClient();
      fake.historyPages = [
        {
          historyId: "150",
          nextPageToken: "1",
          history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
        },
      ];
      const orig = fake.historyList.bind(fake);
      // Page 2 (pageToken set) returns a transient error; page 1 succeeds.
      fake.historyList = (a) =>
        a.pageToken !== undefined
          ? Promise.resolve(err(new AppError("E_GMAIL_001", "rate limited", {})))
          : orig(a);
      fake.messages.set("m1", msg("m1", "t1", "jane@acme.com"));

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");

      const cursor = (
        await db.execute(sql`SELECT last_history_id FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string };
      // Cursor unchanged so the next run re-drives from the old position.
      expect(cursor.last_history_id).toBe("100");
    });
  });

  it("runs 404 recovery: self-heals, advances cursor, clears error when no gap messages", async () => {
    await withTestDb(async (db) => {
      const { acctId } = await seedAccount(db, "100");
      const fake = new FakeGmailClient();
      // historyList signals an expired cursor: a 404 in the AppError context.
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      // No recent messages in the gap window; profileHistoryId provides new cursor.
      fake.profileHistoryId = "150";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      // Full recovery succeeds: no gap messages, cursor re-established.
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(0);

      const row = (
        await db.execute(
          sql`SELECT last_error_id, last_history_id, status FROM email_accounts WHERE id=${acctId}`,
        )
      ).rows[0] as { last_error_id: string | null; last_history_id: string; status: string };
      // Error cleared and cursor advanced to fresh historyId from getProfile.
      expect(row.last_error_id).toBeNull();
      expect(row.last_history_id).toBe("150");
      expect(row.status).toBe("connected");
    });
  });
});
