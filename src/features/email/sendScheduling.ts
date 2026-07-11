import { EMAIL_JOB_RETRY_LIMIT, PGBOSS_QUEUE_EMAIL_SEND } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";

// Pure scheduling predicate shared by the send action and the send orchestrator.
// A "future scheduled send" is one whose scheduledSendAt is strictly after now: it must
// NOT call Gmail immediately (the worker sends it when due) and must NOT trigger an OAuth
// token refresh in the action. now is injected so callers and tests stay deterministic.
export function isFutureScheduledSend(scheduledSendAt: Date | undefined, now: number): boolean {
  return scheduledSendAt !== undefined && scheduledSendAt.getTime() > now;
}

// Enqueue a delayed pg-boss job on PGBOSS_QUEUE_EMAIL_SEND so the worker's send handler
// fires processSendAttempt (+ CRM copy + token backfill via runSendJob) when the row
// becomes due. pg-boss startAfter accepts a Date and delays the job until that time.
// No-ops when no boss is set (tests, scripts) so DB-only tests stay free of a live queue; in
// production requireBoss throws rather than dropping a scheduled send that the user believes is
// queued. singletonKey=idempotencyKey prevents duplicate jobs on retries.
export async function enqueueScheduledSendJob(
  accountId: string,
  idempotencyKey: string,
  scheduledSendAt: Date,
): Promise<void> {
  const boss = requireBoss();
  if (boss === null) return;
  await boss.send(
    PGBOSS_QUEUE_EMAIL_SEND,
    { accountId, idempotencyKey },
    {
      startAfter: scheduledSendAt,
      singletonKey: idempotencyKey,
      retryLimit: EMAIL_JOB_RETRY_LIMIT,
      retryBackoff: true,
    },
  );
}
