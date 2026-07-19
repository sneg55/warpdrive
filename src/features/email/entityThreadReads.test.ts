// Integration tests for the "threads for a deal / contact" reads and their tRPC procedures.
// Real Postgres via withTestDb; visibility is enforced through the same canSeeEmail rules
// the Inbox uses (owner sees own private+shared; a non-owner only sees a shared thread whose
// linked deal/person they can see).
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { createCaller } from "@/server/trpc/root";

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
    actor: { ...actor, name: "Test User", avatarUrl: null },
  });
}

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

async function seedAllPerson(db: TestDb, ownerId: string): Promise<string> {
  const row = (
    await db.execute(sql`
      INSERT INTO persons (name, primary_email, owner_id, visibility_level)
      VALUES ('Jane', 'jane@acme.com', ${ownerId}, 'all') RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

describe("email.forDeal", () => {
  it("returns threads linked to the deal for the mailbox owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, deal_id, last_message_at)
        VALUES
          ('t1', ${acctId}, 'shared', 'Linked', ${dealId}, now()),
          ('t2', ${acctId}, 'shared', 'Other', NULL, now())
      `);

      const out = await callerFor(db, actorOf(owner.id)).email.forDeal({ dealId });
      expect(out.map((t) => t.subject)).toEqual(["Linked"]);
    });
  });

  it("preserves newest-first ordering across the parallelized visibility filter", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      // Insert out of order; last_message_at (not insert order) defines the newest-first result.
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, deal_id, last_message_at)
        VALUES
          ('t2', ${acctId}, 'shared', 'Middle', ${dealId}, '2026-06-02T00:00:00Z'),
          ('t3', ${acctId}, 'shared', 'Oldest', ${dealId}, '2026-06-01T00:00:00Z'),
          ('t1', ${acctId}, 'shared', 'Newest', ${dealId}, '2026-06-03T00:00:00Z')
      `);

      const out = await callerFor(db, actorOf(owner.id)).email.forDeal({ dealId });
      expect(out.map((t) => t.subject)).toEqual(["Newest", "Middle", "Oldest"]);
    });
  });

  it("surfaces follow_up_status and labels instead of always reporting null/[]", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads
          (gmail_thread_id, account_id, visibility, subject, deal_id, last_message_at, follow_up_status, labels)
        VALUES
          ('t1', ${acctId}, 'shared', 'Linked', ${dealId}, now(), 'important', ARRAY['to_do'])
      `);

      const out = await callerFor(db, actorOf(owner.id)).email.forDeal({ dealId });
      expect(out[0]?.followUpStatus).toBe("important");
      expect(out[0]?.labels).toEqual(["to_do"]);
    });
  });

  it("lets a non-owner see a shared thread linked to a deal they can see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, deal_id, last_message_at)
        VALUES ('t1', ${acctId}, 'shared', 'Linked', ${dealId}, now())
      `);

      const out = await callerFor(db, actorOf(other.id)).email.forDeal({ dealId });
      expect(out.map((t) => t.subject)).toEqual(["Linked"]);
    });
  });

  it("hides a PRIVATE thread linked to the deal from a non-owner (visibility enforced)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const dealId = await seedAllDeal(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, deal_id, last_message_at)
        VALUES ('t1', ${acctId}, 'private', 'Secret', ${dealId}, now())
      `);

      const ownerView = await callerFor(db, actorOf(owner.id)).email.forDeal({ dealId });
      const otherView = await callerFor(db, actorOf(other.id)).email.forDeal({ dealId });
      expect(ownerView.map((t) => t.subject)).toEqual(["Secret"]);
      expect(otherView).toHaveLength(0);
    });
  });
});

describe("email.forContact", () => {
  it("returns threads linked to the person for the mailbox owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const personId = await seedAllPerson(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, person_id, last_message_at)
        VALUES
          ('t1', ${acctId}, 'shared', 'ToJane', ${personId}, now()),
          ('t2', ${acctId}, 'shared', 'ToNoOne', NULL, now())
      `);

      const out = await callerFor(db, actorOf(owner.id)).email.forContact({ personId });
      expect(out.map((t) => t.subject)).toEqual(["ToJane"]);
    });
  });

  it("hides a PRIVATE thread linked to the person from a non-owner (visibility enforced)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const personId = await seedAllPerson(db, owner.id);
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, visibility, subject, person_id, last_message_at)
        VALUES ('t1', ${acctId}, 'private', 'Secret', ${personId}, now())
      `);

      const otherView = await callerFor(db, actorOf(other.id)).email.forContact({ personId });
      expect(otherView).toHaveLength(0);
    });
  });
});
