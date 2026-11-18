import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { recoverFrom404 } from "./resync";
import { countMessages, msg, newSignal, seedAccount } from "./resyncTestHarness";

describe("recoverFrom404 coverage", () => {
  it("F: recovers a CRM-linked thread message the recent-window backfill misses", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId, userId } = await seedAccount(db, {
        startHistoryId: "700",
        lastSyncAt: pastDate,
      });

      await db.execute(
        sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
            VALUES ('Carol','carol@crm.com',${userId},'all')`,
      );
      const personRow = (
        await db.execute(sql`SELECT id FROM persons WHERE primary_email='carol@crm.com'`)
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, last_message_at)
        VALUES ('oldT', ${acctId}, 'Old thread', ${personRow.id}, ${pastDate.toISOString()}::timestamptz)
      `);

      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [] }];
      fake.threads.set("oldT", { id: "oldT", messages: [{ id: "old-msg", labelIds: [] }] });
      fake.messages.set("old-msg", msg("old-msg", "oldT", "carol@crm.com"));
      fake.profileHistoryId = "750";

      const r = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(1);
      expect(await countMessages(db, acctId)).toBe(1);

      const inserted = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM email_messages WHERE account_id=${acctId} AND gmail_message_id='old-msg'`,
        )
      ).rows[0] as { n: number };
      expect(inserted.n).toBe(1);

      const acctAfter = (
        await db.execute(sql`SELECT last_history_id, status FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string; status: string };
      expect(acctAfter.last_history_id).toBe("750");
      expect(acctAfter.status).toBe("connected");
    });
  });

  it("G: getProfile failure leaves cursor unchanged and status error", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "800",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [{ id: "m-ok", threadId: "t-ok" }] }];
      fake.messages.set("m-ok", msg("m-ok", "t-ok", "z@acme.com"));
      fake.getProfile = (a) => {
        a.signal.throwIfAborted();
        fake.calls.push({ method: "getProfile", args: a });
        return Promise.resolve(err(new AppError("E_GMAIL_001", "profile fetch failed", {})));
      };

      const r = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");

      const row = (
        await db.execute(sql`SELECT last_history_id, status FROM email_accounts WHERE id=${acctId}`)
      ).rows[0] as { last_history_id: string; status: string };
      expect(row.last_history_id).toBe("800");
      expect(row.status).toBe("error");
    });
  });

  it("H: pages listMessages through nextPageToken and applies both pages", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId } = await seedAccount(db, {
        startHistoryId: "900",
        lastSyncAt: pastDate,
      });

      const fake = new FakeGmailClient();
      fake.listResults = [
        { messages: [{ id: "p0-msg", threadId: "tp0" }], nextPageToken: "1" },
        { messages: [{ id: "p1-msg", threadId: "tp1" }] },
      ];
      fake.messages.set("p0-msg", msg("p0-msg", "tp0", "a@acme.com"));
      fake.messages.set("p1-msg", msg("p1-msg", "tp1", "b@acme.com"));
      fake.profileHistoryId = "950";

      const r = await recoverFrom404(db, {
        accountId: acctId,
        gmail: fake,
        signal: newSignal(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(2);
      expect(await countMessages(db, acctId)).toBe(2);
    });
  });

  it("I: reconciles trashed_at for a linked thread trashed during the gap", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId, userId } = await seedAccount(db, {
        startHistoryId: "800",
        lastSyncAt: pastDate,
      });
      await db.execute(
        sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
            VALUES ('Dave','dave@crm.com',${userId},'all')`,
      );
      const personRow = (
        await db.execute(sql`SELECT id FROM persons WHERE primary_email='dave@crm.com'`)
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, last_message_at)
        VALUES ('oldT', ${acctId}, 'Old thread', ${personRow.id}, ${pastDate.toISOString()}::timestamptz)
      `);

      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [] }];
      fake.threads.set("oldT", { id: "oldT", messages: [{ id: "old-msg", labelIds: ["TRASH"] }] });
      fake.messages.set("old-msg", msg("old-msg", "oldT", "dave@crm.com"));
      fake.profileHistoryId = "850";

      const r = await recoverFrom404(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);

      const row = (
        await db.execute(sql`SELECT trashed_at FROM email_threads WHERE gmail_thread_id='oldT'`)
      ).rows[0] as { trashed_at: string | null };
      expect(row.trashed_at).not.toBeNull();
    });
  });

  it("J: reconciles trashed_at for a lead-linked thread trashed during the gap", async () => {
    await withTestDb(async (db) => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const { acctId, userId } = await seedAccount(db, {
        startHistoryId: "900",
        lastSyncAt: pastDate,
      });
      const leadRow = (
        await db.execute(
          sql`INSERT INTO leads (title, owner_id, visibility_level) VALUES ('L', ${userId}, 'all') RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, lead_id, subject, last_message_at)
        VALUES ('leadT', ${acctId}, ${leadRow.id}, 'Lead thread', ${pastDate.toISOString()}::timestamptz)
      `);

      const fake = new FakeGmailClient();
      fake.listResults = [{ messages: [] }];
      fake.threads.set("leadT", { id: "leadT", messages: [{ id: "lm", labelIds: ["TRASH"] }] });
      fake.messages.set("lm", msg("lm", "leadT", "lead@crm.com"));
      fake.profileHistoryId = "950";

      const r = await recoverFrom404(db, { accountId: acctId, gmail: fake, signal: newSignal() });
      expect(r.ok).toBe(true);

      const row = (
        await db.execute(sql`SELECT trashed_at FROM email_threads WHERE gmail_thread_id='leadT'`)
      ).rows[0] as { trashed_at: string | null };
      expect(row.trashed_at).not.toBeNull();
    });
  });
});
