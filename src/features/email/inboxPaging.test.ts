// listInbox loaded every thread in the mailbox. This pins the paged contract:
//
//  - a page never exceeds the requested limit
//  - walking the cursor visits every thread exactly once, in last_message_at DESC order
//  - a page is FILLED even when invisible threads are interleaved, because visibility is applied
//    after the query: a naive `LIMIT n` would return fewer than n visible rows
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

// minutesAgo orders the threads deterministically: smaller = newer = earlier in the list.
async function seedThread(accountId: string, subject: string, minutesAgo: number): Promise<void> {
  await h.db.execute(
    sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, visibility, last_message_at)
        VALUES (${accountId}, ${subject}, ${subject}, 'private',
                now() - (${minutesAgo} * interval '1 minute'))`,
  );
}

it("returns at most `limit` threads and walks every thread exactly once via the cursor", async () => {
  const me = await seedUserWithMailbox("walker");
  for (let i = 0; i < 5; i++) await seedThread(me.accountId, `t${i}`, i);

  const seen: string[] = [];
  let cursor: { lastMessageAt: string | null; id: string } | null = null;
  let pages = 0;
  do {
    const page = await listInbox(h.db, { actor: me.actor, filter: "all", limit: 2, cursor }, sig());
    expect(page.threads.length).toBeLessThanOrEqual(2);
    seen.push(...page.threads.map((t) => t.subject ?? ""));
    cursor = page.nextCursor;
    pages += 1;
    expect(pages).toBeLessThan(10); // guard against a cursor that never advances
  } while (cursor !== null);

  // Newest first, every thread once, nothing skipped or repeated.
  expect(seen).toEqual(["t0", "t1", "t2", "t3", "t4"]);
});

it("fills a page even when threads the actor cannot see are interleaved", async () => {
  const me = await seedUserWithMailbox("filler");
  const other = await seedUserWithMailbox("stranger");

  // Alternate visible/invisible so a naive `LIMIT 3` would scan 3 rows and return only ~2.
  for (let i = 0; i < 6; i++) {
    const owner = i % 2 === 0 ? me.accountId : other.accountId;
    await seedThread(owner, i % 2 === 0 ? `mine-${i}` : `theirs-${i}`, i);
  }

  const page = await listInbox(
    h.db,
    { actor: me.actor, filter: "all", limit: 3, cursor: null },
    sig(),
  );

  expect(page.threads.map((t) => t.subject)).toEqual(["mine-0", "mine-2", "mine-4"]);
  expect(page.threads).toHaveLength(3);
});

it("reports no next cursor once the mailbox is exhausted", async () => {
  const me = await seedUserWithMailbox("ender");
  await seedThread(me.accountId, "only", 0);

  const page = await listInbox(
    h.db,
    { actor: me.actor, filter: "all", limit: 10, cursor: null },
    sig(),
  );

  expect(page.threads).toHaveLength(1);
  expect(page.nextCursor).toBeNull();
});
