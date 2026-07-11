import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThread, listInbox } from "./emailReads";
import { listArchivedThreads, listOutbox, listSentThreads } from "./folderReads";

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

describe("archive reads", () => {
  it("Inbox hides archived threads; Archive lists exactly them (owner-scoped)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, archived_at)
        VALUES
          ('active', ${acctId}, 'Active', now(), NULL),
          ('gone', ${acctId}, 'Archived', now() - interval '1 hour', now())
      `);

      const inbox = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      expect(inbox.map((t) => t.subject)).toEqual(["Active"]);

      const archived = (await listArchivedThreads(db, actorOf(owner.id), SIG())).threads;
      expect(archived.map((t) => t.subject)).toEqual(["Archived"]);
    });
  });

  it("surfaces follow_up_status and labels instead of always reporting null/[]", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads
          (gmail_thread_id, account_id, subject, last_message_at, archived_at, follow_up_status, labels)
        VALUES
          ('gone', ${acctId}, 'Archived', now(), now(), 'important', ARRAY['to_do'])
      `);

      const [archived] = (await listArchivedThreads(db, actorOf(owner.id), SIG())).threads;
      expect(archived?.followUpStatus).toBe("important");
      expect(archived?.labels).toEqual(["to_do"]);
    });
  });

  it("Archive is owner-scoped: a non-owner sees nothing", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, archived_at)
        VALUES ('gone', ${acctId}, 'Archived', now())
      `);
      const view = (await listArchivedThreads(db, actorOf(other.id), SIG())).threads;
      expect(view).toHaveLength(0);
    });
  });
});

describe("inbox sender projection", () => {
  it("projects the latest message's from_name as senderName, falling back to null", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const mk = async (gt: string, subj: string) =>
        (
          await db.execute(
            sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
                VALUES (${gt}, ${acctId}, ${subj}, now()) RETURNING id`,
          )
        ).rows[0] as { id: string };
      const named = await mk("t1", "Named");
      const bare = await mk("t2", "Bare");
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, sent_at)
        VALUES
          (${named.id}, ${acctId}, 'm1', 'inbound', 'support@scrape.do', 'Scrape.do Team', now()),
          (${bare.id}, ${acctId}, 'm2', 'inbound', 'smoke@example.com', NULL, now())
      `);

      const inbox = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      const namedRow = inbox.find((t) => t.subject === "Named");
      const bareRow = inbox.find((t) => t.subject === "Bare");
      expect(namedRow?.senderName).toBe("Scrape.do Team");
      expect(namedRow?.senderEmail).toBe("support@scrape.do");
      expect(bareRow?.senderName).toBeNull();
      expect(bareRow?.senderEmail).toBe("smoke@example.com");
    });
  });

  it("flags threads whose messages carry an attachment (hasAttachment)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const mk = async (gt: string, subj: string) =>
        (
          await db.execute(
            sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
                VALUES (${gt}, ${acctId}, ${subj}, now()) RETURNING id`,
          )
        ).rows[0] as { id: string };
      const withAtt = await mk("t1", "HasFile");
      const noAtt = await mk("t2", "NoFile");
      const msg = (
        await db.execute(sql`
          INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, sent_at)
          VALUES
            (${withAtt.id}, ${acctId}, 'm1', 'inbound', 'a@y.com', now()),
            (${noAtt.id}, ${acctId}, 'm2', 'inbound', 'b@y.com', now())
          RETURNING id, thread_id
        `)
      ).rows as { id: string; thread_id: string }[];
      const attMsg = msg.find((m) => m.thread_id === withAtt.id);
      await db.execute(sql`
        INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
        VALUES (${attMsg?.id}, ${acctId}, 'att1', 'invoice.pdf', 'application/pdf', 1234)
      `);

      const inbox = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      expect(inbox.find((t) => t.subject === "HasFile")?.hasAttachment).toBe(true);
      expect(inbox.find((t) => t.subject === "NoFile")?.hasAttachment).toBe(false);
    });
  });

  it("reader messages carry the sender's from_name", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
              VALUES ('t1', ${acctId}, 'Named', now()) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, from_name, sent_at)
        VALUES (${thread.id}, ${acctId}, 'm1', 'inbound', 'support@scrape.do', 'Scrape.do Team', now())
      `);

      const view = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thread.id, allowRemote: false },
        SIG(),
      );
      expect(view.ok).toBe(true);
      if (view.ok) expect(view.value.messages[0]?.fromName).toBe("Scrape.do Team");
    });
  });
});

describe("sent read", () => {
  it("lists threads with an outbound message, newest outbound first", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const mk = async (gt: string, subj: string) =>
        (
          await db.execute(
            sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject) VALUES (${gt}, ${acctId}, ${subj}) RETURNING id`,
          )
        ).rows[0] as { id: string };
      const older = await mk("t1", "Older");
      const newer = await mk("t2", "Newer");
      const inboundOnly = await mk("t3", "InboundOnly");
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, sent_at)
        VALUES
          (${older.id}, ${acctId}, 'm1', 'outbound', 'me@x.com', now() - interval '2 hours'),
          (${newer.id}, ${acctId}, 'm2', 'outbound', 'me@x.com', now()),
          (${inboundOnly.id}, ${acctId}, 'm3', 'inbound', 'a@y.com', now())
      `);
      const sent = (await listSentThreads(db, actorOf(owner.id), SIG())).threads;
      expect(sent.map((t) => t.subject)).toEqual(["Newer", "Older"]);
    });
  });

  it("surfaces follow_up_status and labels instead of always reporting null/[]", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const thread = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, follow_up_status, labels)
              VALUES ('t1', ${acctId}, 'Flagged', 'later', ARRAY['important']) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, sent_at)
        VALUES (${thread.id}, ${acctId}, 'm1', 'outbound', 'me@x.com', now())
      `);

      const [sent] = (await listSentThreads(db, actorOf(owner.id), SIG())).threads;
      expect(sent?.followUpStatus).toBe("later");
      expect(sent?.labels).toEqual(["important"]);
    });
  });
});

describe("outbox read", () => {
  it("lists pending/needs_review/future-scheduled, projects subject+to, excludes sent", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const attempt = async (
        status: string,
        subj: string,
        scheduled: string | null,
        errId: string | null,
      ) =>
        db.execute(sql`
          INSERT INTO email_send_attempts
            (idempotency_key, message_id_header, account_id, payload, status, scheduled_at, error_id)
          VALUES
            (gen_random_uuid(), ${subj}, ${acctId},
             ${sql.raw(`'${JSON.stringify({ subject: subj, to: ["a@y.com"] }).replace(/'/g, "''")}'::jsonb`)},
             ${status}, ${scheduled}, ${errId})
        `);
      await attempt("pending", "Queued", null, null);
      await attempt("needs_review", "Stuck", null, "E_GMAIL_004");
      await attempt("sent", "Delivered", null, null);
      const future = new Date(Date.now() + 3_600_000).toISOString();
      await attempt("pending", "Later", future, null);

      const out = await listOutbox(db, actorOf(owner.id), SIG());
      const subjects = out.map((o) => o.subject);
      expect(subjects).toContain("Queued");
      expect(subjects).toContain("Stuck");
      expect(subjects).toContain("Later");
      expect(subjects).not.toContain("Delivered");
      const stuck = out.find((o) => o.subject === "Stuck");
      expect(stuck?.errorId).toBe("E_GMAIL_004");
      expect(out.find((o) => o.subject === "Queued")?.to).toEqual(["a@y.com"]);
    });
  });
});
