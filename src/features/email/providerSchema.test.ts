import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

type Db = Parameters<typeof seedUser>[0];

async function insertAccount(db: Db, columns: string): Promise<void> {
  try {
    await db.execute(sql.raw(`INSERT INTO email_accounts ${columns}`));
  } catch (e) {
    const cause = e instanceof Error ? e.cause : undefined;
    throw cause instanceof Error ? cause : e;
  }
}

describe("email provider columns", () => {
  it("rejects an agentic personal mailbox", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      await expect(
        insertAccount(
          db,
          `(user_id, email_address, kind, provider, provider_base_url, provider_credentials_enc)
           VALUES ('${u.id}', 'a@example.com', 'personal', 'agentic_inbox', 'https://x.test', decode('de','hex'))`,
        ),
      ).rejects.toThrow(/email_account_agentic_team_only/);
    });
  });

  it("rejects a connected agentic mailbox without credentials", async () => {
    await withTestDb(async (db) => {
      await expect(
        insertAccount(
          db,
          `(email_address, kind, provider, status, provider_base_url)
           VALUES ('b@example.com', 'team', 'agentic_inbox', 'connected', 'https://x.test')`,
        ),
      ).rejects.toThrow(/email_account_agentic_connected_requires_credentials/);
    });
  });

  it("allows a disconnected agentic mailbox with null credentials", async () => {
    await withTestDb(async (db) => {
      await insertAccount(
        db,
        `(email_address, kind, provider, status)
         VALUES ('c@example.com', 'team', 'agentic_inbox', 'disconnected')`,
      );
      const r = await db.execute(
        sql`SELECT provider FROM email_accounts WHERE email_address = 'c@example.com'`,
      );
      expect((r.rows[0] as { provider: string }).provider).toBe("agentic_inbox");
    });
  });

  it("rejects a gmail row with a base url", async () => {
    await withTestDb(async (db) => {
      await expect(
        insertAccount(
          db,
          `(email_address, kind, provider, provider_base_url)
           VALUES ('d@example.com', 'team', 'gmail', 'https://x.test')`,
        ),
      ).rejects.toThrow(/email_account_gmail_no_provider_fields/);
    });
  });

  it("existing rows default to gmail", async () => {
    await withTestDb(async (db) => {
      await insertAccount(db, `(email_address, kind) VALUES ('e@example.com', 'team')`);
      const r = await db.execute(
        sql`SELECT provider, provider_cursor FROM email_accounts WHERE email_address = 'e@example.com'`,
      );
      const row = r.rows[0] as { provider: string; provider_cursor: string | null };
      expect(row.provider).toBe("gmail");
      expect(row.provider_cursor).toBeNull();
    });
  });

  it("accepts the waiting_for_limit send status with next_attempt_at", async () => {
    await withTestDb(async (db) => {
      await insertAccount(db, `(email_address, kind) VALUES ('f@example.com', 'team')`);
      await db.execute(sql`
        INSERT INTO email_send_attempts
          (idempotency_key, message_id_header, account_id, payload, status, next_attempt_at)
        SELECT gen_random_uuid(), '<m@x>', id, '{}'::jsonb, 'waiting_for_limit', now()
        FROM email_accounts WHERE email_address = 'f@example.com'
      `);
      const r = await db.execute(sql`SELECT next_attempt_at FROM email_send_attempts`);
      expect((r.rows[0] as { next_attempt_at: Date | null }).next_attempt_at).not.toBeNull();
    });
  });
});
