import { BACKOFF_START_MS } from "@/constants/email";
import { EMAIL_JOB_RETRY_LIMIT, PGBOSS_QUEUE_EMAIL_SYNC } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";

const RETRY_DELAY_SECONDS = Math.ceil(BACKOFF_START_MS / 1000);

// Seed the per-mailbox sync chain for a freshly connected mailbox.
//
// The sync chain is otherwise self-perpetuating (each sync job re-enqueues the next tick) but is
// only ever STARTED in two places: at worker boot, where registerEmailJobs loops over the
// already-connected accounts, and here. A mailbox connected while the worker is already running is
// invisible to that boot loop, so without this call its chain never starts and the inbox stays
// empty (no inbound sync) until the next worker restart. Call this on every connect/reconnect;
// singletonKey=accountId dedups against any chain that is already running, so a redundant call is a
// no-op rather than a duplicate tick. No-ops when no boss is set (tests/scripts); requireBoss throws
// in production if the boss is missing, so a real wiring failure surfaces instead of silently
// dropping the first sync.
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
