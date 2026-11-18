import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { PGBOSS_QUEUE_EMAIL_SEND } from "@/constants/jobNames";
import { setBoss } from "@/jobs/boss";
import { makeTestDb } from "@/test/db";
import {
  type AgenticSendFixture,
  attemptState,
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

it("a 503 stamps E_AINBOX_005 and keeps the attempt waiting_for_limit", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "temporary", code: "E_TEMP" });

  expect(await runAttempt(ctx.db, f, key)).toEqual({
    ok: true,
    value: { status: "waiting_for_limit" },
  });
  const row = await attemptState(ctx.db, attemptId);
  expect([row.status, row.error_id]).toEqual(["waiting_for_limit", "E_AINBOX_005"]);
});

it("a leftover job for a rejected agentic attempt does not POST again", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "permanent", code: "E_BAD_RECIPIENT" });
  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "failed" } });
  expect(f.fake.sendBodies()).toHaveLength(1);

  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "failed" } });

  expect(f.fake.sendBodies()).toHaveLength(1);
  expect(f.fake.totalDeliveries()).toBe(0);
  const row = await attemptState(ctx.db, attemptId);
  expect([row.status, row.error_id, row.claim_token]).toEqual(["failed", "E_AINBOX_006", null]);
});
