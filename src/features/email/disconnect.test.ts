import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { softDisconnectMailbox } from "./disconnect";

async function seedConnectedAccount(
  db: Parameters<typeof seedUser>[0],
  userId: string,
  email: string,
): Promise<string> {
  const r = await db.execute(sql`
    INSERT INTO email_accounts (user_id, email_address, refresh_token_enc, status)
    VALUES (${userId}, ${email}, decode('deadbeef', 'hex'), 'connected')
    RETURNING id
  `);
  return (r.rows[0] as { id: string }).id;
}

describe("softDisconnectMailbox", () => {
  it("sets status=disconnected, nulls the refresh token, and clears the error id", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const id = await seedConnectedAccount(db, u.id, "rep@example.com");
      await softDisconnectMailbox(db, id, new AbortController().signal);
      const row = (
        await db.execute(sql`
          SELECT status, refresh_token_enc, last_error_id FROM email_accounts WHERE id=${id}
        `)
      ).rows[0] as {
        status: string;
        refresh_token_enc: Buffer | null;
        last_error_id: string | null;
      };
      expect(row.status).toBe("disconnected");
      expect(row.refresh_token_enc).toBeNull();
      expect(row.last_error_id).toBeNull();
    });
  });

  it("keeps the row so FK children (threads) survive the disconnect", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const id = await seedConnectedAccount(db, u.id, "rep@example.com");
      await db.execute(
        sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t-1', ${id})`,
      );
      await softDisconnectMailbox(db, id, new AbortController().signal);
      const acct = await db.execute(sql`SELECT id FROM email_accounts WHERE id=${id}`);
      const thread = await db.execute(sql`SELECT id FROM email_threads WHERE account_id=${id}`);
      expect(acct.rows).toHaveLength(1);
      expect(thread.rows).toHaveLength(1);
    });
  });

  it("reconnect (ON CONFLICT user_id) reactivates the SAME row, not a duplicate", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const id = await seedConnectedAccount(db, u.id, "rep@example.com");
      await softDisconnectMailbox(db, id, new AbortController().signal);
      // Mirror exchangeAndBind's upsert: the same user reconnecting rebinds the same address.
      const r = await db.execute(sql`
        INSERT INTO email_accounts (user_id, email_address, refresh_token_enc, status)
        VALUES (${u.id}, 'rep@example.com', decode('feedface', 'hex'), 'connected')
        ON CONFLICT (user_id) DO UPDATE SET
          refresh_token_enc = EXCLUDED.refresh_token_enc,
          status = 'connected',
          last_error_id = NULL,
          updated_at = now()
        RETURNING id
      `);
      expect((r.rows[0] as { id: string }).id).toBe(id);
      const count = await db.execute(
        sql`SELECT count(*)::int AS n FROM email_accounts WHERE user_id=${u.id}`,
      );
      expect((count.rows[0] as { n: number }).n).toBe(1);
    });
  });
});
