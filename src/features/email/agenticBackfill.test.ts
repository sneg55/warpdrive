import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENTIC_CHANGES_PAGE_LIMIT } from "@/constants/email";
import { MILLISECONDS_PER_DAY } from "@/constants/teamMailbox";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { fakeAgenticProvider, seedAgenticMailbox } from "./agentic.test-helpers";
import { backfillAgenticMailbox } from "./agenticBackfill";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";
import { backfillSource, enqueuePendingBackfill } from "./teamBackfillJobs";
import { runTeamBackfillPage } from "./teamMailboxBackfill";

const MAILBOX = "media@example.com";
const daysAgo = (n: number) => new Date(Date.now() - n * MILLISECONDS_PER_DAY).toISOString();

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let fake: FakeAgenticServer;
beforeEach(async () => {
  ctx = await makeTestDb();
  fake = await startFakeAgenticServer({ mailbox: MAILBOX });
});
afterEach(async () => {
  await fake.close();
  await ctx.close();
});

async function setup(signal: AbortSignal, members = true): Promise<string> {
  const member = await seedUser(ctx.db);
  const accountId = await seedAgenticMailbox(
    ctx.db,
    { address: MAILBOX, baseUrl: fake.url, memberIds: members ? [member.id] : [] },
    signal,
  );
  await ctx.db.execute(sql`UPDATE email_accounts SET backfill_days=30 WHERE id=${accountId}`);
  return accountId;
}

function backfill(accountId: string, signal: AbortSignal) {
  const { client, provider } = fakeAgenticProvider(fake);
  return backfillAgenticMailbox(ctx.db, { accountId, provider, client, sinceDays: 30, signal });
}

async function state(accountId: string) {
  return (
    await ctx.db.execute(sql`SELECT backfill_status, backfill_page_token, backfill_error_id, provider_cursor
      FROM email_accounts WHERE id=${accountId}`)
  ).rows[0] as Record<string, unknown>;
}

async function storedIds(accountId: string): Promise<string[]> {
  const rows = (
    await ctx.db.execute(sql`SELECT gmail_message_id FROM email_messages
      WHERE account_id=${accountId} ORDER BY gmail_message_id`)
  ).rows as { gmail_message_id: string }[];
  return rows.map((r) => r.gmail_message_id);
}

describe("backfillAgenticMailbox", () => {
  it("backfill applies only rows newer than sinceDays", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    fake.seedEmail({ id: "ancient", date: daysAgo(60) });
    fake.seedEmail({ id: "recent-in", date: daysAgo(5) });
    fake.seedEmail({ id: "recent-out", folder: "sent", sender: MAILBOX, date: daysAgo(3) });
    fake.seedEmail({ id: "recent-spam", folder: "spam", date: daysAgo(2) });

    expect(await backfill(accountId, signal)).toEqual(ok({ done: true }));
    expect(await storedIds(accountId)).toEqual(["recent-in", "recent-out"]);
    const s = await state(accountId);
    expect(s.backfill_status).toBe("done");
    expect(s.backfill_page_token).toBeNull();
    expect(Number(s.provider_cursor)).toBe(4);
    const read = (
      await ctx.db.execute(
        sql`SELECT team_read_at FROM email_threads WHERE account_id=${accountId}`,
      )
    ).rows;
    expect(read.every((r) => r.team_read_at !== null)).toBe(true);
  });

  it("resumes from the stored feed position across pages", async () => {
    const signal = AbortSignal.timeout(20000);
    const accountId = await setup(signal);
    for (let i = 0; i <= AGENTIC_CHANGES_PAGE_LIMIT; i += 1)
      fake.seedEmail({ id: `m-${String(i).padStart(3, "0")}`, date: daysAgo(1) });

    expect(await backfill(accountId, signal)).toEqual(ok({ done: false }));
    expect((await state(accountId)).backfill_page_token).toBe(String(AGENTIC_CHANGES_PAGE_LIMIT));
    expect(await backfill(accountId, signal)).toEqual(ok({ done: true }));
    expect(await storedIds(accountId)).toHaveLength(AGENTIC_CHANGES_PAGE_LIMIT + 1);
  });

  it("records a failed feed read as a failed backfill", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    await ctx.db.execute(sql`UPDATE email_accounts SET provider_cursor=0 WHERE id=${accountId}`);
    fake.setAuthMode("forbidden");

    const r = await backfill(accountId, signal);
    expect(r.ok).toBe(false);
    const s = await state(accountId);
    expect([s.backfill_status, s.backfill_error_id]).toEqual(["failed", "E_AINBOX_001"]);
  });
});

describe("agentic backfill dispatch", () => {
  const noThreads = () => Promise.resolve(ok({ threads: [] }));

  it("runTeamBackfillPage sends an eligible agentic mailbox to the agentic backfill", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    fake.seedEmail({ id: "recent", date: daysAgo(1) });
    const { provider } = fakeAgenticProvider(fake);

    expect(
      await runTeamBackfillPage(ctx.db, { accountId, provider, listThreads: noThreads, signal }),
    ).toEqual(ok({ done: true }));
    expect(await storedIds(accountId)).toEqual(["recent"]);
  });

  it("runTeamBackfillPage keeps the early return for an agentic mailbox without members", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal, false);
    fake.seedEmail({ id: "recent", date: daysAgo(1) });
    const { provider } = fakeAgenticProvider(fake);

    expect(
      await runTeamBackfillPage(ctx.db, { accountId, provider, listThreads: noThreads, signal }),
    ).toEqual(ok({ done: true }));
    expect(await storedIds(accountId)).toEqual([]);
    expect((await state(accountId)).backfill_status).toBeNull();
  });

  it("queues an agentic backfill once the feed cursor is seeded", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    const queued: string[] = [];
    const enqueue = (id: string) => {
      queued.push(id);
      return Promise.resolve();
    };
    await enqueuePendingBackfill(ctx.db, accountId, enqueue, signal);
    expect(queued).toEqual([]);
    await ctx.db.execute(sql`UPDATE email_accounts SET provider_cursor=0 WHERE id=${accountId}`);
    await enqueuePendingBackfill(ctx.db, accountId, enqueue, signal);
    expect(queued).toEqual([accountId]);
  });

  it("the backfill job resolves an agentic mailbox without a Gmail token", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);

    const source = await backfillSource(ctx.db, accountId, signal);
    expect(source.ok).toBe(true);
    if (source.ok) expect(source.value.provider.kind).toBe("agentic_inbox");
  });
});
