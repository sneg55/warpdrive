// U5 inbox filter predicates: each new PD filter (Shared, Private, Tracked emails, To: me, From an
// existing contact, Linked with an open deal) must narrow listInbox at the SQL boundary, and must
// compose with the client-side attribute filters (e.g. Unread + Shared). These filters are ADDITIVE
// narrowing on top of the owner-scoping WHERE (a.user_id = actor), which stays untouched.
//
// Real Postgres via Testcontainers (no DB mocking, see CLAUDE.md).
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { listInbox } from "./emailReads";
import { filterByAttributes, NO_ATTRIBUTE_FILTER } from "./threadAttributeFilter";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

const sig = (): AbortSignal => new AbortController().signal;

interface Mailbox {
  actor: AuthUser;
  accountId: string;
  userId: string;
  email: string;
}

async function seedMailbox(tag: string): Promise<Mailbox> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@acme.com`;
  const u = (
    await h.db.execute(
      sql`INSERT INTO users (email, name, google_sub)
          VALUES (${email}, ${tag}, ${`sub-${email}`}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await h.db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address)
          VALUES (${u.id}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return {
    actor: { id: u.id, type: "regular", isActive: true, groupIds: new Set() },
    accountId: acct.id,
    userId: u.id,
    email,
  };
}

async function seedThread(
  accountId: string,
  subject: string,
  opts: { visibility?: string; dealId?: string | null; personId?: string | null } = {},
): Promise<string> {
  const row = (
    await h.db.execute(
      sql`INSERT INTO email_threads
            (account_id, gmail_thread_id, subject, visibility, deal_id, person_id, last_message_at)
          VALUES (${accountId}, ${subject}, ${subject}, ${opts.visibility ?? "private"},
                  ${opts.dealId ?? null}, ${opts.personId ?? null}, now())
          RETURNING id`,
    )
  ).rows[0] as { id: string };
  return row.id;
}

async function seedMessage(
  threadId: string,
  accountId: string,
  opts: { fromEmail: string; toEmails?: string[] },
): Promise<void> {
  await h.db.execute(
    sql`INSERT INTO email_messages
          (thread_id, account_id, gmail_message_id, direction, from_email, to_emails)
        VALUES (${threadId}, ${accountId}, ${randomUUID()}, 'inbound', ${opts.fromEmail},
                ${JSON.stringify(opts.toEmails ?? [])}::jsonb)`,
  );
}

// Mirrors a real newly-composed tracked send: the send attempt carries thread_id=NULL (no local
// thread exists at enqueue), the message row is created with the thread_id, and backfillTokens then
// links the token to that message. So the token reaches the thread ONLY via message_id, never via
// the attempt's thread_id. A predicate that joins on attempt.thread_id misses this (codex P1).
async function seedTrackingToken(threadId: string, accountId: string): Promise<void> {
  const attempt = (
    await h.db.execute(
      sql`INSERT INTO email_send_attempts
            (idempotency_key, message_id_header, account_id, thread_id, payload, status)
          VALUES (${randomUUID()}, ${`<${randomUUID()}@acme.com>`}, ${accountId}, NULL,
                  '{}'::jsonb, 'sent')
          RETURNING id`,
    )
  ).rows[0] as { id: string };
  const message = (
    await h.db.execute(
      sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email)
          VALUES (${threadId}, ${accountId}, ${randomUUID()}, 'outbound', ${"me@acme.com"})
          RETURNING id`,
    )
  ).rows[0] as { id: string };
  await h.db.execute(
    sql`INSERT INTO email_tracking_tokens (token, send_attempt_id, message_id, recipient, kind)
        VALUES (${randomUUID()}, ${attempt.id}, ${message.id}, ${"someone@acme.com"}, 'open')`,
  );
}

async function seedPerson(ownerId: string, email: string): Promise<void> {
  await h.db.execute(
    sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
        VALUES (${`p-${email}`}, ${email}, ${ownerId}, 'all')`,
  );
}

