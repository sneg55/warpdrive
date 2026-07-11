import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { listOutbox } from "./folderReads";
import { cancelOutbox } from "./outboxCancel";

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
async function seedAttempt(
  db: TestDb,
  acctId: string,
  opts: { status: string; claimToken?: string | null; sentAt?: string | null },
): Promise<string> {
  const row = (
    await db.execute(sql`
      INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload, status, claim_token, sent_at)
      VALUES (gen_random_uuid(), gen_random_uuid()::text, ${acctId}, '{"subject":"Q","to":["a@y.com"]}'::jsonb,
              ${opts.status}, ${opts.claimToken ?? null}, ${opts.sentAt ?? null})
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

describe("cancel outbox", () => {
  it("deletes an unsent, unclaimed pending attempt", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const id = await seedAttempt(db, acctId, { status: "pending" });
      const res = await cancelOutbox(db, { actor: actorOf(owner.id), attemptId: id }, SIG());
      expect(res.ok).toBe(true);
      expect(await listOutbox(db, actorOf(owner.id), SIG())).toHaveLength(0);
    });
  });

  it("refuses a claimed attempt with E_GMAIL_017", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const id = await seedAttempt(db, acctId, {
        status: "sending",
        claimToken: "11111111-1111-1111-1111-111111111111",
      });
      const res = await cancelOutbox(db, { actor: actorOf(owner.id), attemptId: id }, SIG());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_017");
    });
  });

  it("returns E_GMAIL_016 for a non-owned or missing attempt", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const id = await seedAttempt(db, acctId, { status: "pending" });
      const res = await cancelOutbox(db, { actor: actorOf(other.id), attemptId: id }, SIG());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_016");
    });
  });
});
