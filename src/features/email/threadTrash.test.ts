import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { err } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { trashThread } from "./threadTrash";

// P4: reader Delete -> Gmail Trash. trashThread moves the real Gmail conversation (threads/{id}/trash
// keyed by the GMAIL thread id) and, only on success, stamps trashed_at so the thread leaves every
// local folder. A Gmail failure leaves trashed_at null (no local delete without the real move); a
// non-owner cannot trash and never reaches Gmail.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedThread(
  db: TestDb,
  ownerId: string,
  gmailThreadId = "gmail-t1",
): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const t = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
          VALUES (${gmailThreadId}, ${acct.id}, 'S', now()) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return t.id;
}

async function trashedAt(db: TestDb, threadId: string): Promise<string | null> {
  const r = (await db.execute(sql`SELECT trashed_at FROM email_threads WHERE id = ${threadId}`))
    .rows[0] as { trashed_at: string | null };
  return r.trashed_at;
}

describe("trashThread", () => {
  it("moves the Gmail thread by its gmail id and stamps trashed_at on success", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const threadId = await seedThread(db, owner.id, "gmail-abc");
      const gmail = new FakeGmailClient();

      const res = await trashThread(db, { actor: actorOf(owner.id), threadId, gmail }, SIG());
      expect(res.ok).toBe(true);
      // The GMAIL thread id (not our internal uuid) is what Gmail trashes.
      expect(gmail.calls).toContainEqual({
        method: "trashThread",
        args: expect.objectContaining({ threadId: "gmail-abc" }),
      });
      expect(await trashedAt(db, threadId)).not.toBeNull();
    });
  });

  it("leaves trashed_at null when the Gmail trash fails", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const threadId = await seedThread(db, owner.id);
      const gmail = new FakeGmailClient();
      gmail.trashImpl = () => err(new AppError("E_GMAIL_001", "gmail down", {}));

      const res = await trashThread(db, { actor: actorOf(owner.id), threadId, gmail }, SIG());
      expect(res.ok).toBe(false);
      expect(await trashedAt(db, threadId)).toBeNull();
    });
  });

  it("refuses a non-owner and never calls Gmail", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const threadId = await seedThread(db, owner.id);
      const gmail = new FakeGmailClient();

      const res = await trashThread(db, { actor: actorOf(other.id), threadId, gmail }, SIG());
      expect(res.ok).toBe(false);
      expect(gmail.calls).toHaveLength(0);
      expect(await trashedAt(db, threadId)).toBeNull();
    });
  });
});
