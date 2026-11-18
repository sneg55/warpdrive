import { sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { RECONCILE_WINDOW_MS } from "@/constants/email";
import { PGBOSS_QUEUE_EMAIL_SEND } from "@/constants/jobNames";
import { setBoss } from "@/jobs/boss";
import { makeTestDb } from "@/test/db";
import {
  type AgenticSendFixture,
  attemptState,
  enqueueAgentic,
  runAttempt,
  sentClientRefs,
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

async function jobStartAfter(key: string): Promise<Date[]> {
  const rows = (
    await ctx.db.execute(sql`SELECT start_after FROM pgboss.job
      WHERE name=${PGBOSS_QUEUE_EMAIL_SEND} AND data->>'idempotencyKey'=${key}`)
  ).rows as { start_after: string | Date }[];
  return rows.map((r) => new Date(r.start_after));
}

it("a 429 puts the attempt in waiting_for_limit with next_attempt_at from Retry-After", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "limit", retryAfter: 120 });

  const before = Date.now();
  const r = await runAttempt(ctx.db, f, key);
  const after = Date.now();

  expect(r).toEqual({ ok: true, value: { status: "waiting_for_limit" } });
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("waiting_for_limit");
  expect(row.error_id).toBe("E_AINBOX_004");
  expect(row.send_started_at).toBeNull();
  expect(row.claim_token).toBeNull();
  const next = new Date(row.next_attempt_at ?? 0).getTime();
  expect(next).toBeGreaterThanOrEqual(before + 120_000);
  expect(next).toBeLessThanOrEqual(after + 120_000);
  expect((await jobStartAfter(key)).map((d) => d.getTime())).toEqual([next]);
});

it("a 503 without Retry-After waits five minutes", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "temporary", code: "E_TEMP" });

  const before = Date.now();
  await runAttempt(ctx.db, f, key);
  const after = Date.now();

  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("waiting_for_limit");
  const next = new Date(row.next_attempt_at ?? 0).getTime();
  expect(next).toBeGreaterThanOrEqual(before + 300_000);
  expect(next).toBeLessThanOrEqual(after + 300_000);
});

it("a waiting attempt is not claimable before next_attempt_at and sends after it", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "limit", retryAfter: 3600 });
  await runAttempt(ctx.db, f, key);

  expect(await runAttempt(ctx.db, f, key)).toEqual({
    ok: true,
    value: { status: "waiting_for_limit" },
  });
  expect(f.fake.sendBodies()).toHaveLength(1);
  expect((await attemptState(ctx.db, attemptId)).status).toBe("waiting_for_limit");

  const makeDue = () =>
    ctx.db.execute(sql`UPDATE email_send_attempts
      SET next_attempt_at = now() - interval '1 second' WHERE id=${attemptId}`);
  await makeDue();
  f.fake.setNextSend({ kind: "limit", retryAfter: 3600 });
  expect(await runAttempt(ctx.db, f, key)).toEqual({
    ok: true,
    value: { status: "waiting_for_limit" },
  });
  expect(f.fake.sendBodies()).toHaveLength(2);
  expect(await jobStartAfter(key)).toHaveLength(3);
  const again = await attemptState(ctx.db, attemptId);
  expect(again.status).toBe("waiting_for_limit");
  expect(new Date(again.next_attempt_at ?? 0).getTime()).toBeGreaterThan(Date.now());

  await makeDue();
  const r = await runAttempt(ctx.db, f, key);

  expect(r).toEqual({ ok: true, value: { status: "sent", gmailMessageId: "sent-1" } });
  expect(f.fake.deliveries(attemptId)).toBe(1);
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("sent");
  expect(row.error_id).toBeNull();
});

