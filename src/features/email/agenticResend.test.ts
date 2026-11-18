import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { RECONCILE_WINDOW_MS } from "@/constants/email";
import { AppError, type ErrorId } from "@/constants/errorIds";
import { makeTestDb } from "@/test/db";
import { err } from "@/types/result";
import {
  type AgenticSendFixture,
  attemptState,
  crashAfterPost,
  enqueueAgentic,
  runAttempt,
  sentClientRefs,
  startAgenticSendFixture,
} from "./agenticSend.test-helpers";
import { applySendOutcome } from "./outboxOutcome";
import type { MailProvider, ProviderSendOutcome } from "./provider/types";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let f: AgenticSendFixture;

beforeAll(async () => {
  ctx = await makeTestDb();
});
afterEach(async () => {
  await f.fake.close();
});
afterAll(async () => {
  await ctx.close();
});

const pastWindow = (): number => Date.now() + RECONCILE_WINDOW_MS + 60_000;

it("a retry after a crash re-posts the same client_ref and the fake counts one delivery", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);

  await expect(
    runAttempt(ctx.db, f, key, { provider: crashAfterPost(f.provider) }),
  ).rejects.toThrow("worker died after the POST");
  const crashed = await attemptState(ctx.db, attemptId);
  expect(crashed.status).toBe("sending");
  expect(crashed.send_started_at).not.toBeNull();

  const r = await runAttempt(ctx.db, f, key);

  expect(r).toEqual({ ok: true, value: { status: "sent", gmailMessageId: "sent-1" } });
  expect(sentClientRefs(f.fake)).toEqual([attemptId, attemptId]);
  expect(f.fake.deliveries(attemptId)).toBe(1);
  expect(f.fake.totalDeliveries()).toBe(1);
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("sent");
  expect(row.gmail_message_id).toBe("sent-1");
});

it("a 409 inside the window stays retryable, outside it becomes needs_review", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "unknown" });
  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "sending" } });
  const first = await attemptState(ctx.db, attemptId);
  expect(first.status).toBe("sending");
  expect(first.error_id).toBe("E_AINBOX_010");
  expect(first.send_started_at).not.toBeNull();

  f.fake.setNextSend({ kind: "unknown" });
  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "sending" } });
  const inside = await attemptState(ctx.db, attemptId);
  expect(inside.status).toBe("sending");
  expect(inside.send_started_at).toEqual(first.send_started_at);
  expect(sentClientRefs(f.fake)).toEqual([attemptId, attemptId]);

  f.fake.setNextSend({ kind: "unknown" });
  const outside = await runAttempt(ctx.db, f, key, { now: pastWindow() });
  expect(outside).toEqual({ ok: true, value: { status: "needs_review" } });
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("needs_review");
  expect(row.error_id).toBe("E_AINBOX_010");
  expect(sentClientRefs(f.fake)).toEqual([attemptId, attemptId, attemptId]);
  expect(f.fake.totalDeliveries()).toBe(0);
});

it("an Access 302 during send marks failed, not needs_review", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  f.fake.setAuthMode("redirect");
  const fresh = await enqueueAgentic(ctx.db, f, signal);
  expect(await runAttempt(ctx.db, f, fresh.key)).toEqual({ ok: true, value: { status: "failed" } });
  const freshRow = await attemptState(ctx.db, fresh.attemptId);
  expect(freshRow.status).toBe("failed");
  expect(freshRow.error_id).toBe("E_AINBOX_001");
  expect(freshRow.send_started_at).toBeNull();

  const crashed = await enqueueAgentic(ctx.db, f, signal);
  await expect(
    runAttempt(ctx.db, f, crashed.key, { provider: crashAfterPost(f.provider) }),
  ).rejects.toThrow();
  const r = await runAttempt(ctx.db, f, crashed.key, { now: pastWindow() });

  expect(r).toEqual({ ok: true, value: { status: "failed" } });
  const row = await attemptState(ctx.db, crashed.attemptId);
  expect(row.status).toBe("failed");
  expect(row.error_id).toBe("E_AINBOX_001");
  expect(row.send_started_at).toBeNull();
});

