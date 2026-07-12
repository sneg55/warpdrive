// Integration test; real DB (per CLAUDE.md, no mocked database).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { inboxUnreadCount, markThreadRead, markThreadUnread } from "./readState";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});
const SIG = () => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedThread(db: typeof ctx.db, ownerId: string): Promise<string> {
  const acct = (
    await db.execute(sql`INSERT INTO email_accounts (user_id, email_address, status)
    VALUES (${ownerId}, ${`${ownerId}@ex.com`}, 'connected') RETURNING id`)
  ).rows[0] as { id: string };
  const th = (
    await db.execute(sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at)
    VALUES ('g1', ${acct.id}, 'Hi', now()) RETURNING id`)
  ).rows[0] as { id: string };
  return th.id;
}

it("a fresh thread is unread; marking read clears it; marking unread restores it", async () => {
  const owner = await seedUser(ctx.db, { email: "o@ex.com" });
  const actor = actorOf(owner.id);
  const threadId = await seedThread(ctx.db, owner.id);

  expect(await inboxUnreadCount(ctx.db, { actor }, SIG())).toBe(1);

  const r1 = await markThreadRead(ctx.db, { actor, threadId }, SIG());
  expect(r1.ok).toBe(true);
  expect(await inboxUnreadCount(ctx.db, { actor }, SIG())).toBe(0);

  const r2 = await markThreadUnread(ctx.db, { actor, threadId }, SIG());
  expect(r2.ok).toBe(true);
  expect(await inboxUnreadCount(ctx.db, { actor }, SIG())).toBe(1);
});

it("does not count another user's shared thread in the actor's unread badge (Inbox is personal)", async () => {
  // The unread badge must match the personal Inbox list: a colleague's shared thread, even one the
  // actor could open via the linked record, is NOT part of the actor's own mailbox count.
  const owner = await seedUser(ctx.db, { email: "ub-owner@ex.com" });
  const viewer = await seedUser(ctx.db, { email: "ub-viewer@ex.com" });
  // viewer has their own (empty) mailbox, so any count must come from their own threads only.
  await ctx.db.execute(sql`INSERT INTO email_accounts (user_id, email_address, status)
    VALUES (${viewer.id}, 'ub-viewer-box@ex.com', 'connected')`);
  const acct = (
    await ctx.db.execute(sql`INSERT INTO email_accounts (user_id, email_address, status)
      VALUES (${owner.id}, 'ub-owner-box@ex.com', 'connected') RETURNING id`)
  ).rows[0] as { id: string };
  const person = (
    await ctx.db.execute(sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
      VALUES ('Pub', 'pub@ex.com', ${owner.id}, 'all') RETURNING id`)
  ).rows[0] as { id: string };
  // Owner's shared, unread thread linked to a person the viewer can see.
  await ctx.db.execute(sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, visibility, person_id, last_message_at)
    VALUES ('gshared', ${acct.id}, 'Shared', 'shared', ${person.id}, now())`);

  expect(await inboxUnreadCount(ctx.db, { actor: actorOf(viewer.id) }, SIG())).toBe(0);
});

it("marking an invisible thread read is 404-on-invisible", async () => {
  const owner = await seedUser(ctx.db, { email: "o2@ex.com" });
  const stranger = await seedUser(ctx.db, { email: "s2@ex.com" });
  const threadId = await seedThread(ctx.db, owner.id);
  const r = await markThreadRead(ctx.db, { actor: actorOf(stranger.id), threadId }, SIG());
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_GMAIL_011");
});
