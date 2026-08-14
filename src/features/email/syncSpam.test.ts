import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";
import { syncMailbox } from "./sync";

// Sync interaction for Gmail's SPAM label. Gmail's history feed reports a spam delivery as a normal
// messagesAdded event (the message simply carries SPAM instead of INBOX), so without this the junk
// lands in the CRM Inbox. Spam is hidden the same way Trash is: the thread is excluded from every
// local view, and marking it "not spam" in Gmail brings it back.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

// A minimal full GmailMessage carrying the given labels.
function msgWithLabels(id: string, threadId: string, labelIds: string[]): GmailMessage {
  return {
    id,
    threadId,
    labelIds,
    snippet: "cheap watches",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "junk@spammer.example" },
        { name: "To", value: "o@gunsnation.com" },
        { name: "Subject", value: "You won" },
      ],
      body: { data: Buffer.from("body").toString("base64url") },
    },
  };
}

async function seedAccount(db: TestDb, startHistoryId: string): Promise<string> {
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
  return a.id;
}

async function seedThread(db: TestDb, acctId: string, hidden: boolean): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, trashed_at)
    VALUES ('t1', ${acctId}, 'S', now(), ${hidden ? sql`now()` : null})
  `);
}

// trashed_at doubles as the "hidden from every local view" flag (Trash or Spam).
async function hiddenAt(db: TestDb, acctId: string): Promise<string | null> {
  const r = (
    await db.execute(
      sql`SELECT trashed_at FROM email_threads WHERE gmail_thread_id='t1' AND account_id=${acctId}`,
    )
  ).rows[0] as { trashed_at: string | null };
  return r.trashed_at;
}

describe("syncMailbox SPAM handling", () => {
  it("hides a conversation whose newly-arrived message is spam", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      const fake = new FakeGmailClient();
      // A spam delivery: messagesAdded, and the message carries SPAM instead of INBOX.
      fake.messages.set("m1", msgWithLabels("m1", "t1", ["SPAM"]));
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["SPAM"] }] });
      fake.historyPages = [
        {
          historyId: "150",
          history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
        },
      ];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await hiddenAt(db, acctId)).not.toBeNull();
    });
  });

  it("hides a conversation the user marked as spam in Gmail", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, false);
      const fake = new FakeGmailClient();
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["SPAM"] }] });
      // Marking an existing conversation as spam arrives as a label change, not a new message.
      fake.historyPages = [
        {
          historyId: "150",
          history: [
            { labelsAdded: [{ message: { id: "m1", threadId: "t1" }, labelIds: ["SPAM"] }] },
          ],
        },
      ];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await hiddenAt(db, acctId)).not.toBeNull();
    });
  });

  it("restores a conversation the user marked as not spam", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, true);
      const fake = new FakeGmailClient();
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["INBOX"] }] });
      fake.historyPages = [
        {
          historyId: "150",
          history: [
            { labelsRemoved: [{ message: { id: "m1", threadId: "t1" }, labelIds: ["SPAM"] }] },
          ],
        },
      ];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await hiddenAt(db, acctId)).toBeNull();
    });
  });

  it("keeps a live conversation visible when only one of its messages is spam", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, false);
      const fake = new FakeGmailClient();
      fake.threads.set("t1", {
        id: "t1",
        messages: [
          { id: "m1", labelIds: ["SPAM"] },
          { id: "m2", labelIds: ["INBOX"] },
        ],
      });
      fake.historyPages = [
        {
          historyId: "150",
          history: [
            { labelsAdded: [{ message: { id: "m1", threadId: "t1" }, labelIds: ["SPAM"] }] },
          ],
        },
      ];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await hiddenAt(db, acctId)).toBeNull();
    });
  });
});
