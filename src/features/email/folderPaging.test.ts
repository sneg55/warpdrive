// Sent and Archive loaded every thread in the mailbox, like the Inbox used to. Unlike the Inbox
// they are owner-scoped in SQL (a.user_id = actor.id) with no post-query visibility filter, so a
// plain keyset LIMIT is exact: no chunked scan, no short pages.
//
// Real Postgres via Testcontainers (no DB mocking, see CLAUDE.md).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { listArchivedThreads, listSentThreads } from "./folderReads";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

const sig = (): AbortSignal => new AbortController().signal;

async function seedOwner(tag: string): Promise<{ actor: AuthUser; accountId: string }> {
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

async function seedArchived(accountId: string, subject: string, minutesAgo: number): Promise<void> {
  await h.db.execute(
    sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, visibility, archived_at)
        VALUES (${accountId}, ${subject}, ${subject}, 'private',
                now() - (${minutesAgo} * interval '1 minute'))`,
  );
}

async function seedSent(accountId: string, subject: string, minutesAgo: number): Promise<void> {
  const t = (
    await h.db.execute(
      sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, visibility)
          VALUES (${accountId}, ${subject}, ${subject}, 'private') RETURNING id`,
    )
  ).rows[0] as { id: string };
  await h.db.execute(
    sql`INSERT INTO email_messages
          (thread_id, account_id, gmail_message_id, direction, from_email, to_emails, cc_emails,
           subject, body_html, sent_at)
        VALUES (${t.id}, ${accountId}, ${subject}, 'outbound', 'me@acme.com', '[]'::jsonb,
                '[]'::jsonb, ${subject}, '',
                now() - (${minutesAgo} * interval '1 minute'))`,
  );
}

it("pages the Archive folder newest-first, visiting each thread exactly once", async () => {
  const me = await seedOwner("archiver");
  for (let i = 0; i < 5; i++) await seedArchived(me.accountId, `a${i}`, i);

  const seen: string[] = [];
  let cursor: { at: string; id: string } | null = null;
  let pages = 0;
  do {
    const page = await listArchivedThreads(h.db, me.actor, sig(), { limit: 2, cursor });
    expect(page.threads.length).toBeLessThanOrEqual(2);
    seen.push(...page.threads.map((t) => t.subject ?? ""));
    cursor = page.nextCursor;
    pages += 1;
    expect(pages).toBeLessThan(10);
  } while (cursor !== null);

  expect(seen).toEqual(["a0", "a1", "a2", "a3", "a4"]);
});

it("pages the Sent folder newest-first, visiting each thread exactly once", async () => {
  const me = await seedOwner("sender");
  for (let i = 0; i < 5; i++) await seedSent(me.accountId, `s${i}`, i);

  const seen: string[] = [];
  let cursor: { at: string; id: string } | null = null;
  let pages = 0;
  do {
    const page = await listSentThreads(h.db, me.actor, sig(), { limit: 2, cursor });
    seen.push(...page.threads.map((t) => t.subject ?? ""));
    cursor = page.nextCursor;
    pages += 1;
    expect(pages).toBeLessThan(10);
  } while (cursor !== null);

  expect(seen).toEqual(["s0", "s1", "s2", "s3", "s4"]);
});

it("reports no next cursor when the last page exactly fills the limit", async () => {
  const me = await seedOwner("exact");
  await seedArchived(me.accountId, "e0", 0);
  await seedArchived(me.accountId, "e1", 1);

  const page = await listArchivedThreads(h.db, me.actor, sig(), { limit: 2, cursor: null });

  expect(page.threads).toHaveLength(2);
  // A limit-sized page must not claim there is more when the mailbox is exhausted, otherwise
  // "Load more" appears and then yields nothing.
  expect(page.nextCursor).toBeNull();
});

it("never leaks another owner's archived threads", async () => {
  const me = await seedOwner("owner-a");
  const other = await seedOwner("owner-b");
  await seedArchived(me.accountId, "mine", 0);
  await seedArchived(other.accountId, "theirs", 1);

  const page = await listArchivedThreads(h.db, me.actor, sig(), { limit: 50, cursor: null });

  expect(page.threads.map((t) => t.subject)).toEqual(["mine"]);
});