function failingSend(provider: MailProvider, id: ErrorId): MailProvider {
  return {
    ...provider,
    send: () => Promise.resolve(err(new AppError(id, "provider send failed", {}))),
  };
}

it("a provider err during send records its error id on the attempt", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const auth = await enqueueAgentic(ctx.db, f, signal);
  const transport = await enqueueAgentic(ctx.db, f, signal);

  const a = await runAttempt(ctx.db, f, auth.key, {
    provider: failingSend(f.provider, "E_AINBOX_001"),
  });
  const t = await runAttempt(ctx.db, f, transport.key, {
    provider: failingSend(f.provider, "E_AINBOX_009"),
  });

  expect(a).toEqual({ ok: true, value: { status: "failed" } });
  expect(t).toEqual({ ok: true, value: { status: "sending" } });
  const authRow = await attemptState(ctx.db, auth.attemptId);
  expect(authRow.status).toBe("failed");
  expect(authRow.error_id).toBe("E_AINBOX_001");
  expect(authRow.send_started_at).toBeNull();
  const transportRow = await attemptState(ctx.db, transport.attemptId);
  expect(transportRow.status).toBe("sending");
  expect(transportRow.error_id).toBe("E_AINBOX_009");
  expect(transportRow.send_started_at).not.toBeNull();
});

it("a re-send that is still unknown past the window becomes needs_review", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "unknown" });
  await runAttempt(ctx.db, f, key);
  await ctx.db.execute(sql`UPDATE email_send_attempts
    SET send_started_at = send_started_at - ${`${RECONCILE_WINDOW_MS + 1000} milliseconds`}::interval
    WHERE id=${attemptId}`);

  f.fake.setNextSend({ kind: "unknown" });
  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "needs_review" } });

  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("needs_review");
  expect(row.error_id).toBe("E_AINBOX_010");
  expect(sentClientRefs(f.fake)).toEqual([attemptId, attemptId]);
  expect(f.fake.totalDeliveries()).toBe(0);
});

it("an outcome for an attempt already marked sent reports the stored send", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  await ctx.db.execute(sql`UPDATE email_send_attempts
    SET status='sent', gmail_message_id='sent-9', sent_at=now(), send_started_at=now()
    WHERE id=${attemptId}`);
  const error = new AppError("E_AINBOX_004", "limit", {});
  const outcomes: ProviderSendOutcome[] = [
    { kind: "retry_later", notBefore: null, error },
    { kind: "rejected", error },
    { kind: "unknown", error },
  ];
  const run = { accountId: f.accountId, idempotencyKey: key, signal, now: Date.now(), windowMs: 1 };

  for (const outcome of outcomes) {
    for (const resendStartedAt of [null, new Date().toISOString()]) {
      const r = await applySendOutcome(ctx.db, {
        attemptId,
        outcome,
        resendStartedAt,
        idempotentSend: true,
        run,
      });
      expect(r).toEqual({ ok: true, value: { status: "sent", gmailMessageId: "sent-9" } });
    }
  }
  expect((await attemptState(ctx.db, attemptId)).status).toBe("sent");
});

it("a queued job for an attempt in needs_review does not POST again", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal);
  f.fake.setNextSend({ kind: "unknown" });
  await runAttempt(ctx.db, f, key);
  f.fake.setNextSend({ kind: "unknown" });
  expect(await runAttempt(ctx.db, f, key, { now: pastWindow() })).toEqual({
    ok: true,
    value: { status: "needs_review" },
  });
  expect(sentClientRefs(f.fake)).toHaveLength(2);

  expect(await runAttempt(ctx.db, f, key, { now: pastWindow() })).toEqual({
    ok: true,
    value: { status: "needs_review" },
  });

  expect(sentClientRefs(f.fake)).toHaveLength(2);
  expect(f.fake.totalDeliveries()).toBe(0);
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("needs_review");
  expect(row.error_id).toBe("E_AINBOX_010");
});
