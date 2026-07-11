import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { setThreadVisibility } from "./threadVisibility";

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
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, last_message_at)
          VALUES ('t1', ${acctId}, 'private', 'S', now()) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return t.id;
}
async function readVisibility(db: TestDb, threadId: string): Promise<string> {
  const row = (await db.execute(sql`SELECT visibility FROM email_threads WHERE id=${threadId}`))
    .rows[0] as { visibility: string };
  return row.visibility;
}

describe("setThreadVisibility", () => {
  it("owner can flip a thread from private to shared", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);

      const res = await setThreadVisibility(
        db,
        { actor: actorOf(owner.id), threadId, visibility: "shared" },
        SIG(),
      );
      expect(res.ok).toBe(true);
      expect(await readVisibility(db, threadId)).toBe("shared");
    });
  });

  // A non-owner who CANNOT see the thread (private, not theirs) must get the same not-found
  // response as a missing id: returning E_PERM_001 here would confirm the thread exists to a
  // non-owner (existence oracle), breaking the 404-on-invisible mailbox privacy pattern.
  it("a non-owner who cannot see a private thread gets not-found, unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId);

      const res = await setThreadVisibility(
        db,
        { actor: actorOf(other.id), threadId, visibility: "shared" },
        SIG(),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_011");
      expect(await readVisibility(db, threadId)).toBe("private");
    });
  });

  // A non-owner who CAN see the thread (shared, linked to a visible-to-all person) legitimately
  // knows it exists, so the owner-only mutation returns the distinct permission error, not 404.
  it("a non-owner who can see a shared thread gets E_PERM_001, unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const person = (
        await db.execute(
          sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
              VALUES ('Ada', 'ada@x.com', ${owner.id}, 'all') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const threadId = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id, visibility, person_id, subject, last_message_at)
              VALUES ('t2', ${acctId}, 'shared', ${person.id}, 'S', now()) RETURNING id`,
        )
      ).rows[0] as { id: string };

      const res = await setThreadVisibility(
        db,
        { actor: actorOf(other.id), threadId: threadId.id, visibility: "private" },
        SIG(),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_PERM_001");
      expect(await readVisibility(db, threadId.id)).toBe("shared");
    });
  });
});
