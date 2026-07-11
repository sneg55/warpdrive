import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { listInbox } from "./router";

// Regression: the Inbox list "sender" column led with the LATEST message's sender, which for a
// thread the owner sent is the owner themselves. Pipedrive leads each row with the COUNTERPARTY
// (the other party / linked contact), so an inbox of sent mail showed "me" on every row.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function actorOf(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

async function seedAccount(
  db: TestDb,
  ownerId: string,
  email = "me@gunsnation.com",
): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("inbox list correspondent (counterparty, not self)", () => {
  it("shows the recipient for an outbound-only thread, not the mailbox owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, last_message_at) VALUES ('t1', ${acctId}, now()) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES (${thr.id}, ${acctId}, 'm1', 'outbound', 'me@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now())
      `);

      const rows = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row?.senderEmail).toBe("client@acme.com");
      expect(row?.senderName ?? row?.senderEmail).not.toBe("me@gunsnation.com");
    });
  });

  it("shows the inbound sender when the counterparty has replied", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, last_message_at) VALUES ('t1', ${acctId}, now()) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES
          (${thr.id}, ${acctId}, 'm1', 'outbound', 'me@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now() - interval '1 hour'),
          (${thr.id}, ${acctId}, 'm2', 'inbound', 'client@acme.com', 'Ada Client', '["me@gunsnation.com"]'::jsonb, now())
      `);

      const rows = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      const row = rows[0];
      expect(row?.senderEmail).toBe("client@acme.com");
      expect(row?.senderName).toBe("Ada Client");
    });
  });

  it("prefers the linked contact's name over the raw address", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const person = (
        await db.execute(
          sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level) VALUES ('Acme Client', 'client@acme.com', ${owner.id}, 'all') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, person_id, last_message_at) VALUES ('t1', ${acctId}, ${person.id}, now()) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, sent_at)
        VALUES (${thr.id}, ${acctId}, 'm1', 'outbound', 'me@gunsnation.com', 'Me', '["client@acme.com"]'::jsonb, now())
      `);

      const rows = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      expect(rows[0]?.senderName).toBe("Acme Client");
    });
  });
});
