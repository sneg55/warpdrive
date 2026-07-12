import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { listOutbox, listSentThreads } from "./folderReads";
import { getThread, listInbox } from "./router";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function actorOf(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

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

// Mailbox-visibility rules (private/shared/admin, and the personal-Inbox scoping) live in
// emailReadsVisibility.test.ts. This file covers thread.get content projection and folder reads.
describe("email reads", () => {
  it("thread.get returns messages newest-first with sanitized bodies", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html, sent_at)
        VALUES
          (${thr.id}, ${acctId}, 'm1', 'inbound', 'a@y.com', '<p>old</p><script>x</script>', now()-interval '1 hour'),
          (${thr.id}, ${acctId}, 'm2', 'inbound', 'a@y.com', '<p>new</p>', now())
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        const m0 = out.value.messages[0];
        const m1 = out.value.messages[1];
        expect(m0?.gmailMessageId).toBe("m2"); // newest first
        expect(m1?.bodyHtml).not.toMatch(/<script/i);
      }
    });
  });

  it("thread.get returns the mailbox owner's address and each message's cc recipients", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "reply-owner@gunsnation.com");
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, to_emails, cc_emails, body_html, sent_at)
        VALUES (${thr.id}, ${acctId}, 'm1', 'inbound', 'ann@acme.com', '["reply-owner@gunsnation.com","bob@acme.com"]'::jsonb, '["carol@acme.com"]'::jsonb, '<p>hi</p>', now())
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.value.ownerEmail).toBe("reply-owner@gunsnation.com");
        const m0 = out.value.messages[0];
        expect(m0?.toEmails).toEqual(["reply-owner@gunsnation.com", "bob@acme.com"]);
        expect(m0?.ccEmails).toEqual(["carol@acme.com"]);
      }
    });
  });

  it("thread.get surfaces a seeded inbound attachment on its message", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      const msg = (
        await db.execute(sql`
          INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html, sent_at)
          VALUES (${thr.id}, ${acctId}, 'm1', 'inbound', 'a@y.com', '<p>hi</p>', now())
          RETURNING id
        `)
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
        VALUES (${msg.id}, ${acctId}, 'a1', 'invoice.pdf', 'application/pdf', 88190)
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        const m0 = out.value.messages[0];
        expect(m0?.messageId).toBe(msg.id);
        expect(m0?.attachments).toEqual([
          expect.objectContaining({
            filename: "invoice.pdf",
            mimeType: "application/pdf",
            sizeBytes: 88190,
          }),
        ]);
      }
    });
  });

  it("thread.get returns NOT_FOUND (E_GMAIL_011) for a private thread the actor does not own", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(sql`
          INSERT INTO email_threads (gmail_thread_id, account_id, visibility) VALUES ('t1', ${acctId}, 'private') RETURNING id
        `)
      ).rows[0] as { id: string };

      const out = await getThread(
        db,
        { actor: actorOf(other.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.id).toBe("E_GMAIL_011");
    });
  });

  it("listInbox marks a thread unread until the actor has a fresh email_thread_reads row", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(sql`
          INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
          VALUES ('t1', ${acctId}, 'Renewal', now()) RETURNING id
        `)
      ).rows[0] as { id: string };
      const actor = actorOf(owner.id);

      const before = (await listInbox(db, { actor, filter: "all" }, SIG())).threads;
      expect(before[0]?.unread).toBe(true);

      await db.execute(sql`
        INSERT INTO email_thread_reads (thread_id, user_id, read_at)
        VALUES (${thr.id}, ${owner.id}, now())
      `);

      const after = (await listInbox(db, { actor, filter: "all" }, SIG())).threads;
      expect(after[0]?.unread).toBe(false);
    });
  });

  it("Sent + Outbox reads back the actor's own mailbox", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject) VALUES ('t1', ${acctId}, 'S') RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, sent_at)
        VALUES (${thr.id}, ${acctId}, 'm1', 'outbound', 'me@x.com', now())
      `);
      await db.execute(sql`
        INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload, status)
        VALUES (gen_random_uuid(), 'h1', ${acctId}, '{"subject":"Q","to":["a@y.com"]}'::jsonb, 'pending')
      `);
      const actor = actorOf(owner.id);
      expect((await listSentThreads(db, actor, SIG())).threads.map((t) => t.subject)).toEqual([
        "S",
      ]);
      expect((await listOutbox(db, actor, SIG())).map((o) => o.subject)).toEqual(["Q"]);
    });
  });
});
