// Integration tests for the message-level record reads. Real Postgres via withTestDb.
// Visibility runs through the same canSeeEmail rule the Inbox and the thread reads use.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { createCaller } from "@/server/trpc/root";
import { listMessagesForContact, listMessagesForDeal } from "./entityMessageReads";

const SIG = (): AbortSignal => new AbortController().signal;

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

function actorOf(id: string, type: "regular" | "admin" = "regular"): PermSetUser {
  return {
    id,
    type,
    isActive: true,
    flags: new Set<PermissionFlagKey>(),
    groupIds: new Set<string>(),
  };
}

function callerFor(db: TestDb, actor: PermSetUser) {
  return createCaller({
    db,
    session: { userId: actor.id, sessionId: "test-session" },
    // Context actor carries display fields (used only by the app shell); placeholders here.
    actor: { ...actor, name: "Test User", email: "test@example.com", avatarUrl: null },
  });
}

async function seedAccount(db: TestDb, ownerId: string, email = "o@example.com"): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

async function seedAllDeal(db: TestDb, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedAllDeal: no stage");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all') RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

async function seedThread(
  db: TestDb,
  args: { accountId: string; dealId?: string; personId?: string; visibility?: string },
): Promise<string> {
  const row = (
    await db.execute(sql`
      INSERT INTO email_threads (account_id, gmail_thread_id, subject, visibility, deal_id, person_id, last_message_at)
      VALUES (${args.accountId}, ${`gt-${Math.random()}`}, 'Follow up', ${args.visibility ?? "shared"},
              ${args.dealId ?? null}, ${args.personId ?? null}, now())
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

async function seedMessage(
  db: TestDb,
  args: { threadId: string; accountId: string; subject: string; sentAt: string | null },
): Promise<string> {
  const row = (
    await db.execute(sql`
      INSERT INTO email_messages
        (thread_id, account_id, gmail_message_id, direction, from_email, from_name,
         to_emails, cc_emails, subject, snippet, body_html, sent_at)
      VALUES (${args.threadId}, ${args.accountId}, ${`gm-${Math.random()}`}, 'inbound',
              'them@example.com', 'Them', '["o@example.com"]'::jsonb, '[]'::jsonb,
              ${args.subject}, 'a snippet', '<p>body</p>', ${args.sentAt})
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

describe("listMessagesForDeal", () => {
  it("returns one row per message, newest first, with no body", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct, dealId });
      await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "Older",
        sentAt: "2026-08-01T10:00:00Z",
      });
      await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "Newer",
        sentAt: "2026-08-02T10:00:00Z",
      });

      const rows = await listMessagesForDeal(
        db,
        { actor: actorOf(owner.id, "admin"), dealId },
        SIG(),
      );

      expect(rows.map((r) => r.subject)).toEqual(["Newer", "Older"]);
      expect(rows[0]).toMatchObject({
        threadId,
        snippet: "a snippet",
        hasAttachment: false,
        canCompose: true,
      });
      expect(rows[0]).not.toHaveProperty("bodyHtml");
    });
  });

  it("omits a thread the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const acct = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct, dealId, visibility: "private" });
      await seedMessage(db, { threadId, accountId: acct, subject: "Secret", sentAt: null });

      const mine = await listMessagesForDeal(db, { actor: actorOf(owner.id), dealId }, SIG());
      const theirs = await listMessagesForDeal(db, { actor: actorOf(other.id), dealId }, SIG());

      expect(mine).toHaveLength(1);
      expect(theirs).toHaveLength(0);
    });
  });

  it("keeps an owner-archived thread but drops a trashed one", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      const archived = await seedThread(db, { accountId: acct, dealId });
      const trashed = await seedThread(db, { accountId: acct, dealId });
      await db.execute(sql`UPDATE email_threads SET archived_at = now() WHERE id = ${archived}`);
      await db.execute(sql`UPDATE email_threads SET trashed_at = now() WHERE id = ${trashed}`);
      await seedMessage(db, {
        threadId: archived,
        accountId: acct,
        subject: "Archived",
        sentAt: null,
      });
      await seedMessage(db, {
        threadId: trashed,
        accountId: acct,
        subject: "Trashed",
        sentAt: null,
      });

      const rows = await listMessagesForDeal(
        db,
        { actor: actorOf(owner.id, "admin"), dealId },
        SIG(),
      );

      expect(rows.map((r) => r.subject)).toEqual(["Archived"]);
    });
  });

  it("reports canCompose false for a non-owner viewing a shared thread", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct, dealId, visibility: "shared" });
      await seedMessage(db, { threadId, accountId: acct, subject: "Shared", sentAt: null });

      const rows = await listMessagesForDeal(
        db,
        { actor: actorOf(viewer.id, "admin"), dealId },
        SIG(),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.canCompose).toBe(false);
    });
  });

  it("flags a message that has an attachment", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct, dealId });
      const msgId = await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "With file",
        sentAt: null,
      });
      await db.execute(sql`
        INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
        VALUES (${msgId}, ${acct}, 'ga1', 'invoice.pdf', 'application/pdf', 100)
      `);

      const rows = await listMessagesForDeal(
        db,
        { actor: actorOf(owner.id, "admin"), dealId },
        SIG(),
      );

      expect(rows[0]?.hasAttachment).toBe(true);
    });
  });
});

describe("listMessagesForContact", () => {
  it("returns messages for threads linked to the person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const person = (
        await db.execute(sql`
          INSERT INTO persons (name, owner_id, visibility_level)
          VALUES ('Steve', ${owner.id}, 'all') RETURNING id
        `)
      ).rows[0] as { id: string };
      const threadId = await seedThread(db, { accountId: acct, personId: person.id });
      await seedMessage(db, { threadId, accountId: acct, subject: "Hi Steve", sentAt: null });

      const rows = await listMessagesForContact(
        db,
        { actor: actorOf(owner.id, "admin"), personId: person.id },
        SIG(),
      );

      expect(rows.map((r) => r.subject)).toEqual(["Hi Steve"]);
    });
  });
});

describe("email router message procedures", () => {
  it("serves listMessagesForDeal and message.get through the caller", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct, dealId });
      const msgId = await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "Via caller",
        sentAt: null,
      });

      const caller = callerFor(db, actorOf(owner.id, "admin"));
      const list = await caller.email.listMessagesForDeal({ dealId });
      const one = await caller.email.message.get({ messageId: msgId, allowRemote: false });

      expect(list.map((r) => r.subject)).toEqual(["Via caller"]);
      expect(one.messageId).toBe(msgId);
      expect(one.bodyHtml).toContain("body");
    });
  });

  it("maps an invisible message to NOT_FOUND rather than leaking existence", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const acct = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct, visibility: "private" });
      const msgId = await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "Secret",
        sentAt: null,
      });

      const caller = callerFor(db, actorOf(other.id));

      await expect(
        caller.email.message.get({ messageId: msgId, allowRemote: false }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
