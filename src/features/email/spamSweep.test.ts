import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { FakeGmailClient } from "./gmailFake";
import { sweepSpam } from "./spamSweep";

// One-off repair for spam that synced into the CRM Inbox BEFORE spam was hidden at sync time. The
// forward fix only reacts to history events, so a thread already sitting in the local inbox is never
// re-examined. The sweep asks Gmail which conversations are in Spam and re-derives each one's hidden
// state from its CURRENT labels (same whole-thread rule as the sync path), so a live conversation
// that merely contains one spam-flagged message is left alone.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

async function seedAccount(db: TestDb): Promise<string> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('o@gunsnation.com','O','sub-o') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const a = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address, last_history_id, status)
          VALUES (${u.id},'o@gunsnation.com','100','connected') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return a.id;
}

async function seedThread(db: TestDb, acctId: string, gmailThreadId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
    VALUES (${gmailThreadId}, ${acctId}, 'S', now())
  `);
}

async function hiddenAt(db: TestDb, acctId: string, gmailThreadId: string): Promise<string | null> {
  const r = (
    await db.execute(
      sql`SELECT trashed_at FROM email_threads
          WHERE gmail_thread_id=${gmailThreadId} AND account_id=${acctId}`,
    )
  ).rows[0] as { trashed_at: string | null };
  return r.trashed_at;
}

describe("sweepSpam", () => {
  it("hides an already-synced thread that Gmail now reports as spam", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db);
      await seedThread(db, acctId, "t1");
      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [{ id: "m1", threadId: "t1" }] }];
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["SPAM"] }] });

      const r = await sweepSpam(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r).toMatchObject({ ok: true, value: { hidden: 1 } });
      expect(await hiddenAt(db, acctId, "t1")).not.toBeNull();
    });
  });

  it("leaves a live conversation visible when only one of its messages is spam", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db);
      await seedThread(db, acctId, "t1");
      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [{ id: "m1", threadId: "t1" }] }];
      fake.threads.set("t1", {
        id: "t1",
        messages: [
          { id: "m1", labelIds: ["SPAM"] },
          { id: "m2", labelIds: ["INBOX"] },
        ],
      });

      const r = await sweepSpam(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r).toMatchObject({ ok: true, value: { hidden: 0 } });
      expect(await hiddenAt(db, acctId, "t1")).toBeNull();
    });
  });

  it("ignores spam conversations that were never synced into the CRM", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db);
      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [{ id: "m9", threadId: "never-synced" }] }];
      fake.threads.set("never-synced", {
        id: "never-synced",
        messages: [{ id: "m9", labelIds: ["SPAM"] }],
      });

      const r = await sweepSpam(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      // No local row to repair, and no wasted getThread on a thread we do not have.
      expect(r).toMatchObject({ ok: true, value: { hidden: 0 } });
      expect(fake.calls.some((c) => c.method === "getThread")).toBe(false);
    });
  });

  it("asks Gmail for the spam folder explicitly (messages.list hides spam by default)", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db);
      const fake = new FakeGmailClient();

      const r = await sweepSpam(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      const list = fake.calls.find((c) => c.method === "listMessages");
      expect(list?.args).toMatchObject({ q: "in:spam", includeSpamTrash: true });
    });
  });

  it("pages through every spam result", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db);
      await seedThread(db, acctId, "t1");
      await seedThread(db, acctId, "t2");
      const fake = new FakeGmailClient();
      fake.listResults = [
        { messages: [{ id: "m1", threadId: "t1" }], nextPageToken: "1" },
        { messages: [{ id: "m2", threadId: "t2" }] },
      ];
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["SPAM"] }] });
      fake.threads.set("t2", { id: "t2", messages: [{ id: "m2", labelIds: ["SPAM"] }] });

      const r = await sweepSpam(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r).toMatchObject({ ok: true, value: { hidden: 2 } });
      expect(await hiddenAt(db, acctId, "t2")).not.toBeNull();
    });
  });
});
