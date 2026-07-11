// Guards the mailbox-privacy rule at the listInbox boundary. listInbox now hands canSeeEmail a
// pre-resolved ownerUserId (projected from its email_accounts join) instead of letting it look the
// owner up per row. That is an optimisation only: a thread in someone else's mailbox must still be
// invisible unless it is shared AND its linked deal/person is visible to the actor.
//
// Real Postgres via Testcontainers (no DB mocking, see CLAUDE.md).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { listInbox } from "./emailReads";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

const sig = (): AbortSignal => new AbortController().signal;

async function seedUserWithMailbox(tag: string): Promise<{ actor: AuthUser; accountId: string }> {
  const u = (
    await h.db.execute(
      sql`INSERT INTO users (email, name, google_sub)
          VALUES (${`${tag}@acme.com`}, ${tag}, ${`sub-${tag}`}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await h.db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address)
          VALUES (${u.id}, ${`${tag}@acme.com`}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return {
    actor: { id: u.id, type: "regular", isActive: true, groupIds: new Set() },
    accountId: acct.id,
  };
}

async function seedThread(accountId: string, subject: string, visibility: string): Promise<void> {
  await h.db.execute(
    sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, visibility, last_message_at)
        VALUES (${accountId}, ${subject}, ${subject}, ${visibility}, now())`,
  );
}

it("hides another user's private thread, and their shared thread that links to nothing", async () => {
  const alice = await seedUserWithMailbox("alice");
  const bob = await seedUserWithMailbox("bob");

  await seedThread(alice.accountId, "alice-own-private", "private");
  await seedThread(bob.accountId, "bob-private", "private");
  // Shared, but linked to no deal and no person, so no one but Bob can see it.
  await seedThread(bob.accountId, "bob-shared-unlinked", "shared");

  const subjects = (
    await listInbox(h.db, { actor: alice.actor, filter: "all" }, sig())
  ).threads.map((t) => t.subject);

  expect(subjects).toContain("alice-own-private");
  expect(subjects).not.toContain("bob-private");
  expect(subjects).not.toContain("bob-shared-unlinked");
});

it("shows the owner their own mailbox at any visibility", async () => {
  const carol = await seedUserWithMailbox("carol");
  await seedThread(carol.accountId, "carol-private", "private");
  await seedThread(carol.accountId, "carol-shared", "shared");

  const subjects = (
    await listInbox(h.db, { actor: carol.actor, filter: "all" }, sig())
  ).threads.map((t) => t.subject);

  expect(subjects).toContain("carol-private");
  expect(subjects).toContain("carol-shared");
});
