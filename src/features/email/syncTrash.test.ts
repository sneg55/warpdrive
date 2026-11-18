import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";
import { syncMailbox } from "./sync";

function trashedMsg(id: string, threadId: string): GmailMessage {
  return {
    id,
    threadId,
    labelIds: ["TRASH"],
    snippet: "hi",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "auto@filter.com" },
        { name: "To", value: "o@gunsnation.com" },
        { name: "Subject", value: "Filtered" },
      ],
      body: { data: Buffer.from("body").toString("base64url") },
    },
  };
}

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

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

async function seedThread(db: TestDb, acctId: string, trashed: boolean): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, trashed_at)
    VALUES ('t1', ${acctId}, 'S', now(), ${trashed ? sql`now()` : null})
  `);
}

async function trashedAt(db: TestDb, acctId: string): Promise<string | null> {
  const r = (
    await db.execute(
      sql`SELECT trashed_at FROM email_threads WHERE gmail_thread_id='t1' AND account_id=${acctId}`,
    )
  ).rows[0] as { trashed_at: string | null };
  return r.trashed_at;
}

const trashAddedPage = {
  historyId: "150",
  history: [{ labelsAdded: [{ message: { id: "m1", threadId: "t1" }, labelIds: ["TRASH"] }] }],
};
const trashRemovedPage = {
  historyId: "150",
  history: [{ labelsRemoved: [{ message: { id: "m1", threadId: "t1" }, labelIds: ["TRASH"] }] }],
};

describe("syncMailbox TRASH handling", () => {
  it("stamps trashed_at when the whole conversation is in Trash", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, false);
      const fake = new FakeGmailClient();
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["TRASH"] }] });
      fake.historyPages = [trashAddedPage];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await trashedAt(db, acctId)).not.toBeNull();
    });
  });

  it("does NOT trash the thread when only one message of a multi-message conversation is trashed", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, false);
      const fake = new FakeGmailClient();
      fake.threads.set("t1", {
        id: "t1",
        messages: [
          { id: "m1", labelIds: ["TRASH"] },
          { id: "m2", labelIds: ["INBOX"] },
        ],
      });
      fake.historyPages = [trashAddedPage];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await trashedAt(db, acctId)).toBeNull();
    });
  });

  it("clears trashed_at when the conversation is restored from Trash", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, true);
      const fake = new FakeGmailClient();
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["INBOX"] }] });
      fake.historyPages = [trashRemovedPage];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await trashedAt(db, acctId)).toBeNull();
    });
  });

  it("trashes a conversation whose newly-added message already carries TRASH (filter auto-delete)", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, false);
      const fake = new FakeGmailClient();
      fake.messages.set("m1", trashedMsg("m1", "t1"));
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m1", labelIds: ["TRASH"] }] });
      fake.historyPages = [
        {
          historyId: "150",
          history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
        },
      ];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await trashedAt(db, acctId)).not.toBeNull();
    });
  });

  it("un-trashes a conversation when a new non-trash message (a reply) lands on it", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, true);
      const fake = new FakeGmailClient();
      fake.messages.set("m2", { ...trashedMsg("m2", "t1"), labelIds: ["INBOX"] });
      fake.threads.set("t1", { id: "t1", messages: [{ id: "m2", labelIds: ["INBOX"] }] });
      fake.historyPages = [
        {
          historyId: "150",
          history: [{ messagesAdded: [{ message: { id: "m2", threadId: "t1" } }] }],
        },
      ];

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await trashedAt(db, acctId)).toBeNull();
    });
  });

  it("does not wedge the cursor when a trash-signalled thread was purged (getThread 404)", async () => {
    await withTestDb(async (db) => {
      const acctId = await seedAccount(db, "100");
      await seedThread(db, acctId, false);
      const fake = new FakeGmailClient();
      fake.getThread404Ids.add("t1");
      fake.historyPages = [trashAddedPage];
      fake.profileHistoryId = "150";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      expect(await trashedAt(db, acctId)).not.toBeNull();
      const cursor = (
        await db.execute(sql`SELECT last_history_id FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string };
      expect(cursor.last_history_id).toBe("150");
    });
  });
});
