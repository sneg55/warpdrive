import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { setFollowUpStatus, setThreadLabels } from "./threadAttributes";

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

describe("setFollowUpStatus / setThreadLabels", () => {
  it("owner can set and read back the follow-up status", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);
      const actor = actorOf(owner.id);

      const res = await setFollowUpStatus(db, { actor, threadId, status: "waiting" }, SIG());
      expect(res.ok).toBe(true);

      const row = (
        await db.execute(sql`SELECT follow_up_status FROM email_threads WHERE id=${threadId}`)
      ).rows[0] as { follow_up_status: string | null };
      expect(row.follow_up_status).toBe("waiting");
    });
  });

  it("owner can set and read back thread labels", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);
      const actor = actorOf(owner.id);

      const res = await setThreadLabels(db, { actor, threadId, labels: ["important"] }, SIG());
      expect(res.ok).toBe(true);

      const row = (await db.execute(sql`SELECT labels FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { labels: string[] };
      expect(row.labels).toEqual(["important"]);
    });
  });

  it("a stranger setting follow-up status on a non-owned thread gets E_GMAIL_011", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);

      const res = await setFollowUpStatus(
        db,
        { actor: actorOf(other.id), threadId, status: "waiting" },
        SIG(),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_011");
    });
  });

  it("a stranger setting labels on a non-owned thread gets E_GMAIL_011", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);

      const res = await setThreadLabels(
        db,
        { actor: actorOf(other.id), threadId, labels: ["important"] },
        SIG(),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_011");
    });
  });
});
