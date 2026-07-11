import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SYNC_JITTER_MODULO_SECONDS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { err, ok } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { jitterFor, runSyncJob } from "./worker";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

describe("worker jitter", () => {
  it("is deterministic per account", () => {
    expect(jitterFor("acc-abc")).toBe(jitterFor("acc-abc"));
  });
  it("stays within the cadence window", () => {
    for (const id of ["a", "b", "c", "acc-1", "acc-2"]) {
      const j = jitterFor(id);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(SYNC_JITTER_MODULO_SECONDS);
    }
  });
  it("spreads two accounts to different offsets (no thundering herd)", () => {
    expect(jitterFor("mailbox-one")).not.toBe(jitterFor("mailbox-two"));
  });
});

async function seedConnectedAccount(db: TestDb): Promise<string> {
  const u = await seedUser(db, { email: "o@gunsnation.com" });
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address, last_history_id, status)
          VALUES (${u.id}, 'o@gunsnation.com', '100', 'connected') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("runSyncJob", () => {
  it("stamps last_error_id and returns err (never throws) when resolve/sync fails", async () => {
    await withTestDb(async (db) => {
      const accountId = await seedConnectedAccount(db);
      // Injected resolver returns a transient error: runSyncJob must surface it as a
      // Result and stamp the account, not throw.
      const r = await runSyncJob(
        db,
        { accountId, signal: SIG() },
        {
          resolveClient: () =>
            Promise.resolve(err(new AppError("E_GMAIL_001", "refresh failed", {}))),
        },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");

      const row = (
        await db.execute(sql`SELECT last_error_id FROM email_accounts WHERE id=${accountId}`)
      ).rows[0] as { last_error_id: string | null };
      expect(row.last_error_id).toBe("E_GMAIL_001");
    });
  });

  it("returns ok({applied}) on the happy path with a fake client", async () => {
    await withTestDb(async (db) => {
      const accountId = await seedConnectedAccount(db);
      const fake = new FakeGmailClient();
      // No history pages -> syncMailbox applies nothing but succeeds and advances cursor.
      const r = await runSyncJob(
        db,
        { accountId, signal: SIG() },
        {
          resolveClient: () => Promise.resolve(ok(fake)),
        },
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.applied).toBe(0);
      // last_error_id cleared on a successful sync checkpoint.
      const row = (
        await db.execute(sql`SELECT last_error_id FROM email_accounts WHERE id=${accountId}`)
      ).rows[0] as { last_error_id: string | null };
      expect(row.last_error_id).toBeNull();
    });
  });
});
