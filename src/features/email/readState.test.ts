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

it("marking an invisible thread read is 404-on-invisible", async () => {
  const owner = await seedUser(ctx.db, { email: "o2@ex.com" });
  const stranger = await seedUser(ctx.db, { email: "s2@ex.com" });
  const threadId = await seedThread(ctx.db, owner.id);
  const r = await markThreadRead(ctx.db, { actor: actorOf(stranger.id), threadId }, SIG());
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_GMAIL_011");
});
