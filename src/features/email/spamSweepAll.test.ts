import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err, ok } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { sweepAllMailboxes } from "./spamSweepAll";

// The sweep is an operator-run repair across every mailbox, so one broken account (revoked token,
// Gmail outage) must not decide the fate of the others: it is reported and the run continues.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

async function seedAccount(db: TestDb, email: string, status: string): Promise<string> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES (${email},'U',${`sub-${email}`}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const a = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address, last_history_id, status)
          VALUES (${u.id},${email},'100',${status}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return a.id;
}

const okClient = () => Promise.resolve(ok(new FakeGmailClient()));

describe("sweepAllMailboxes", () => {
  it("sweeps every connected mailbox and skips disconnected ones", async () => {
    await withTestDb(async (db) => {
      await seedAccount(db, "a@gunsnation.com", "connected");
      await seedAccount(db, "b@gunsnation.com", "connected");
      await seedAccount(db, "c@gunsnation.com", "disconnected");

      const r = await sweepAllMailboxes(db, { resolveClient: okClient }, newSignal());
      expect(r.map((x) => x.email).sort()).toEqual(["a@gunsnation.com", "b@gunsnation.com"]);
      expect(r.filter((x) => x.ok === false)).toEqual([]);
    });
  });

  it("reports a failing mailbox and still sweeps the rest", async () => {
    await withTestDb(async (db) => {
      const broken = await seedAccount(db, "a@gunsnation.com", "connected");
      await seedAccount(db, "b@gunsnation.com", "connected");

      const r = await sweepAllMailboxes(
        db,
        {
          resolveClient: (accountId: string) =>
            accountId === broken
              ? Promise.resolve(err(new AppError("E_GMAIL_002", "token refresh failed")))
              : okClient(),
        },
        newSignal(),
      );
      expect(r).toHaveLength(2);
      expect(r.filter((x) => x.ok === false).map((x) => x.email)).toEqual(["a@gunsnation.com"]);
      expect(r.filter((x) => x.ok === true).map((x) => x.email)).toEqual(["b@gunsnation.com"]);
    });
  });
});
