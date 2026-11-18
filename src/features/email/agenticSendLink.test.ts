import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { type AgenticSendFixture, startAgenticSendFixture } from "./agenticSend.test-helpers";
import { seedDealAndPerson } from "./draft.test-helpers";
import { sendEmail } from "./send";
import { runSendJob } from "./worker";

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

function linkedSend(key: string, link: { dealId: string; personId: string }) {
  return sendEmail(ctx.db, {
    actorId: f.memberId,
    actorType: "regular",
    actorGroupIds: new Set(),
    provider: f.provider,
    storage: new FakeStorageClient(),
    input: {
      accountId: f.accountId,
      idempotencyKey: key,
      to: ["jane@acme.com"],
      subject: "Linked",
      bodyHtml: "<p>linked</p>",
      linkDealId: link.dealId,
      linkPersonId: link.personId,
      visibility: "shared",
    },
    signal: AbortSignal.timeout(8000),
  });
}

async function threadLink(gmailThreadId: string) {
  return (
    await ctx.db.execute(sql`SELECT deal_id, person_id, visibility FROM email_threads
      WHERE account_id=${f.accountId} AND gmail_thread_id=${gmailThreadId}`)
  ).rows;
}

it("a send that waits for the limit keeps its deal, person and visibility on the worker's CRM copy", async () => {
  const signal = AbortSignal.timeout(15_000);
  f = await startAgenticSendFixture(ctx.db, signal);
  const link = await seedDealAndPerson(ctx.db, f.memberId);
  f.fake.seedEmail({ id: "sent-1", folder: "sent", thread_id: "thread-inline" });
  f.fake.seedEmail({ id: "sent-2", folder: "sent", thread_id: "thread-worker" });

  expect((await linkedSend(randomUUID(), link)).ok).toBe(true);

  const waitingKey = randomUUID();
  f.fake.setNextSend({ kind: "limit", retryAfter: 60 });
  expect(await linkedSend(waitingKey, link)).toEqual({
    ok: true,
    value: { status: "waiting_for_limit" },
  });
  await ctx.db.execute(sql`UPDATE email_send_attempts SET next_attempt_at = now() - interval '1 second'
    WHERE account_id=${f.accountId} AND idempotency_key=${waitingKey}`);
  const job = await runSendJob(
    ctx.db,
    { accountId: f.accountId, idempotencyKey: waitingKey, signal },
    { resolveClient: () => Promise.resolve(ok(f.provider)) },
  );
  expect(job).toEqual({ ok: true, value: { status: "sent" } });

  const expected = [{ deal_id: link.dealId, person_id: link.personId, visibility: "shared" }];
  expect(await threadLink("thread-inline")).toEqual(expected);
  expect(await threadLink("thread-worker")).toEqual(expected);
});
