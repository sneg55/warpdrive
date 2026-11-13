import { PGBOSS_QUEUE_X_SYNC } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";

export async function enqueueXSyncNow(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const boss = requireBoss();
  if (boss === null) return;
  await boss.send(PGBOSS_QUEUE_X_SYNC, {});
  signal.throwIfAborted();
}
