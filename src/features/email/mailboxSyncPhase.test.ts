import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createCaller } from "@/server/trpc/root";
import { readMailboxSyncPhase } from "./mailboxSyncPhase";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

async function personal(db: TestDb, userId: string, set: string): Promise<string> {
  const row = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${`${userId}@gunsnation.com`}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  await db.execute(sql.raw(`UPDATE email_accounts SET ${set} WHERE id='${row.id}'`));
  return row.id;
}

async function addThread(db: TestDb, accountId: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, archived_at) VALUES ('g1', ${accountId}, 'S', now(), now())`,
  );
}

describe("readMailboxSyncPhase", () => {
  it("is syncing while the first sync has not landed", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "s@gunsnation.com" });
      await personal(db, u.id, "last_sync_at=NULL");
      expect(await readMailboxSyncPhase(db, { actorId: u.id }, SIG())).toBe("syncing");
    });
  });

  it("is failed, not syncing, when the first sync failed, so a broken mailbox never spins forever", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "s@gunsnation.com" });
      await personal(db, u.id, "last_sync_at=NULL, last_error_id='E_GMAIL_001'");
      expect(await readMailboxSyncPhase(db, { actorId: u.id }, SIG())).toBe("failed");
    });
  });

  it("is awaitingMail once synced while the mailbox has never stored a thread", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "s@gunsnation.com" });
      await personal(db, u.id, "last_sync_at=now(), last_history_id='1'");
      expect(await readMailboxSyncPhase(db, { actorId: u.id }, SIG())).toBe("awaitingMail");
    });
  });

  it("is ready once the mailbox holds any thread, archived ones included", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "s@gunsnation.com" });
      const id = await personal(db, u.id, "last_sync_at=now(), last_history_id='1'");
      await addThread(db, id);
      expect(await readMailboxSyncPhase(db, { actorId: u.id }, SIG())).toBe("ready");
    });
  });

  it("is ready when the actor has no connected mailbox", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "s@gunsnation.com" });
      expect(await readMailboxSyncPhase(db, { actorId: u.id }, SIG())).toBe("ready");
      await personal(db, u.id, "last_sync_at=NULL, status='disconnected'");
      expect(await readMailboxSyncPhase(db, { actorId: u.id }, SIG())).toBe("ready");
    });
  });

  it("is served by email.mailboxSyncPhase for the calling actor", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "s@gunsnation.com" });
      await personal(db, u.id, "last_sync_at=NULL");
      const caller = createCaller({
        db,
        session: { userId: u.id, sessionId: "test-session" },
        actor: {
          id: u.id,
          type: "regular",
          isActive: true,
          flags: new Set<PermissionFlagKey>(),
          groupIds: new Set<string>(),
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
      });
      expect(await caller.email.mailboxSyncPhase({})).toBe("syncing");
    });
  });

  it("keeps a team mailbox syncing while its history import runs, and only for members", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db, { email: "m@gunsnation.com" });
      const outsider = await seedUser(db, { email: "o@gunsnation.com" });
      const team = (
        await db.execute(
          sql`INSERT INTO email_accounts (kind, email_address, display_name, last_sync_at, last_history_id, backfill_days, backfill_status)
              VALUES ('team', 'team@gunsnation.com', 'Team', now(), '1', 30, 'running') RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(
        sql`INSERT INTO email_account_members (account_id, user_id) VALUES (${team.id}, ${member.id})`,
      );
      const phase = (actorId: string) =>
        readMailboxSyncPhase(db, { actorId, mailbox: team.id }, SIG());

      expect(await phase(member.id)).toBe("syncing");
      expect(await phase(outsider.id)).toBe("ready");
      await db.execute(sql`UPDATE email_accounts SET backfill_status='failed' WHERE id=${team.id}`);
      expect(await phase(member.id)).toBe("awaitingMail");
    });
  });

  it("reports a new team mailbox as failed, not syncing, once its initial sync has failed", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db, { email: "m@gunsnation.com" });
      const team = (
        await db.execute(
          sql`INSERT INTO email_accounts (kind, email_address, display_name, backfill_days)
              VALUES ('team', 'team@gunsnation.com', 'Team', 30) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(
        sql`INSERT INTO email_account_members (account_id, user_id) VALUES (${team.id}, ${member.id})`,
      );
      const phase = () => readMailboxSyncPhase(db, { actorId: member.id, mailbox: team.id }, SIG());

      expect(await phase()).toBe("syncing");
      await db.execute(
        sql`UPDATE email_accounts SET last_error_id='E_GMAIL_001' WHERE id=${team.id}`,
      );
      expect(await phase()).toBe("failed");
    });
  });
});
