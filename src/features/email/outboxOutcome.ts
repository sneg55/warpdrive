import { sql } from "drizzle-orm";
import { AGENTIC_RETRY_LATER_DEFAULT_MS } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { assertNever, err, ok, type Result } from "@/types/result";
import { markSent, type SendOutcome } from "./outboxReconcile";
import type { ProviderSendOutcome } from "./provider/types";
import { enqueueScheduledSendJob } from "./sendScheduling";

export interface OutcomeRun {
  accountId: string;
  idempotencyKey: string;
  signal: AbortSignal;
  now: number;
  windowMs: number;
}

interface SettleArgs {
  attemptId: string;
  resendStartedAt: string | null;
  idempotentSend: boolean;
  run: OutcomeRun;
}

export function outcomeFromSendError(error: AppError): ProviderSendOutcome {
  return error.id === ERROR_IDS.AINBOX_AUTH_FAILED
    ? { kind: "rejected", error }
    : { kind: "unknown", error };
}

async function alreadySettled(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
): Promise<Result<SendOutcome, AppError>> {
  const row = (
    await db.execute(
      sql`SELECT status, gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`,
    )
  ).rows[0] as { status: string; gmail_message_id: string | null } | undefined;
  signal.throwIfAborted();
  if (row?.status !== "sent") {
    return err(
      new AppError("E_DB_002", "attempt changed while settling its outcome", {
        attemptId,
        status: row?.status ?? null,
      }),
    );
  }
  return ok({ status: "sent", gmailMessageId: row.gmail_message_id ?? undefined });
}

async function updated(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
  rows: unknown[],
  outcome: SendOutcome,
): Promise<Result<SendOutcome, AppError>> {
  signal.throwIfAborted();
  return rows.length === 0 ? alreadySettled(db, attemptId, signal) : ok(outcome);
}

async function waitForLimit(
  db: Db,
  a: SettleArgs,
  notBefore: Date,
  error: AppError,
): Promise<Result<SendOutcome, AppError>> {
  const rows = (
    await db.execute(sql`
      UPDATE email_send_attempts s
      SET status='waiting_for_limit', send_started_at=NULL, claim_token=NULL, error_id=${error.id},
        next_attempt_at=GREATEST(${notBefore.toISOString()}::timestamptz, (
          SELECT max(o.next_attempt_at) FROM email_send_attempts o
          WHERE o.account_id=s.account_id AND o.status='waiting_for_limit' AND o.id<>s.id
        ))
      WHERE s.id=${a.attemptId} AND s.status <> 'sent'
      RETURNING s.next_attempt_at
    `)
  ).rows as { next_attempt_at: string | Date }[];
  const row = rows[0];
  if (row === undefined) return alreadySettled(db, a.attemptId, a.run.signal);
  const { run } = a;
  await enqueueScheduledSendJob(
    run.accountId,
    run.idempotencyKey,
    new Date(row.next_attempt_at),
    run.signal,
  );
  return ok({ status: "waiting_for_limit" });
}

export async function requeueWaiting(
  db: Db,
  attemptId: string,
  run: OutcomeRun,
): Promise<Result<SendOutcome, AppError>> {
  const row = (
    await db.execute(sql`SELECT next_attempt_at FROM email_send_attempts
      WHERE id=${attemptId} AND status='waiting_for_limit' AND next_attempt_at IS NOT NULL`)
  ).rows[0] as { next_attempt_at: string | Date } | undefined;
  run.signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError("E_GMAIL_008", "attempt not claimable", { id: attemptId }));
  }
  await enqueueScheduledSendJob(
    run.accountId,
    run.idempotencyKey,
    new Date(row.next_attempt_at),
    run.signal,
  );
  return ok({ status: "waiting_for_limit" });
}

async function settleAgenticUnknown(
  db: Db,
  a: SettleArgs,
  error: AppError,
): Promise<Result<SendOutcome, AppError>> {
  const { run } = a;
  const rows = (
    await db.execute(sql`
      UPDATE email_send_attempts SET status='sending', error_id=${error.id}
      WHERE id=${a.attemptId} AND status <> 'sent' AND send_started_at IS NOT NULL
      RETURNING send_started_at
    `)
  ).rows as { send_started_at: string | Date }[];
  const row = rows[0];
  if (row === undefined) return alreadySettled(db, a.attemptId, run.signal);
  const due = new Date(new Date(row.send_started_at).getTime() + run.windowMs);
  await enqueueScheduledSendJob(run.accountId, run.idempotencyKey, due, run.signal);
  return ok({ status: "sending" });
}

async function settleUnknown(
  db: Db,
  a: SettleArgs,
  error: AppError,
): Promise<Result<SendOutcome, AppError>> {
  const { run } = a;
  if (!a.idempotentSend) {
    const rows = await db.execute(sql`
      UPDATE email_send_attempts SET status='failed', error_id=${error.id}
      WHERE id=${a.attemptId} AND status <> 'sent' RETURNING id
    `);
    return updated(db, a.attemptId, run.signal, rows.rows, { status: "failed" });
  }
  const pastWindow =
    a.resendStartedAt !== null && run.now >= new Date(a.resendStartedAt).getTime() + run.windowMs;
  if (!pastWindow) return settleAgenticUnknown(db, a, error);
  const rows = await db.execute(sql`
    UPDATE email_send_attempts SET status='needs_review', error_id=${error.id}
    WHERE id=${a.attemptId} AND status <> 'sent' RETURNING id
  `);
  return updated(db, a.attemptId, run.signal, rows.rows, { status: "needs_review" });
}

export async function applySendOutcome(
  db: Db,
  args: SettleArgs & { outcome: ProviderSendOutcome },
): Promise<Result<SendOutcome, AppError>> {
  const { attemptId, outcome, run } = args;
  switch (outcome.kind) {
    case "sent":
      await markSent(db, attemptId, outcome.providerMessageId, run.signal);
      return ok({ status: "sent", gmailMessageId: outcome.providerMessageId });
    case "rejected": {
      const rows = await db.execute(sql`
        UPDATE email_send_attempts
        SET status='failed', error_id=${outcome.error.id}, send_started_at=NULL, claim_token=NULL
        WHERE id=${attemptId} AND status <> 'sent' RETURNING id
      `);
      return updated(db, attemptId, run.signal, rows.rows, { status: "failed" });
    }
    case "retry_later":
      return waitForLimit(
        db,
        args,
        outcome.notBefore ?? new Date(run.now + AGENTIC_RETRY_LATER_DEFAULT_MS),
        outcome.error,
      );
    case "unknown":
      return settleUnknown(db, args, outcome.error);
    default:
      return assertNever(outcome);
  }
}
