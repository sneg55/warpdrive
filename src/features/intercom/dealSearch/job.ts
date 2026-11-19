import type { Job, PgBoss } from "pg-boss";
import { z } from "zod";
import {
  INTERCOM_DEAL_SEARCH_BACKFILL_EXPIRE_SECONDS,
  INTERCOM_DEAL_SEARCH_BACKFILL_RUN_TIMEOUT_MS,
  INTERCOM_DEAL_SEARCH_REFRESH_BATCH,
  INTERCOM_DEAL_SEARCH_RUN_EXPIRE_SECONDS,
  INTERCOM_DEAL_SEARCH_RUN_TIMEOUT_MS,
  INTERCOM_DEAL_SEARCH_SWEEP_CRON,
} from "@/constants/intercom";
import {
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL,
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP,
} from "@/constants/jobNames";
import { type Db, db as defaultDb } from "@/db/client";
import { dealsWithIntercomContacts } from "./affected";
import { dealSearchBackfillNeeded, runDealSearchBackfill } from "./backfill";
import { enqueueDealSearchRefresh } from "./enqueue";
import { refreshDealIntercomSearch } from "./refresh";

export const DEAL_SEARCH_REFRESH_QUEUE_OPTIONS = {
  policy: "standard",
  expireInSeconds: INTERCOM_DEAL_SEARCH_RUN_EXPIRE_SECONDS,
} as const;

const refreshJobSchema = z.object({ dealId: z.uuid() });

function runSignal(jobSignals: AbortSignal[], budgetMs: number): AbortSignal {
  return AbortSignal.any([...jobSignals, AbortSignal.timeout(budgetMs)]);
}

export async function handleDealSearchRefresh(db: Db, jobs: Job<unknown>[]): Promise<void> {
  const dealIds = jobs.flatMap((job) => {
    const data = refreshJobSchema.safeParse(job.data);
    return data.success ? [data.data.dealId] : [];
  });
  const signal = runSignal(
    jobs.map((job) => job.signal),
    INTERCOM_DEAL_SEARCH_RUN_TIMEOUT_MS,
  );
  await refreshDealIntercomSearch(db, dealIds, signal);
}

export async function handleDealSearchBackfill(
  db: Db,
  job: { signal: AbortSignal },
  options: { pageSize?: number; afterPage?: () => void } = {},
): Promise<void> {
  const signal = runSignal([job.signal], INTERCOM_DEAL_SEARCH_BACKFILL_RUN_TIMEOUT_MS);
  await runDealSearchBackfill(db, signal, options.pageSize, options.afterPage);
}

export async function handleDealSearchSweep(db: Db, job: { signal: AbortSignal }): Promise<void> {
  const signal = runSignal([job.signal], INTERCOM_DEAL_SEARCH_RUN_TIMEOUT_MS);
  await enqueueDealSearchRefresh(db, await dealsWithIntercomContacts(db, signal), signal);
}

export async function registerDealSearchJobs(boss: PgBoss, db: Db = defaultDb): Promise<void> {
  await boss.createQueue(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH, DEAL_SEARCH_REFRESH_QUEUE_OPTIONS);
  await boss.createQueue(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL, {
    policy: "exclusive",
    expireInSeconds: INTERCOM_DEAL_SEARCH_BACKFILL_EXPIRE_SECONDS,
  });
  await boss.work(
    PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
    { batchSize: INTERCOM_DEAL_SEARCH_REFRESH_BATCH },
    async (jobs: Job<unknown>[]) => {
      await handleDealSearchRefresh(db, jobs);
    },
  );
  await boss.work(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL, async ([job]: Job<unknown>[]) => {
    if (job === undefined) return;
    await handleDealSearchBackfill(db, job);
  });
  await boss.createQueue(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP, {
    expireInSeconds: INTERCOM_DEAL_SEARCH_RUN_EXPIRE_SECONDS,
  });
  await boss.work(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP, async ([job]: Job<unknown>[]) => {
    if (job === undefined) return;
    await handleDealSearchSweep(db, job);
  });
  await boss.schedule(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP, INTERCOM_DEAL_SEARCH_SWEEP_CRON);
  if (
    await dealSearchBackfillNeeded(db, AbortSignal.timeout(INTERCOM_DEAL_SEARCH_RUN_TIMEOUT_MS))
  ) {
    await boss.send(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL, {}, { singletonKey: "all" });
  }
}
