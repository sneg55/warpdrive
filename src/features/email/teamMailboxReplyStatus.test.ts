import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { listInbox } from "./inboxList";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("derives consecutive inbound waiting and the latest attributed reply without manual status", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "status@example.com", name: "Sam Jones" });
  const { accountId: mailbox, threadId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  const args = { actor: teamActor(user.id), mailbox, filter: "all" as const };
  await ctx.db.execute(sql`INSERT INTO email_messages (account_id, thread_id, gmail_message_id, direction, from_email, sent_at)
    VALUES (${mailbox}, ${threadId}, 'one', 'inbound', 'customer@example.com', '2026-01-01'),
      (${mailbox}, ${threadId}, 'two', 'inbound', 'customer@example.com', '2026-01-02')`);
  const first = (await listInbox(ctx.db, args, signal)).threads[0]?.replyStatus;
  expect(first).toMatchObject({ kind: "unanswered", overdueAfterHours: 24 });
  if (first?.kind === "unanswered")
    expect(new Date(first.waitingSince).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  await ctx.db.execute(sql`INSERT INTO email_messages (account_id, thread_id, gmail_message_id, direction, from_email, sent_at, sent_by_user_id)
    VALUES (${mailbox}, ${threadId}, 'reply', 'outbound', 'sales@example.com', '2026-01-03', ${user.id})`);
  expect((await listInbox(ctx.db, args, signal)).threads[0]?.replyStatus).toEqual({
    kind: "replied",
    byName: "Sam",
  });
  await ctx.db.execute(
    sql`UPDATE email_messages SET sent_by_user_id=NULL WHERE gmail_message_id='reply'`,
  );
  expect((await listInbox(ctx.db, args, signal)).threads[0]?.replyStatus).toEqual({
    kind: "replied",
    byName: null,
  });
  await ctx.db.execute(sql`INSERT INTO email_messages (account_id, thread_id, gmail_message_id, direction, from_email, sent_at)
    VALUES (${mailbox}, ${threadId}, 'followup', 'inbound', 'customer@example.com', '2026-01-04')`);
  const latest = (await listInbox(ctx.db, args, signal)).threads[0]?.replyStatus;
  expect(latest?.kind).toBe("unanswered");
  if (latest?.kind === "unanswered")
    expect(new Date(latest.waitingSince).toISOString()).toBe("2026-01-04T00:00:00.000Z");
});
