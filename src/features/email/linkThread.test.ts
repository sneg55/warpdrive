import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { applyThreadLink } from "./linkThread";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function actorOf(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
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

async function seedThread(db: TestDb, accountId: string, visibility = "private"): Promise<string> {
  const thr = (
    await db.execute(sql`
      INSERT INTO email_threads (gmail_thread_id, account_id, visibility)
      VALUES ('t1', ${accountId}, ${visibility}) RETURNING id
    `)
  ).rows[0] as { id: string };
  return thr.id;
}

// Seed a deal in a pipeline RESTRICTED to a visibility group, so a non-member actor is
// blocked by the pipeline-restriction hard gate regardless of the deal's own visibility.
async function seedRestrictedDeal(db: TestDb, ownerId: string): Promise<string> {
  const group = (
    await db.execute(sql`INSERT INTO visibility_groups (name) VALUES ('restricted') RETURNING id`)
  ).rows[0] as { id: string };
  const pipeline = (
    await db.execute(
      sql`INSERT INTO pipelines (name, visibility_group_id) VALUES ('Restricted', ${group.id}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const stage = (
    await db.execute(
      sql`INSERT INTO stages (name, pipeline_id, "order") VALUES ('S1', ${pipeline.id}, 0) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const deal = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Restricted deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return deal.id;
}

describe("applyThreadLink", () => {
  it("rejects linking a deal in a pipeline the actor cannot see (E_PERM_001)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      // A separate user owns the restricted deal so the actor is neither deal owner nor
      // pipeline-group member; the pipeline-restriction gate blocks them.
      const dealOwner = await seedUser(db, { email: "d@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId); // owner sees own private thread
      const dealId = await seedRestrictedDeal(db, dealOwner.id);

      const r = await applyThreadLink(db, { actor: actorOf(owner.id), threadId, dealId }, SIG());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_PERM_001");
      // No link was written.
      const row = (await db.execute(sql`SELECT deal_id FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { deal_id: string | null };
      expect(row.deal_id).toBeNull();
    });
  });

  it("rejects linking a thread the actor cannot see (E_GMAIL_011)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId, "private"); // owned by owner

      const r = await applyThreadLink(
        db,
        { actor: actorOf(other.id), threadId, personId: null },
        SIG(),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_011");
    });
  });

  // F10: a shared thread is VISIBLE to a non-owner who can see the linked record, but only
  // the mailbox owner may MUTATE its links. A visible non-owner must be denied.
  it("denies a non-owner from relinking a shared thread they can see (E_PERM_001)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const viewer = await seedUser(db, { email: "v@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const p1 = (
        await db.execute(sql`
          INSERT INTO persons (name, primary_email, owner_id, visibility_level)
          VALUES ('Jane','jane@acme.com',${owner.id},'all') RETURNING id
        `)
      ).rows[0] as { id: string };
      // Shared thread linked to an all-visible person: `viewer` can SEE it via canSeeEmail.
      const threadId = (
        (
          await db.execute(sql`
          INSERT INTO email_threads (gmail_thread_id, account_id, visibility, person_id)
          VALUES ('ts1', ${acctId}, 'shared', ${p1.id}) RETURNING id
        `)
        ).rows[0] as { id: string }
      ).id;
      const p2 = (
        await db.execute(sql`
          INSERT INTO persons (name, primary_email, owner_id, visibility_level)
          VALUES ('Bob','bob@acme.com',${viewer.id},'all') RETURNING id
        `)
      ).rows[0] as { id: string };

      const r = await applyThreadLink(
        db,
        { actor: actorOf(viewer.id), threadId, personId: p2.id },
        SIG(),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_PERM_001");
      // The link must be unchanged.
      const row = (await db.execute(sql`SELECT person_id FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { person_id: string | null };
      expect(row.person_id).toBe(p1.id);
    });
  });

  it("links the thread to a visible person (happy path)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const threadId = await seedThread(db, acctId, "private");
      const person = (
        await db.execute(sql`
          INSERT INTO persons (name, primary_email, owner_id, visibility_level)
          VALUES ('Jane','jane@acme.com',${owner.id},'all') RETURNING id
        `)
      ).rows[0] as { id: string };

      const r = await applyThreadLink(
        db,
        { actor: actorOf(owner.id), threadId, personId: person.id },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.threadId).toBe(threadId);

      const row = (await db.execute(sql`SELECT person_id FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { person_id: string | null };
      expect(row.person_id).toBe(person.id);
    });
  });
});
