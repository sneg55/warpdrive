import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThread, listInbox } from "./emailReads";
import { listArchivedThreads } from "./folderReads";
import { archiveThread, unarchiveThread } from "./threadArchive";

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
async function seedThread(db: TestDb, acctId: string): Promise<string> {
  const t = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at) VALUES ('t1', ${acctId}, 'S', now()) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return t.id;
}

async function seedPublicPerson(db: TestDb, ownerId: string): Promise<string> {
  const p = (
    await db.execute(
      sql`INSERT INTO persons (name, owner_id, visibility_level) VALUES ('P', ${ownerId}, 'all') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return p.id;
}
async function seedSharedThread(db: TestDb, acctId: string, personId: string): Promise<string> {
  const t = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, visibility, person_id)
          VALUES ('ts', ${acctId}, 'S', now(), 'shared', ${personId}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return t.id;
}

describe("archive/unarchive", () => {
  it("archive removes from Inbox and adds to Archive; unarchive reverses it", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);
      const actor = actorOf(owner.id);

      const arch = await archiveThread(db, { actor, threadId }, SIG());
      expect(arch.ok).toBe(true);
      expect((await listInbox(db, { actor, filter: "all" }, SIG())).threads).toHaveLength(0);
      expect((await listArchivedThreads(db, actor, SIG())).threads).toHaveLength(1);

      const un = await unarchiveThread(db, { actor, threadId }, SIG());
      expect(un.ok).toBe(true);
      expect((await listInbox(db, { actor, filter: "all" }, SIG())).threads).toHaveLength(1);
      expect((await listArchivedThreads(db, actor, SIG())).threads).toHaveLength(0);
    });
  });

  it("a co-viewer never sees the owner's shared thread in their personal Inbox, and the owner's archive stays readable via getThread", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const viewer = await seedUser(db, { email: "v@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const personId = await seedPublicPerson(db, owner.id);
      const threadId = await seedSharedThread(db, acctId, personId);
      const ownerActor = actorOf(owner.id);
      const viewerActor = actorOf(viewer.id);

      // The Inbox folder is personal: the co-viewer never sees the owner's shared thread there,
      // before OR after archive (it reaches them on the linked contact record instead).
      expect(
        (await listInbox(db, { actor: viewerActor, filter: "all" }, SIG())).threads,
      ).toHaveLength(0);

      expect((await archiveThread(db, { actor: ownerActor, threadId }, SIG())).ok).toBe(true);

      // Owner archived it: gone from the owner's Inbox. archived_at is owner-local, so it does not
      // revoke the co-viewer's read access, which flows through canSeeEmail (getThread succeeds).
      expect(
        (await listInbox(db, { actor: ownerActor, filter: "all" }, SIG())).threads,
      ).toHaveLength(0);
      const got = await getThread(db, { actor: viewerActor, threadId, allowRemote: false }, SIG());
      expect(got.ok).toBe(true);
    });
  });

  it("archive of a non-owned thread returns E_GMAIL_011", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);
      const res = await archiveThread(db, { actor: actorOf(other.id), threadId }, SIG());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_011");
    });
  });
});
