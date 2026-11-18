import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { recoverFrom404 } from "./resync";
import { countMessages, msg, newSignal, seedAccount } from "./resyncTestHarness";
import { syncMailbox } from "./sync";

describe("recoverFrom404", () => {
  it("A: heals a 404'd account: inserts message, sets new cursor, clears error", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "100",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      fake.listResults = [{ messages: [{ id: "m-rec", threadId: "t-rec" }] }];
      fake.messages.set("m-rec", msg("m-rec", "t-rec", "sender@acme.com"));
      fake.profileHistoryId = "999";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });

      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(1);

      expect(await countMessages(db, acctId)).toBe(1);

      const row = (
        await db.execute(
          sql`SELECT last_history_id, status, last_error_id FROM email_accounts WHERE id=${acctId}`,
        )
      ).rows[0] as { last_history_id: string; status: string; last_error_id: string | null };
      expect(row.last_history_id).toBe("999");
      expect(row.status).toBe("connected");
      expect(row.last_error_id).toBeNull();
    });
  });

  it("B: attaches reply to existing CRM-linked thread without creating a duplicate", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId, userId } = await seedAccount(db, {
        startHistoryId: "200",
        lastSyncAt: pastDate,
      });

      await db.execute(
        sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
            VALUES ('Bob','bob@crm.com',${userId},'all')`,
      );
      const personRow = (
        await db.execute(sql`SELECT id FROM persons WHERE primary_email='bob@crm.com'`)
      ).rows[0] as { id: string };

      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, last_message_at)
        VALUES ('oldT', ${acctId}, 'Old thread', ${personRow.id}, ${pastDate.toISOString()}::timestamptz)
      `);

      const fake = new FakeGmailClient();
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      fake.listResults = [{ messages: [{ id: "m-reply", threadId: "oldT" }] }];
      fake.messages.set("m-reply", msg("m-reply", "oldT", "bob@crm.com"));
      fake.profileHistoryId = "888";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(1);

      const threadCount = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM email_threads WHERE account_id=${acctId} AND gmail_thread_id='oldT'`,
        )
      ).rows[0] as { n: number };
      expect(threadCount.n).toBe(1);

      const thread = (
        await db.execute(
          sql`SELECT person_id FROM email_threads WHERE account_id=${acctId} AND gmail_thread_id='oldT'`,
        )
      ).rows[0] as { person_id: string | null };
      expect(thread.person_id).toBe(personRow.id);

      expect(await countMessages(db, acctId)).toBe(1);
    });
  });

  it("C: apply failure leaves cursor unchanged and status stays error", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "300",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      fake.listResults = [{ messages: [{ id: "m-bad", threadId: "t-bad" }] }];
      fake.getMessage = (a) => {
        a.signal.throwIfAborted();
        fake.calls.push({ method: "getMessage", args: a });
        return Promise.resolve(err(new AppError("E_GMAIL_001", "message fetch failed", {})));
      };
      fake.profileHistoryId = "777";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");

      const row = (
        await db.execute(sql`SELECT last_history_id, status FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string; status: string };
      expect(row.last_history_id).toBe("300");
      expect(row.status).toBe("error");
    });
  });

  it("D: idempotent: second run inserts 0 new rows", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "400",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [{ id: "m-idem", threadId: "t-idem" }] }];
      fake.messages.set("m-idem", msg("m-idem", "t-idem", "x@acme.com"));
      fake.profileHistoryId = "500";

      const r1 = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value.applied).toBe(1);

      const r2 = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.value.applied).toBe(0);

      expect(await countMessages(db, acctId)).toBe(1);
    });
  });

  it("E: zero recent messages still establishes fresh cursor and connected status", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "600",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      fake.listResults = [{ messages: [] }];
      fake.profileHistoryId = "650";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(0);

      const row = (
        await db.execute(
          sql`SELECT last_history_id, status, last_error_id FROM email_accounts WHERE id=${acctId}`,
        )
      ).rows[0] as { last_history_id: string; status: string; last_error_id: string | null };
      expect(row.last_history_id).toBe("650");
      expect(row.status).toBe("connected");
      expect(row.last_error_id).toBeNull();
    });
  });
});
