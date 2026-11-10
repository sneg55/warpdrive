import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { applyMessageIds } from "./applyMessages";
import { FakeGmailClient } from "./gmailFake";
import { inboxUnreadCount } from "./readState";
import { enqueuePendingBackfill } from "./teamBackfillJobs";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { runTeamBackfillPage } from "./teamMailboxBackfill";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("seeds the live cursor before import, resumes persisted pages and imports read without duplicates", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "backfill@example.com" });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  await ctx.db.execute(sql`DELETE FROM email_threads WHERE id=${threadId}`);
  await ctx.db.execute(sql`UPDATE email_accounts SET backfill_days=90 WHERE id=${accountId}`);
  const gmail = new FakeGmailClient();
  gmail.profileHistoryId = "123";
  gmail.messages.set("historic", {
    id: "historic",
    threadId: "history-thread",
    labelIds: ["INBOX"],
    payload: {
      headers: [
        { name: "From", value: "customer@external.com" },
        { name: "Date", value: "Thu, 01 Jan 2026 00:00:00 GMT" },
      ],
    },
  });
  gmail.threads.set("history-thread", {
    id: "history-thread",
    messages: [{ id: "historic", labelIds: ["INBOX"] }],
  });
  const tokens: (string | undefined)[] = [];
  const listThreads = async (args: { pageToken?: string; q: string; signal: AbortSignal }) => {
    args.signal.throwIfAborted();
    expect(
      (await ctx.db.execute(sql`SELECT last_history_id FROM email_accounts WHERE id=${accountId}`))
        .rows[0]?.last_history_id,
    ).toBe("123");
    expect(args.q).toContain("in:inbox");
    expect(args.q).toContain("after:");
    tokens.push(args.pageToken);
    return ok({
      threads: [{ id: "history-thread" }],
      nextPageToken: args.pageToken === undefined ? "next" : undefined,
    });
  };
  expect(await runTeamBackfillPage(ctx.db, { accountId, gmail, listThreads, signal })).toEqual({
    ok: true,
    value: { done: false },
  });
  expect(
    (
      await ctx.db.execute(
        sql`SELECT backfill_page_token FROM email_accounts WHERE id=${accountId}`,
      )
    ).rows[0]?.backfill_page_token,
  ).toBe("next");
  expect(await runTeamBackfillPage(ctx.db, { accountId, gmail, listThreads, signal })).toEqual({
    ok: true,
    value: { done: true },
  });
  expect(tokens).toEqual([undefined, "next"]);
  expect(await inboxUnreadCount(ctx.db, { actor: teamActor(user.id) }, signal)).toBe(0);
  await applyMessageIds({ db: ctx.db, accountId, gmail, signal }, ["historic"]);
  expect(
    (await ctx.db.execute(sql`SELECT id FROM email_messages WHERE account_id=${accountId}`)).rows,
  ).toHaveLength(1);
});

it("queues import only after cursor initialization and stops queuing completed imports", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const { accountId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  await ctx.db.execute(sql`UPDATE email_accounts SET backfill_days=90 WHERE id=${accountId}`);
  const queued: string[] = [];
  const enqueue = (id: string, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    queued.push(id);
    return Promise.resolve();
  };
  await enqueuePendingBackfill(ctx.db, accountId, enqueue, signal);
  expect(queued).toEqual([]);
  await ctx.db.execute(sql`UPDATE email_accounts SET last_history_id='100' WHERE id=${accountId}`);
  await enqueuePendingBackfill(ctx.db, accountId, enqueue, signal);
  expect(queued).toEqual([accountId]);
  await ctx.db.execute(sql`UPDATE email_accounts SET backfill_status='done' WHERE id=${accountId}`);
  await enqueuePendingBackfill(ctx.db, accountId, enqueue, signal);
  expect(queued).toEqual([accountId]);
});
