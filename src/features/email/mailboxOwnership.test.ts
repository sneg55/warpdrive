import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { assertMailboxOwner, getActorMailbox, getActorMailboxStatus } from "./mailboxOwnership";

// Codex finding F5: the send action must confirm mailbox ownership BEFORE any token
// decrypt/refresh side effect. assertMailboxOwner returns the SAME error for a missing
// account and a non-owned account (no existence probing), and the address when owned.

async function seedAccount(
  db: Parameters<typeof seedUser>[0],
  userId: string,
  email: string,
): Promise<string> {
  const r = await db.execute(
    sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
  );
  return (r.rows[0] as { id: string }).id;
}

describe("assertMailboxOwner", () => {
  it("returns the address when the account belongs to the actor", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const accountId = await seedAccount(db, u.id, "me@example.com");
      const r = await assertMailboxOwner(db, accountId, u.id, new AbortController().signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.emailAddress).toBe("me@example.com");
    });
  });

  it("denies (E_PERM_001) when the account belongs to another user", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const attacker = await seedUser(db);
      const accountId = await seedAccount(db, owner.id, "owner@example.com");
      const r = await assertMailboxOwner(db, accountId, attacker.id, new AbortController().signal);
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("denies (E_PERM_001) for an unknown account id (no existence probing)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await assertMailboxOwner(db, randomUUID(), u.id, new AbortController().signal);
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });
});

describe("getActorMailbox", () => {
  it("returns the actor's connected mailbox id and address", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const accountId = await seedAccount(db, u.id, "rep@example.com");
      const box = await getActorMailbox(db, u.id, new AbortController().signal);
      expect(box).toEqual({ id: accountId, emailAddress: "rep@example.com" });
    });
  });

  it("returns null when the actor has no mailbox linked", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const box = await getActorMailbox(db, u.id, new AbortController().signal);
      expect(box).toBeNull();
    });
  });
});

describe("getActorMailboxStatus", () => {
  it("returns status, last sync, and last error for the actor's mailbox", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await db.execute(sql`
        INSERT INTO email_accounts (user_id, email_address, status, last_sync_at, last_error_id)
        VALUES (${u.id}, 'rep@example.com', 'connected', '2026-07-01T10:00:00Z', NULL)
        RETURNING id
      `);
      const id = (r.rows[0] as { id: string }).id;
      const box = await getActorMailboxStatus(db, u.id, new AbortController().signal);
      expect(box).not.toBeNull();
      expect(box?.id).toBe(id);
      expect(box?.emailAddress).toBe("rep@example.com");
      expect(box?.status).toBe("connected");
      expect(box?.lastSyncAt?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
      expect(box?.lastErrorId).toBeNull();
    });
  });

  it("returns null when the actor has no mailbox linked", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      expect(await getActorMailboxStatus(db, u.id, new AbortController().signal)).toBeNull();
    });
  });

  it("reflects a disconnected status with its error id", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      await db.execute(sql`
        INSERT INTO email_accounts (user_id, email_address, status, last_error_id)
        VALUES (${u.id}, 'rep@example.com', 'disconnected', 'E_GMAIL_002')
      `);
      const box = await getActorMailboxStatus(db, u.id, new AbortController().signal);
      expect(box?.status).toBe("disconnected");
      expect(box?.lastErrorId).toBe("E_GMAIL_002");
    });
  });
});
