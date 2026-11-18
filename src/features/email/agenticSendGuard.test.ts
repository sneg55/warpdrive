import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { makeTestDb } from "@/test/db";
import { FakeStorageClient } from "../files/storageFake";
import {
  type AgenticSendFixture,
  attemptState,
  enqueueAgentic,
  recipients,
  runAttempt,
  startAgenticSendFixture,
} from "./agenticSend.test-helpers";
import { FakeGmailClient } from "./gmailFake";
import { gmailProvider } from "./provider/gmailProvider";
import { sendEmail } from "./send";
import { checkRecipientLimit } from "./sendInput";

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

function interactiveSend(to: string[], cc: string[], bcc: string[], trackOpens = false) {
  return sendEmail(ctx.db, {
    actorId: f.memberId,
    actorType: "regular",
    actorGroupIds: new Set(),
    provider: f.provider,
    storage: new FakeStorageClient(),
    input: {
      accountId: f.accountId,
      idempotencyKey: randomUUID(),
      to,
      cc,
      bcc,
      subject: "Hi",
      bodyHtml: "<p>hi</p>",
      trackOpens,
    },
    signal: AbortSignal.timeout(8000),
  });
}

it("a 51-recipient send is rejected before any POST", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const all = recipients(51);

  const r = await interactiveSend(all.slice(0, 20), all.slice(20, 40), all.slice(40));

  expect(r.ok ? null : r.error.id).toBe("E_AINBOX_007");
  expect(f.fake.sendBodies()).toEqual([]);
  const attempts = await ctx.db.execute(
    sql`SELECT id FROM email_send_attempts WHERE account_id=${f.accountId}`,
  );
  expect(attempts.rows).toEqual([]);
});

it("a queued 51-recipient attempt fails with E_AINBOX_007 before any POST", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal, recipients(51));

  expect(await runAttempt(ctx.db, f, key)).toEqual({ ok: true, value: { status: "failed" } });

  expect(f.fake.sendBodies()).toEqual([]);
  const row = await attemptState(ctx.db, attemptId);
  expect(row.status).toBe("failed");
  expect(row.error_id).toBe("E_AINBOX_007");
  expect(row.send_started_at).toBeNull();
});

it("a 50-recipient agentic send goes out", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const { attemptId, key } = await enqueueAgentic(ctx.db, f, signal, recipients(50));

  expect((await runAttempt(ctx.db, f, key)).ok).toBe(true);
  expect(f.fake.deliveries(attemptId)).toBe(1);
});

it("the recipient limit applies only to agentic mailboxes", () => {
  const r = { to: recipients(51) };
  expect(checkRecipientLimit("gmail", r).ok).toBe(true);
  expect(checkRecipientLimit("agentic_inbox", { to: recipients(50) }).ok).toBe(true);
  const over = checkRecipientLimit("agentic_inbox", r);
  expect(over.ok ? null : over.error.id).toBe("E_AINBOX_007");
});

it("an interactive send that hits the limit keeps its tracking tokens live", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  f.fake.setNextSend({ kind: "limit", retryAfter: 60 });

  const r = await interactiveSend(["jane@acme.com"], [], [], true);

  expect(r).toEqual({ ok: true, value: { status: "waiting_for_limit" } });
  const tokens = (
    await ctx.db.execute(sql`SELECT t.disabled FROM email_tracking_tokens t
      JOIN email_send_attempts s ON s.id = t.send_attempt_id WHERE s.account_id=${f.accountId}`)
  ).rows;
  expect(tokens).toEqual([{ disabled: false }]);
});

it("a scheduled 51-recipient send from an agentic mailbox is rejected at enqueue", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);

  const r = await sendEmail(ctx.db, {
    actorId: f.memberId,
    actorType: "regular",
    actorGroupIds: new Set(),
    provider: gmailProvider(new FakeGmailClient()),
    storage: new FakeStorageClient(),
    input: {
      accountId: f.accountId,
      idempotencyKey: randomUUID(),
      to: recipients(51),
      subject: "Later",
      bodyHtml: "<p>later</p>",
      scheduledSendAt: new Date(Date.now() + 3_600_000),
    },
    signal,
  });

  expect(r.ok ? null : r.error.id).toBe("E_AINBOX_007");
  const attempts = await ctx.db.execute(
    sql`SELECT id FROM email_send_attempts WHERE account_id=${f.accountId}`,
  );
  expect(attempts.rows).toEqual([]);
});

it("an interactive send with an unknown outcome keeps its tracking tokens live", async () => {
  const signal = AbortSignal.timeout(8000);
  f = await startAgenticSendFixture(ctx.db, signal);
  f.fake.setNextSend({ kind: "unknown" });

  const r = await interactiveSend(["jane@acme.com"], [], [], true);

  expect(r).toEqual({ ok: true, value: { status: "sending" } });
  const tokens = (
    await ctx.db.execute(sql`SELECT t.disabled FROM email_tracking_tokens t
      JOIN email_send_attempts s ON s.id = t.send_attempt_id WHERE s.account_id=${f.accountId}`)
  ).rows;
  expect(tokens).toEqual([{ disabled: false }]);
});