async function seedDeal(ownerId: string, status: string): Promise<string> {
  const pipeline = (
    await h.db.execute(
      sql`INSERT INTO pipelines (name) VALUES (${`pipe-${randomUUID()}`}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const stage = (
    await h.db.execute(
      sql`INSERT INTO stages (name, pipeline_id, "order")
          VALUES ('Stage', ${pipeline.id}, 0) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const deal = (
    await h.db.execute(
      sql`INSERT INTO deals (title, status, pipeline_id, stage_id, owner_id, visibility_level)
          VALUES (${`deal-${status}`}, ${status}, ${pipeline.id}, ${stage.id}, ${ownerId}, 'all')
          RETURNING id`,
    )
  ).rows[0] as { id: string };
  return deal.id;
}

async function markRead(threadId: string, userId: string): Promise<void> {
  await h.db.execute(
    sql`INSERT INTO email_thread_reads (thread_id, user_id, read_at)
        VALUES (${threadId}, ${userId}, now() + interval '1 hour')`,
  );
}

async function subjectsFor(actor: AuthUser, filter: string): Promise<string[]> {
  const page = await listInbox(h.db, { actor, filter: filter as never }, sig());
  return page.threads.map((t) => t.subject ?? "");
}

it("Shared narrows to shared-visibility threads", async () => {
  const m = await seedMailbox("shared");
  await seedThread(m.accountId, "shared-thread", { visibility: "shared" });
  await seedThread(m.accountId, "private-thread", { visibility: "private" });

  const subjects = await subjectsFor(m.actor, "shared");
  expect(subjects).toContain("shared-thread");
  expect(subjects).not.toContain("private-thread");
});

it("Private narrows to private-visibility threads", async () => {
  const m = await seedMailbox("priv");
  await seedThread(m.accountId, "shared2", { visibility: "shared" });
  await seedThread(m.accountId, "private2", { visibility: "private" });

  const subjects = await subjectsFor(m.actor, "private");
  expect(subjects).toContain("private2");
  expect(subjects).not.toContain("shared2");
});

it("Tracked narrows to threads carrying at least one tracking token", async () => {
  const m = await seedMailbox("trk");
  const tracked = await seedThread(m.accountId, "tracked-thread");
  await seedThread(m.accountId, "untracked-thread");
  await seedTrackingToken(tracked, m.accountId);

  const subjects = await subjectsFor(m.actor, "tracked");
  expect(subjects).toContain("tracked-thread");
  expect(subjects).not.toContain("untracked-thread");
});

it("To: me narrows to threads where the mailbox owner is a direct recipient", async () => {
  const m = await seedMailbox("tome");
  const addressed = await seedThread(m.accountId, "addressed-to-me");
  await seedMessage(addressed, m.accountId, { fromEmail: "sender@ext.com", toEmails: [m.email] });
  const other = await seedThread(m.accountId, "addressed-to-other");
  await seedMessage(other, m.accountId, {
    fromEmail: "sender@ext.com",
    toEmails: ["someone-else@ext.com"],
  });

  const subjects = await subjectsFor(m.actor, "to_me");
  expect(subjects).toContain("addressed-to-me");
  expect(subjects).not.toContain("addressed-to-other");
});

it("From an existing contact narrows to threads whose counterparty matches a persons row", async () => {
  const m = await seedMailbox("fromc");
  await seedPerson(m.userId, "known@ext.com");
  const known = await seedThread(m.accountId, "from-known-contact");
  await seedMessage(known, m.accountId, { fromEmail: "known@ext.com", toEmails: [m.email] });
  const stranger = await seedThread(m.accountId, "from-stranger");
  await seedMessage(stranger, m.accountId, { fromEmail: "stranger@ext.com", toEmails: [m.email] });

  const subjects = await subjectsFor(m.actor, "from_contact");
  expect(subjects).toContain("from-known-contact");
  expect(subjects).not.toContain("from-stranger");
});

it("Linked with an open deal narrows to threads linked to a non-won/lost deal", async () => {
  const m = await seedMailbox("opendeal");
  const openDeal = await seedDeal(m.userId, "open");
  const wonDeal = await seedDeal(m.userId, "won");
  await seedThread(m.accountId, "linked-open", { dealId: openDeal });
  await seedThread(m.accountId, "linked-won", { dealId: wonDeal });
  await seedThread(m.accountId, "linked-none");

  const subjects = await subjectsFor(m.actor, "linked_open_deal");
  expect(subjects).toContain("linked-open");
  expect(subjects).not.toContain("linked-won");
  expect(subjects).not.toContain("linked-none");
});

it("composes a server filter (Shared) with the client Unread attribute filter", async () => {
  const m = await seedMailbox("compose");
  await seedThread(m.accountId, "shared-unread", { visibility: "shared" });
  const sharedRead = await seedThread(m.accountId, "shared-read", { visibility: "shared" });
  await markRead(sharedRead, m.userId);

  const page = await listInbox(h.db, { actor: m.actor, filter: "shared" }, sig());
  const composed = filterByAttributes(page.threads, { ...NO_ATTRIBUTE_FILTER, unreadOnly: true });
  const subjects = composed.map((t) => t.subject);
  expect(subjects).toContain("shared-unread");
  expect(subjects).not.toContain("shared-read");
});
