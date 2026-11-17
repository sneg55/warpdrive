import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGBOSS_QUEUE_EMAIL_SYNC } from "@/constants/jobNames";
import { makeTestDb } from "@/test/db";
import { pendingTicksVia } from "./syncReEnqueue";

const FAR_FUTURE_SECONDS = 86_400;

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let boss: PgBoss;

beforeAll(async () => {
  ctx = await makeTestDb();
  boss = new PgBoss(ctx.url);
  await boss.start();
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SYNC);
});

afterAll(async () => {
  await boss.stop();
  await ctx.close();
});

async function queueTick(accountId: string): Promise<void> {
  await boss.send(
    PGBOSS_QUEUE_EMAIL_SYNC,
    { accountId },
    { startAfter: FAR_FUTURE_SECONDS, singletonKey: accountId },
  );
}

it("counts only the ticks queued for the asked mailbox", async () => {
  await queueTick("mailbox-a");
  await queueTick("mailbox-a");
  await queueTick("mailbox-b");

  const pendingTicks = pendingTicksVia(ctx.db);

  expect(await pendingTicks("mailbox-a")).toBe(2);
  expect(await pendingTicks("mailbox-b")).toBe(1);
  expect(await pendingTicks("mailbox-c")).toBe(0);
});