it("three queued attempts over the limit all send after the reset in enqueue order", async () => {
  const signal = AbortSignal.timeout(15_000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const queued = [
    await enqueueAgentic(ctx.db, f, signal),
    await enqueueAgentic(ctx.db, f, signal),
    await enqueueAgentic(ctx.db, f, signal),
  ];
  const retryAfter = [3600, 3500, 3600];
  for (const [i, q] of queued.entries()) {
    f.fake.setNextSend({ kind: "limit", retryAfter: retryAfter[i] ?? 3600 });
    expect(await runAttempt(ctx.db, f, q.key)).toEqual({
      ok: true,
      value: { status: "waiting_for_limit" },
    });
  }
  const waits = await Promise.all(
    queued.map(
      async (q) => new Date((await attemptState(ctx.db, q.attemptId)).next_attempt_at ?? 0),
    ),
  );
  expect(waits[1]!.getTime()).toBeGreaterThanOrEqual(waits[0]!.getTime());
  expect(waits[2]!.getTime()).toBeGreaterThanOrEqual(waits[1]!.getTime());

  const keys = queued.map((q) => q.key);
  await ctx.db.execute(sql`UPDATE email_send_attempts
    SET next_attempt_at = next_attempt_at - interval '2 hours' WHERE account_id=${f.accountId}`);
  await ctx.db.execute(sql`UPDATE pgboss.job SET start_after = start_after - interval '2 hours'
    WHERE name=${PGBOSS_QUEUE_EMAIL_SEND} AND data->>'accountId'=${f.accountId}`);

  const processed: string[] = [];
  for (let round = 0; round < 10 && processed.length < 3; round++) {
    const jobs = await boss.fetch<{ idempotencyKey: string }>(PGBOSS_QUEUE_EMAIL_SEND);
    for (const job of jobs) {
      if (keys.includes(job.data.idempotencyKey)) {
        expect((await runAttempt(ctx.db, f, job.data.idempotencyKey)).ok).toBe(true);
        processed.push(job.data.idempotencyKey);
      }
      await boss.complete(PGBOSS_QUEUE_EMAIL_SEND, job.id);
    }
  }

  expect(processed).toEqual(keys);
  expect(sentClientRefs(f.fake).slice(3)).toEqual(queued.map((q) => q.attemptId));
  for (const q of queued) {
    expect((await attemptState(ctx.db, q.attemptId)).status).toBe("sent");
    expect(f.fake.deliveries(q.attemptId)).toBe(1);
  }
});

it("a 422 marks failed with E_AINBOX_006", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "permanent", code: "E_BAD_RECIPIENT" });

  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "failed" } });
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("failed");
  expect(row.error_id).toBe("E_AINBOX_006");
  expect(row.send_started_at).toBeNull();
  expect(await jobStartAfter(key)).toEqual([]);
});

it("a first-POST 409 schedules a re-send at the end of the reconcile window", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "unknown" });

  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "sending" } });

  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("sending");
  expect(row.error_id).toBe("E_AINBOX_010");
  expect(row.send_started_at).not.toBeNull();
  const due = new Date(row.send_started_at ?? 0).getTime() + RECONCILE_WINDOW_MS;
  expect((await jobStartAfter(key)).map((d) => d.getTime())).toEqual([due]);

  f.fake.setNextSend({ kind: "unknown" });
  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "sending" } });
  expect((await jobStartAfter(key)).map((d) => d.getTime())).toEqual([due, due]);
});

it("a not-yet-due waiting attempt re-enqueues its job at next_attempt_at", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "limit", retryAfter: 600 });
  await runAttempt(ctx.db, f, key);
  await ctx.db.execute(sql`DELETE FROM pgboss.job
    WHERE name=${PGBOSS_QUEUE_EMAIL_SEND} AND data->>'idempotencyKey'=${key}`);

  expect(await runAttempt(ctx.db, f, key)).toEqual({
    ok: true,
    value: { status: "waiting_for_limit" },
  });

  const next = new Date((await attemptState(ctx.db, attemptId)).next_attempt_at ?? 0).getTime();
  expect((await jobStartAfter(key)).map((d) => d.getTime())).toEqual([next]);
  expect(f.fake.sendBodies()).toHaveLength(1);
});
