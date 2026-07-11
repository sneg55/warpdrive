// Integration test; real DB (per CLAUDE.md, no mocked database).
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { attachmentsForMessages } from "./attachmentReads";

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

async function seedMessageWithAttachment(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
): Promise<{ messageId: string }> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('o@gunsnation.com','O','sub-o') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id}, 'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const thr = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acct.id}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const msg = (
    await db.execute(sql`
      INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html)
      VALUES (${thr.id}, ${acct.id}, 'm1', 'inbound', 'a@y.com', '<p>hi</p>')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  await db.execute(sql`
    INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
    VALUES (${msg.id}, ${acct.id}, 'a1', 'invoice.pdf', 'application/pdf', 88190)
  `);
  return { messageId: msg.id };
}

describe("attachmentsForMessages", () => {
  it("returns attachment metadata keyed by messageId, sizeBytes coerced to number", async () => {
    await withTestDb(async (db) => {
      const { messageId } = await seedMessageWithAttachment(db);

      const m = await attachmentsForMessages(db, [messageId], SIG());

      expect(m.get(messageId)?.[0]).toMatchObject({
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 88190,
      });
      expect(typeof m.get(messageId)?.[0]?.sizeBytes).toBe("number");
    });
  });

  it("returns an empty map when a message has no attachments", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('o2@gunsnation.com','O','sub-o2') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id}, 'o2@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t2', ${acct.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      const msg = (
        await db.execute(sql`
          INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html)
          VALUES (${thr.id}, ${acct.id}, 'm2', 'inbound', 'a@y.com', '<p>hi</p>')
          RETURNING id
        `)
      ).rows[0] as { id: string };

      const m = await attachmentsForMessages(db, [msg.id], SIG());
      expect(m.get(msg.id) ?? []).toEqual([]);
    });
  });

  it("returns an empty map for an empty messageIds list (no query issued)", async () => {
    await withTestDb(async (db) => {
      const m = await attachmentsForMessages(db, [], SIG());
      expect(m.size).toBe(0);
    });
  });
});
