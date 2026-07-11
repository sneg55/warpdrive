import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { recoverFrom404 } from "./resync";
import { countMessages, msg, newSignal, seedAccount } from "./resyncTestHarness";
import { syncMailbox } from "./sync";

// Basic self-heal cases (A-E). Reconcile-coverage cases (CRM-thread re-fetch,
// getProfile-err, pagination) live in resyncCoverage.test.ts.
describe("recoverFrom404", () => {
  // Test A: expired cursor self-heals end-to-end via syncMailbox 404 path.
  it("A: heals a 404'd account: inserts message, sets new cursor, clears error", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const { acctId } = await seedAccount(db, {
        startHistoryId: "100",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      // historyList returns 404 to trigger recovery.
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      // listMessages returns one recent message.
      fake.listResults = [{ messages: [{ id: "m-rec", threadId: "t-rec" }] }];
      fake.messages.set("m-rec", msg("m-rec", "t-rec", "sender@acme.com"));
      fake.profileHistoryId = "999";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });

      // Recovery succeeds (ok) and applied=1.
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(1);

      // Message inserted.
      expect(await countMessages(db, acctId)).toBe(1);

      // Cursor advanced to new historyId, status connected, error cleared.
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

  // Test B: reply on an old CRM-linked thread is attached to the existing thread.
  it("B: attaches reply to existing CRM-linked thread without creating a duplicate", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId, userId } = await seedAccount(db, {
        startHistoryId: "200",
        lastSyncAt: pastDate,
      });

      // Seed a person so the thread has a person_id.
      await db.execute(
        sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
            VALUES ('Bob','bob@crm.com',${userId},'all')`,
      );
      const personRow = (
        await db.execute(sql`SELECT id FROM persons WHERE primary_email='bob@crm.com'`)
      ).rows[0] as { id: string };

      // Pre-seed the email thread as it would exist from before the gap.
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, last_message_at)
        VALUES ('oldT', ${acctId}, 'Old thread', ${personRow.id}, ${pastDate.toISOString()}::timestamptz)
      `);

      const fake = new FakeGmailClient();
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      // listResults returns a new message on the OLD thread.
      fake.listResults = [{ messages: [{ id: "m-reply", threadId: "oldT" }] }];
      fake.messages.set("m-reply", msg("m-reply", "oldT", "bob@crm.com"));
      fake.profileHistoryId = "888";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(1);

      // Only ONE thread row for "oldT".
      const threadCount = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM email_threads WHERE account_id=${acctId} AND gmail_thread_id='oldT'`,
        )
      ).rows[0] as { n: number };
      expect(threadCount.n).toBe(1);

      // person_id preserved on the thread.
      const thread = (
        await db.execute(
          sql`SELECT person_id FROM email_threads WHERE account_id=${acctId} AND gmail_thread_id='oldT'`,
        )
      ).rows[0] as { person_id: string | null };
      expect(thread.person_id).toBe(personRow.id);

      // Message inserted and linked to the existing thread.
      expect(await countMessages(db, acctId)).toBe(1);
    });
  });

  // Test C: apply failure mid-recovery leaves cursor unchanged and status='error'.
  it("C: apply failure leaves cursor unchanged and status stays error", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "300",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      // Force 404 to trigger recoverFrom404.
      fake.historyList = () =>
        Promise.resolve(err(new AppError("E_GMAIL_001", "history not found", { status: 404 })));
      // List returns a message id.
      fake.listResults = [{ messages: [{ id: "m-bad", threadId: "t-bad" }] }];
      // getMessage returns an error, so applyMessageIds will fail.
      fake.getMessage = (a) => {
        a.signal.throwIfAborted();
        fake.calls.push({ method: "getMessage", args: a });
        return Promise.resolve(err(new AppError("E_GMAIL_001", "message fetch failed", {})));
      };
      fake.profileHistoryId = "777";

      const r = await syncMailbox(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");

      // Cursor NOT advanced.
      const row = (
        await db.execute(sql`SELECT last_history_id, status FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string; status: string };
      expect(row.last_history_id).toBe("300");
      expect(row.status).toBe("error");
    });
  });

  // Test D: idempotency - running recovery twice does not duplicate messages.
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

      // First run.
      const r1 = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value.applied).toBe(1);

      // Second run: account is now 'connected' with last_history_id='500'.
      // Simulate the gap appearing again by calling recoverFrom404 directly with same data.
      // Reset status to 'connected' so the function doesn't short-circuit on disconnected.
      const r2 = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.value.applied).toBe(0); // ON CONFLICT DO NOTHING

      // No duplicate rows.
      expect(await countMessages(db, acctId)).toBe(1);
    });
  });

  // Test E: zero recent messages still advances cursor and sets status='connected'.
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
      // Empty list.
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
