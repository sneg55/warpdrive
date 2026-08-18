// Integration tests for the single-message read. Real Postgres via withTestDb. An invisible
// message is indistinguishable from a missing one (404-on-invisible), matching getThread.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { getMessage } from "./messageReads";

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

async function seedAccount(db: TestDb, ownerId: string, email = "o@example.com"): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
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

describe("getMessage", () => {
  it("returns a sanitized body, attachments and tracking for a visible message", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct });
      const msgId = await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "Hello",
        sentAt: "2026-08-02T10:00:00Z",
      });
      await db.execute(sql`
        UPDATE email_messages SET body_html = '<p onclick="x()">hi</p>' WHERE id = ${msgId}
      `);

      const r = await getMessage(
        db,
        { actor: actorOf(owner.id, "admin"), messageId: msgId, allowRemote: false },
        SIG(),
      );

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.messageId).toBe(msgId);
      expect(r.value.bodyHtml).toContain("hi");
      expect(r.value.bodyHtml).not.toContain("onclick");
      expect(r.value.attachments).toEqual([]);
      expect(r.value.tracking).toEqual([]);
    });
  });

  it("falls back to the text part when there is no html body", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, { accountId: acct });
      const msgId = await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "Text",
        sentAt: null,
      });
      await db.execute(sql`
        UPDATE email_messages SET body_html = NULL, body_text = 'plain body' WHERE id = ${msgId}
      `);

      const r = await getMessage(
        db,
        { actor: actorOf(owner.id, "admin"), messageId: msgId, allowRemote: false },
        SIG(),
      );

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.bodyHtml).toContain("plain body");
    });
  });

  it("returns E_GMAIL_026 for a message on a thread the actor cannot see", async () => {
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

      const r = await getMessage(
        db,
        { actor: actorOf(other.id), messageId: msgId, allowRemote: false },
        SIG(),
      );

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_GMAIL_026");
    });
  });

  it("carries the mailbox account and address so a reply can be composed", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });
      const acct = await seedAccount(db, owner.id, "owner@example.com");
      const threadId = await seedThread(db, { accountId: acct });
      const msgId = await seedMessage(db, {
        threadId,
        accountId: acct,
        subject: "R",
        sentAt: null,
      });

      const r = await getMessage(
        db,
        { actor: actorOf(owner.id, "admin"), messageId: msgId, allowRemote: false },
        SIG(),
      );

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.accountId).toBe(acct);
      expect(r.value.ownerEmail).toBe("owner@example.com");
    });
  });

  it("returns E_GMAIL_026 for a message id that does not exist", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { isAdmin: true });

      const r = await getMessage(
        db,
        {
          actor: actorOf(owner.id, "admin"),
          messageId: "00000000-0000-0000-0000-000000000000",
          allowRemote: false,
        },
        SIG(),
      );

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_GMAIL_026");
    });
  });
});
