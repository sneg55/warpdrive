import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { INTERCOM_DEAL_SEARCH_REFRESH_BATCH } from "@/constants/intercom";
import { PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH } from "@/constants/jobNames";
import { dealParticipants } from "@/db/schema";
import { actorOf, run, seedWorld } from "@/features/search/search.test-helpers";
import { setBoss } from "@/jobs/boss";
import { makeTestDb } from "@/test/db";
import { conversationFor, linkedDeal } from "./dealSearch.test-helpers";
import { enqueueDealSearchRefresh } from "./enqueue";
import { DEAL_SEARCH_REFRESH_QUEUE_OPTIONS, handleDealSearchRefresh } from "./job";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let boss: PgBoss;

beforeAll(async () => {
  ctx = await makeTestDb();
  boss = new PgBoss(ctx.url);
  await boss.start();
  await boss.createQueue(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH, DEAL_SEARCH_REFRESH_QUEUE_OPTIONS);
});

afterAll(async () => {
  await boss.stop();
  await ctx.close();
});

afterEach(() => {
  setBoss(null as unknown as PgBoss);
});

async function drainQueue(): Promise<number> {
  const jobs = await boss.fetch(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH, {
    batchSize: INTERCOM_DEAL_SEARCH_REFRESH_BATCH,
  });
  await handleDealSearchRefresh(
    ctx.db,
    jobs.map((job) => ({ ...job, signal: new AbortController().signal })),
  );
  if (jobs.length > 0) {
    await boss.complete(
      PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
      jobs.map((j) => j.id),
    );
  }
  return jobs.length;
}

describe("a refresh queued before a mutation commits", () => {
  it("still leaves a refresh after the commit when an earlier job is consumed first", async () => {
    setBoss(boss);
    const w = await seedWorld(ctx.db);
    const lead = await linkedDeal(ctx.db, w, "lead@acme.com");
    const other = await linkedDeal(ctx.db, w, "other@acme.com");
    await conversationFor(ctx.db, "c1", "other@acme.com", { title: "Zebra payout" });
    await enqueueDealSearchRefresh(ctx.db, [lead.dealId], new AbortController().signal);

    await ctx.db.transaction(async (tx) => {
      await tx.insert(dealParticipants).values({ dealId: lead.dealId, personId: other.personId });
      await enqueueDealSearchRefresh(tx, [lead.dealId], new AbortController().signal);
      expect(await drainQueue()).toBe(1);
    });

    const found = async () =>
      (await run(ctx.db, actorOf(w.alice.id), "zebra")).deals.map((d) => d.id);
    expect(await found()).toEqual([]);
    expect(await drainQueue()).toBe(1);
    expect(await found()).toEqual([lead.dealId]);
  });
});
