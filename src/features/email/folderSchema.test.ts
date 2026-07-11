import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

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

describe("Unit H additive schema", () => {
  it("email_threads.archived_at accepts a timestamp and defaults to null", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId}) RETURNING id, archived_at`,
        )
      ).rows[0] as { id: string; archived_at: string | null };
      expect(thr.archived_at).toBeNull();
      await db.execute(sql`UPDATE email_threads SET archived_at = now() WHERE id = ${thr.id}`);
      const after = (
        await db.execute(sql`SELECT archived_at FROM email_threads WHERE id = ${thr.id}`)
      ).rows[0] as { archived_at: string | null };
      expect(after.archived_at).not.toBeNull();
    });
  });

  it("email_drafts round-trips a mailbox-owned draft", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const row = (
        await db.execute(sql`
          INSERT INTO email_drafts (account_id, subject, body_html, to_emails, cc_emails)
          VALUES (${acctId}, 'hi', '<p>x</p>', '["a@y.com"]'::jsonb, '[]'::jsonb)
          RETURNING id, subject, to_emails, thread_id
        `)
      ).rows[0] as { id: string; subject: string; to_emails: unknown; thread_id: string | null };
      expect(row.subject).toBe("hi");
      expect(row.thread_id).toBeNull();
      expect(row.to_emails).toEqual(["a@y.com"]);
    });
  });
});
