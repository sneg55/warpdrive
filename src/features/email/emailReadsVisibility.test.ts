// Mailbox-visibility rules for the email reads, split out of router.test.ts (300-line cap). These
// pin THE privacy contract: a private thread is owner-only (no admin bypass, rule 675), a shared
// thread is readable by anyone who can see its linked deal/person, and the Inbox FOLDER is personal
// (owner-only) so a colleague's shared thread reaches them on the record, never in their Inbox.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThread, listInbox } from "./router";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function actorOf(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

async function seedAccount(db: TestDb, ownerId: string): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("email reads visibility", () => {
  it("a private thread is visible to the owner but not to a non-owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, last_message_at)
        VALUES ('t1', ${acctId}, 'private', 'Secret', now())
      `);

      const ownerView = (await listInbox(db, { actor: actorOf(owner.id), filter: "all" }, SIG()))
        .threads;
      const otherView = (await listInbox(db, { actor: actorOf(other.id), filter: "all" }, SIG()))
        .threads;
      expect(ownerView.length).toBe(1);
      expect(otherView.length).toBe(0);
    });
  });

  it("a shared thread linked to a visible person is readable by a non-owner but stays out of their personal Inbox", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      // A person visible to all, so the non-owner can see the thread via the shared path.
      const person = (
        await db.execute(sql`
          INSERT INTO persons (name, primary_email, owner_id, visibility_level)
          VALUES ('Jane','jane@acme.com',${owner.id},'all') RETURNING id
        `)
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(sql`
          INSERT INTO email_threads (gmail_thread_id, account_id, visibility, person_id, last_message_at)
          VALUES ('t1', ${acctId}, 'shared', ${person.id}, now()) RETURNING id
        `)
      ).rows[0] as { id: string };

      // The Inbox folder is personal: the non-owner's Inbox does NOT surface the owner's shared
      // thread. It reaches them on the linked contact record (forContact) instead.
      const otherView = (await listInbox(db, { actor: actorOf(other.id), filter: "all" }, SIG()))
        .threads;
      expect(otherView.length).toBe(0);

      // But canSeeEmail still grants read access: opening the thread (as from the record) succeeds.
      const got = await getThread(
        db,
        { actor: actorOf(other.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(got.ok).toBe(true);
    });
  });

  it("a shared thread with no visible link is NOT visible to a non-owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      // shared but unlinked: nothing for the non-owner to see through.
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, last_message_at)
        VALUES ('t1', ${acctId}, 'shared', now())
      `);

      const otherView = (await listInbox(db, { actor: actorOf(other.id), filter: "all" }, SIG()))
        .threads;
      expect(otherView.length).toBe(0);
    });
  });

  it("an ADMIN cannot see a private thread they do not own (no admin bypass, rule 675)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const admin = await seedUser(db, { email: "admin@gunsnation.com", isAdmin: true });
      const acctId = await seedAccount(db, owner.id);
      const thr = (
        await db.execute(sql`
          INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, last_message_at)
          VALUES ('t1', ${acctId}, 'private', 'Secret', now()) RETURNING id
        `)
      ).rows[0] as { id: string };

      const adminActor: AuthUser = {
        id: admin.id,
        type: "admin",
        isActive: true,
        groupIds: new Set(),
      };

      // getThread: a private thread the admin does not own is 404-on-invisible.
      const got = await getThread(
        db,
        { actor: adminActor, threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(got.ok).toBe(false);
      if (!got.ok) expect(got.error.id).toBe("E_GMAIL_011");

      // listInbox: the private non-owned thread never appears for the admin.
      const adminView = (await listInbox(db, { actor: adminActor, filter: "all" }, SIG())).threads;
      expect(adminView).toEqual([]);
    });
  });
});
