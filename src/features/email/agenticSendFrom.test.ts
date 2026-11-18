import { sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { PGBOSS_QUEUE_EMAIL_SEND } from "@/constants/jobNames";
import { setBoss } from "@/jobs/boss";
import { makeTestDb } from "@/test/db";
import {
  type AgenticSendFixture,
  enqueueAgentic,
  runAttempt,
  startAgenticSendFixture,
} from "./agenticSend.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let boss: PgBoss;
let f: AgenticSendFixture;

beforeAll(async () => {
  ctx = await makeTestDb();
  boss = new PgBoss(ctx.url);
  await boss.start();
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SEND);
  setBoss(boss);
});
afterEach(async () => {
  await f.fake.close();
});
afterAll(async () => {
  Reflect.deleteProperty(globalThis, Symbol.for("warpdrive.jobs.boss"));
  await boss.stop();
  await ctx.close();
});

it("an agentic send carries the mailbox display name as the sender name", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { key } = await enqueueAgentic(ctx.db, f, signal);

  await runAttempt(ctx.db, f, key);

  expect(f.fake.sendBodies().map((b) => b.from)).toEqual([
    { email: f.fake.mailbox, name: "Media" },
  ]);
});

it("an agentic send from a mailbox without a display name sends the bare address", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  await ctx.db.execute(sql`UPDATE email_accounts SET display_name=NULL WHERE id=${f.accountId}`);
  const { key } = await enqueueAgentic(ctx.db, f, signal);

  await runAttempt(ctx.db, f, key);

  expect(f.fake.sendBodies().map((b) => b.from)).toEqual([f.fake.mailbox]);
});
