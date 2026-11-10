import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { syncMailbox } from "./sync";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";
import { runTeamBackfillPage } from "./teamMailboxBackfill";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => vi.useRealTimers());

it("persists the team import anchor with the initial live cursor and preserves it on polling", async () => {
  const signal = AbortSignal.timeout(8000);
  const { accountId } = await seedTeamMailbox(ctx.db, [], signal);
  const gmail = new FakeGmailClient();
  gmail.profileHistoryId = "100";
  expect((await syncMailbox(ctx.db, { accountId, gmail, signal })).ok).toBe(true);
  const before = (
    await ctx.db.execute(sql`SELECT last_history_id, backfill_started_at,
    backfill_started_at=last_sync_at AS same_anchor FROM email_accounts WHERE id=${accountId}`)
  ).rows[0];
  expect(before).toMatchObject({ last_history_id: "100", same_anchor: true });
  gmail.historyPages = [{ historyId: "101", history: [] }];
  await syncMailbox(ctx.db, { accountId, gmail, signal });
  expect(
    (
      await ctx.db.execute(
        sql`SELECT backfill_started_at FROM email_accounts WHERE id=${accountId}`,
      )
    ).rows[0]?.backfill_started_at,
  ).toEqual(before?.backfill_started_at);
});

it.each([
  "sync",
  "import",
])("uses the persisted %s cursor anchor for mail first encountered by import", async (initializer) => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db);
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  await ctx.db.execute(sql`UPDATE email_accounts SET backfill_days=90 WHERE id=${accountId}`);
  await ctx.db.execute(sql`UPDATE email_threads SET archived_at=now() WHERE id=${threadId}`);
  const gmail = new FakeGmailClient();
  if (initializer === "sync") await syncMailbox(ctx.db, { accountId, gmail, signal });
  const clock = (await ctx.db.execute(sql`SELECT now() AS value`)).rows[0] as { value: string };
  const arrival = new Date(new Date(clock.value).getTime() + 1000);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(arrival.getTime() + 1000));
  const messages = [
    { id: "followup", threadId },
    { id: "new-message", threadId: "new-conversation" },
  ];
  for (const message of messages) {
    gmail.messages.set(message.id, {
      ...message,
      labelIds: ["INBOX"],
      internalDate: String(arrival.getTime()),
      payload: { headers: [{ name: "From", value: "customer@example.com" }] },
    });
    gmail.threads.set(message.threadId, {
      id: message.threadId,
      messages: [{ id: message.id, labelIds: ["INBOX"] }],
    });
  }
  const result = await runTeamBackfillPage(ctx.db, {
    accountId,
    gmail,
    signal,
    listThreads: ({ signal }) => {
      signal.throwIfAborted();
      return Promise.resolve(
        ok({ threads: messages.map((message) => ({ id: message.threadId })) }),
      );
    },
  });
  expect(result.ok).toBe(true);
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).toBeNull();
  expect(
    (
      await ctx.db.execute(sql`SELECT team_read_at < last_inbound_at AS unread
    FROM email_threads WHERE account_id=${accountId} AND gmail_thread_id='new-conversation'`)
    ).rows[0]?.unread,
  ).toBe(true);
  gmail.historyPages = [
    { historyId: "2", history: [{ messagesAdded: messages.map((message) => ({ message })) }] },
  ];
  expect(await syncMailbox(ctx.db, { accountId, gmail, signal })).toEqual({
    ok: true,
    value: { applied: 0 },
  });
  expect(
    (await ctx.db.execute(sql`SELECT id FROM email_messages WHERE account_id=${accountId}`)).rows,
  ).toHaveLength(2);
});
