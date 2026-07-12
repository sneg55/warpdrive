// U4 (D1): Sent and Archive folder rows must lead with the correspondent (the counterparty),
// exactly like the Inbox projection, never with the mailbox owner's own address. Kept in its own
// file so folderReads.test.ts stays under the 300-line cap.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { listArchivedThreads, listSentThreads } from "./folderReads";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

// Owner mailbox address matches seedAccount's default (o@gunsnation.com), so the owner is "me"
// and the counterparty is any other address.
async function seedAccount(db: TestDb, ownerId: string): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("Sent correspondent projection", () => {
  it("projects the recipient (To) as correspondent, not the mailbox owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject) VALUES ('t1', ${acctId}, 'Outreach') RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES (${thread.id}, ${acctId}, 'm1', 'outbound', 'o@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now())
      `);

      const [sent] = (await listSentThreads(db, actorOf(owner.id), SIG())).threads;
      expect(sent?.senderEmail).toBe("client@acme.com");
      expect(sent?.senderName ?? sent?.senderEmail).not.toBe("o@gunsnation.com");
    });
  });

  it("projects the inbound counterparty once they have replied", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject) VALUES ('t1', ${acctId}, 'Reply') RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES
          (${thread.id}, ${acctId}, 'm1', 'outbound', 'o@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now() - interval '1 hour'),
          (${thread.id}, ${acctId}, 'm2', 'inbound', 'client@acme.com', 'Ada Client', '["o@gunsnation.com"]'::jsonb, now())
      `);

      const [sent] = (await listSentThreads(db, actorOf(owner.id), SIG())).threads;
      expect(sent?.senderEmail).toBe("client@acme.com");
      expect(sent?.senderName).toBe("Ada Client");
    });
  });
});

describe("Archive correspondent projection", () => {
  it("projects the counterparty for an outbound-only thread, not the owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, archived_at) VALUES ('t1', ${acctId}, 'Filed', now()) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES (${thread.id}, ${acctId}, 'm1', 'outbound', 'o@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now())
      `);

      const [archived] = (await listArchivedThreads(db, actorOf(owner.id), SIG())).threads;
      expect(archived?.senderEmail).toBe("client@acme.com");
      expect(archived?.senderName ?? archived?.senderEmail).not.toBe("o@gunsnation.com");
    });
  });

  it("prefers the linked contact name over the raw address", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const person = (
        await db.execute(
          sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level) VALUES ('Acme Client', 'client@acme.com', ${owner.id}, 'all') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thread = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, archived_at) VALUES ('t1', ${acctId}, 'Filed', ${person.id}, now()) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES (${thread.id}, ${acctId}, 'm1', 'outbound', 'o@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now())
      `);

      const [archived] = (await listArchivedThreads(db, actorOf(owner.id), SIG())).threads;
      expect(archived?.senderName).toBe("Acme Client");
    });
  });
});
