import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { listInbox } from "./inboxList";
import { inboxUnreadCount, markThreadRead, markThreadUnread } from "./readState";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("shares read state, counts personal plus team unread and ignores outbound activity", async () => {
  const signal = AbortSignal.timeout(8000);
  const first = await seedUser(ctx.db, { email: "read-first@example.com" });
  const second = await seedUser(ctx.db, { email: "read-second@example.com" });
  const actor = teamActor(first.id);
  const other = teamActor(second.id);
  const { accountId: mailbox, threadId } = await seedTeamMailbox(
    ctx.db,
    [first.id, second.id],
    signal,
  );
  await ctx.db.execute(sql`WITH a AS (
    INSERT INTO email_accounts (user_id, email_address) VALUES (${first.id}, 'read-personal@example.com') RETURNING id
  ) INSERT INTO email_threads (account_id, gmail_thread_id, last_message_at) SELECT id, 'personal', now() FROM a`);
  expect(await inboxUnreadCount(ctx.db, { actor }, signal)).toBe(2);
  expect(await inboxUnreadCount(ctx.db, { actor: other }, signal)).toBe(1);
  expect((await markThreadRead(ctx.db, { actor, threadId }, signal)).ok).toBe(true);
  expect(await inboxUnreadCount(ctx.db, { actor: other }, signal)).toBe(0);
  expect(
    (await ctx.db.execute(sql`SELECT * FROM email_thread_reads WHERE thread_id=${threadId}`)).rows,
  ).toEqual([]);
  await ctx.db.execute(
    sql`UPDATE email_threads SET last_message_at=now() + interval '1 second' WHERE id=${threadId}`,
  );
  expect(await inboxUnreadCount(ctx.db, { actor: other }, signal)).toBe(0);
  expect(
    (await listInbox(ctx.db, { actor: other, mailbox, filter: "all" }, signal)).threads[0]?.unread,
  ).toBe(false);
  await ctx.db.execute(
    sql`UPDATE email_threads SET last_inbound_at=now() + interval '2 seconds' WHERE id=${threadId}`,
  );
  expect(await inboxUnreadCount(ctx.db, { actor: other }, signal)).toBe(1);
  await ctx.db.execute(
    sql`UPDATE email_threads SET last_inbound_at=now() - interval '1 minute' WHERE id=${threadId}`,
  );
  await markThreadRead(ctx.db, { actor: other, threadId }, signal);
  await markThreadUnread(ctx.db, { actor, threadId }, signal);
  expect(await inboxUnreadCount(ctx.db, { actor: other }, signal)).toBe(1);
});
