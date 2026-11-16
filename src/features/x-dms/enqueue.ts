import { PGBOSS_QUEUE_X_CHAT_BACKFILL, PGBOSS_QUEUE_X_SYNC } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";

export async function enqueueXSyncNow(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const boss = requireBoss();
  if (boss === null) return;
  await boss.send(PGBOSS_QUEUE_X_SYNC, {});
  signal.throwIfAborted();
}

async function sendBackfill(
  accountId: string,
  options: { singletonKey: string },
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const boss = requireBoss();
  if (boss === null) return;
  await boss.send(PGBOSS_QUEUE_X_CHAT_BACKFILL, { accountId }, options);
  signal.throwIfAborted();
}

export function enqueueXChatBackfill(accountId: string, signal: AbortSignal): Promise<void> {
  return sendBackfill(accountId, { singletonKey: accountId }, signal);
}
