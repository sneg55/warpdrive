import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { processSendAttempt } from "./outbox";
import { sendEmail } from "./send";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("attributes team sends to the actor and rejects queued sends after removal", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "sender@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  const gmail = new FakeGmailClient();
  const storage = new FakeStorageClient();
  const args = {
    actorId: user.id,
    actorType: "regular" as const,
    actorGroupIds: new Set<string>(),
    gmail,
    storage,
    signal,
    input: {
      accountId,
      idempotencyKey: randomUUID(),
      to: ["customer@external.com"],
      subject: "Reply",
      bodyHtml: "<p>Hello</p>",
    },
  };
  const sent = await sendEmail(ctx.db, args);
  expect(sent.ok).toBe(true);
  expect(
    (
      await ctx.db.execute(
        sql`SELECT sent_by_user_id FROM email_messages WHERE account_id=${accountId}`,
      )
    ).rows[0]?.sent_by_user_id,
  ).toBe(user.id);
  const key = randomUUID();
  expect(
    (
      await sendEmail(ctx.db, {
        ...args,
        input: {
          ...args.input,
          idempotencyKey: key,
          scheduledSendAt: new Date(Date.now() + 3600000),
        },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await ctx.db.execute(
        sql`SELECT payload->>'actorId' AS actor FROM email_send_attempts WHERE idempotency_key=${key}`,
      )
    ).rows[0]?.actor,
  ).toBe(user.id);
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  await ctx.db.execute(
    sql`UPDATE email_send_attempts SET scheduled_at=NULL WHERE idempotency_key=${key}`,
  );
  const removed = await processSendAttempt(ctx.db, {
    accountId,
    idempotencyKey: key,
    gmail,
    storage,
    signal,
  });
  expect(removed.ok ? null : removed.error.id).toBe("E_PERM_007");
  expect(
    (await sendEmail(ctx.db, { ...args, input: { ...args.input, idempotencyKey: randomUUID() } }))
      .ok,
  ).toBe(false);
});
