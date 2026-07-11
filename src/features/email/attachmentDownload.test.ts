// Integration test; real DB for authz (per CLAUDE.md, no mocking), fake Gmail client for
// the byte fetch (the network call is never made from a test).
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { ok } from "@/types/result";
import { resolveAttachmentDownload } from "./attachmentDownload";
import { FakeGmailClient } from "./gmailFake";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedThreadWithAttachment(
  db: TestDb,
  ownerId: string,
): Promise<{ accountId: string; attachmentId: string }> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${`${ownerId}@ex.com`}) RETURNING id`,
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
      VALUES (${thr.id}, ${acct.id}, 'g1', 'inbound', 'a@y.com', '<p>hi</p>')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  const att = (
    await db.execute(sql`
      INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
      VALUES (${msg.id}, ${acct.id}, 'a1', 'invoice.pdf', 'application/pdf', 88190)
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return { accountId: acct.id, attachmentId: att.id };
}

function fakeClientWithBytes(bytes: Buffer): FakeGmailClient {
  const fake = new FakeGmailClient();
  fake.getAttachment = (a) => {
    fake.calls.push({ method: "getAttachment", args: a });
    return Promise.resolve(ok({ dataBase64: bytes.toString("base64url") }));
  };
  return fake;
}

describe("resolveAttachmentDownload", () => {
  it("the mailbox owner can download: fetches bytes via the injected Gmail client using the stored gmail ids", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@ex.com" });
      const { accountId, attachmentId } = await seedThreadWithAttachment(db, owner.id);
      const bytes = Buffer.from("hello-pdf-bytes");
      const fake = fakeClientWithBytes(bytes);

      const r = await resolveAttachmentDownload(
        db,
        { resolveClient: () => Promise.resolve(ok(fake)) },
        { actor: actorOf(owner.id), attachmentId },
        SIG(),
      );

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.filename).toBe("invoice.pdf");
        expect(r.value.mimeType).toBe("application/pdf");
        expect(r.value.bytes.equals(bytes)).toBe(true);
      }
      expect(fake.calls[0]).toMatchObject({
        method: "getAttachment",
        args: { messageId: "g1", attachmentId: "a1" },
      });
      expect(accountId).toBeTruthy();
    });
  });

  it("a stranger to a private thread is denied with E_GMAIL_012 (attachment not found, no existence leak)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner2@ex.com" });
      const stranger = await seedUser(db, { email: "stranger@ex.com" });
      const { attachmentId } = await seedThreadWithAttachment(db, owner.id);
      const fake = fakeClientWithBytes(Buffer.from("x"));

      const r = await resolveAttachmentDownload(
        db,
        { resolveClient: () => Promise.resolve(ok(fake)) },
        { actor: actorOf(stranger.id), attachmentId },
        SIG(),
      );

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_012");
      expect(fake.calls).toEqual([]); // never touches Gmail for a denied actor
    });
  });

  it("an unknown attachmentId (well-formed uuid) is denied with E_GMAIL_012", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner3@ex.com" });
      const fake = fakeClientWithBytes(Buffer.from("x"));

      const r = await resolveAttachmentDownload(
        db,
        { resolveClient: () => Promise.resolve(ok(fake)) },
        { actor: actorOf(owner.id), attachmentId: "00000000-0000-0000-0000-000000000000" },
        SIG(),
      );

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_012");
    });
  });

  it("a malformed attachmentId is rejected at the boundary with E_GMAIL_020, never reaching the DB", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner4@ex.com" });
      const fake = fakeClientWithBytes(Buffer.from("x"));

      const r = await resolveAttachmentDownload(
        db,
        { resolveClient: () => Promise.resolve(ok(fake)) },
        { actor: actorOf(owner.id), attachmentId: "not-a-uuid" },
        SIG(),
      );

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_020");
    });
  });
});
