import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH } from "@/constants/jobNames";
import { requireBoss } from "@/jobs/requireBoss";
import { bossExecutorOn } from "@/jobs/txExecutor";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { dealsForPersons } from "./affected";

function logEnqueueFailure(dealId: string, cause: unknown): void {
  const e = new AppError(
    ERROR_IDS.SEARCH_INTERCOM_ENQUEUE_FAILED,
    "deal search refresh not queued",
    {
      dealId,
      cause: cause instanceof Error ? cause.message : String(cause),
    },
  );
  console.error(`${e.id} ${e.message}`, e.context);
}

export async function enqueueDealSearchRefresh(
  db: DbOrTx,
  dealIds: string[],
  signal: AbortSignal,
): Promise<void> {
  const unique = [...new Set(dealIds)];
  if (unique.length === 0) return;
  let boss: ReturnType<typeof requireBoss>;
  try {
    boss = requireBoss();
  } catch (e) {
    logEnqueueFailure(unique[0] ?? "", e);
    return;
  }
  if (boss === null) return;
  for (const dealId of unique) {
    signal.throwIfAborted();
    try {
      await db.transaction(async (savepoint) => {
        await boss.send(
          PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
          { dealId },
          { db: bossExecutorOn(savepoint) },
        );
      });
    } catch (e) {
      logEnqueueFailure(dealId, e);
    }
  }
}

export async function enqueueDealSearchRefreshForPersons(
  db: DbOrTx,
  personIds: string[],
  signal: AbortSignal,
): Promise<void> {
  try {
    await enqueueDealSearchRefresh(db, await dealsForPersons(db, personIds, signal), signal);
  } catch (e) {
    signal.throwIfAborted();
    logEnqueueFailure(personIds.join(","), e);
  }
}
