import { EMAIL_JOB_RETRY_LIMIT, PGBOSS_QUEUE_EMAIL_SEND } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";

export function isFutureScheduledSend(
  scheduledSendAt: Date | undefined,
  now: number,
): scheduledSendAt is Date {
  return scheduledSendAt !== undefined && scheduledSendAt.getTime() > now;
}

export async function enqueueScheduledSendJob(
  accountId: string,
  idempotencyKey: string,
  scheduledSendAt: Date,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
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
  signal.throwIfAborted();
}
