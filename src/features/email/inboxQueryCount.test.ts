// listInbox resolved visibility one thread at a time: canSeeEmail issued
// `SELECT user_id FROM email_accounts` for every row, sequentially. A mailbox with thousands of
// threads therefore cost thousands of sequential round trips on every inbox load.
//
// Real Postgres via Testcontainers (no DB mocking, see CLAUDE.md); we wrap the real pool's query
// method to count statements, then hand the untouched db handle to listInbox.
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

function countQueries(pool: typeof h.pool): { total: () => number; restore: () => void } {
  const original = pool.query.bind(pool);
  let total = 0;
  const counting = (...args: unknown[]): unknown => {
    total += 1;
    return (original as (...a: unknown[]) => Promise<unknown>)(...args);
  };
  Object.assign(pool, { query: counting });
  return {
    total: () => total,
    restore: () => {
      Object.assign(pool, { query: original });
    },
  };
}

async function seedOwnerWithAccount(): Promise<{ actor: AuthUser; accountId: string }> {
  const u = (
    await h.db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('owner@acme.com','Owner','sub-owner') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await h.db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'owner@acme.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return {
    actor: { id: u.id, type: "regular", isActive: true, groupIds: new Set() },
    accountId: acct.id,
  };
}

async function seedThreads(accountId: string, n: number, prefix: string): Promise<void> {
  for (let i = 0; i < n; i++) {
    await h.db.execute(
      sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, visibility, last_message_at)
          VALUES (${accountId}, ${`${prefix}-${i}`}, ${`${prefix}-${i}`}, 'private',
                  now() - (${i} * interval '1 minute'))`,
    );
  }
}

// Loading an owner's inbox must cost a fixed number of statements regardless of how many threads
// the mailbox holds. Growth here is the N+1: one visibility lookup per row.
it("issues the same number of queries no matter how many threads the mailbox holds", async () => {
  const { actor, accountId } = await seedOwnerWithAccount();

  await seedThreads(accountId, 5, "few");
  const a = countQueries(h.pool);
  const few = (await listInbox(h.db, { actor, filter: "all" }, sig())).threads;
  a.restore();

  await seedThreads(accountId, 15, "many");
  const b = countQueries(h.pool);
  const many = (await listInbox(h.db, { actor, filter: "all" }, sig())).threads;
  b.restore();

  // Sanity: the second load really does see more threads, so the counts are comparable.
  expect(few).toHaveLength(5);
  expect(many).toHaveLength(20);

  expect(b.total()).toBe(a.total());
});
