import { sql } from "drizzle-orm";
import { expect } from "vitest";
import type { withTestDb } from "@/db/testing";
import { ok } from "@/types/result";
import type { FakeGmailClient } from "./gmailFake";
import type { SendPayload } from "./outboxClaim";
import { runSendJob } from "./worker";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
export async function seedAccount(
  db: TestDb,
  ownerId: string,
  email: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const id = (
    (
      await db.execute(
        sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
      )
    ).rows[0] as { id: string }
  ).id;
  signal.throwIfAborted();
  return id;
}
export async function threadVisibility(
  db: TestDb,
  accountId: string,
  gmailThreadId: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      SELECT visibility FROM email_threads
      WHERE account_id=${accountId} AND gmail_thread_id=${gmailThreadId}
    `)
  ).rows[0] as { visibility: string } | undefined;
  signal.throwIfAborted();
  return row?.visibility;
}
export async function deliverScheduled(
  db: TestDb,
  args: { accountId: string; idempotencyKey: string; workerFake: FakeGmailClient },
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.execute(
    sql`UPDATE email_send_attempts SET scheduled_at = now() - interval '1 second' WHERE account_id = ${args.accountId} AND idempotency_key = ${args.idempotencyKey}`,
  );
  signal.throwIfAborted();
  const jobResult = await runSendJob(
    db,
    {
      accountId: args.accountId,
      idempotencyKey: args.idempotencyKey,
      signal,
    },
    { resolveClient: () => Promise.resolve(ok(args.workerFake)) },
  );
  signal.throwIfAborted();
  expect(jobResult.ok).toBe(true);
  if (jobResult.ok) expect(jobResult.value.status).toBe("sent");
}
export async function seedSentAttempt(
  db: TestDb,
  args: { accountId: string; gmailMessageId: string; payload: SendPayload },
  signal: AbortSignal,
): Promise<string> {
  const idempotencyKey = crypto.randomUUID();
  const messageIdHeader = `${crypto.randomUUID()}@gunsnation.com`;
  signal.throwIfAborted();
  const id = (
    (
      await db.execute(sql`
        INSERT INTO email_send_attempts
          (idempotency_key, message_id_header, account_id, payload, status, gmail_message_id, sent_at)
        VALUES
          (${idempotencyKey}, ${messageIdHeader}, ${args.accountId}, ${JSON.stringify(args.payload)}::jsonb, 'sent', ${args.gmailMessageId}, now())
        RETURNING id
      `)
    ).rows[0] as { id: string }
  ).id;
  signal.throwIfAborted();
  return id;
}
