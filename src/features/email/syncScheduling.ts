import { BACKOFF_START_MS } from "@/constants/email";
import { EMAIL_JOB_RETRY_LIMIT, PGBOSS_QUEUE_EMAIL_SYNC } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";

const RETRY_DELAY_SECONDS = Math.ceil(BACKOFF_START_MS / 1000);

export async function enqueueInitialSync(accountId: string): Promise<void> {
  const boss = requireBoss();
  if (boss === null) return;
  await boss.send(
    PGBOSS_QUEUE_EMAIL_SYNC,
    { accountId },
    {
      singletonKey: accountId,
      retryLimit: EMAIL_JOB_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: RETRY_DELAY_SECONDS,
    },
  );
}
