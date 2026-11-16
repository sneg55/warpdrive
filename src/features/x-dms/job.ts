import type { Job, PgBoss } from "pg-boss";
import { z } from "zod";
import { PGBOSS_QUEUE_X_CHAT_BACKFILL, PGBOSS_QUEUE_X_SYNC } from "@/constants/jobNames";
import { X_BACKFILL_RUN_TIMEOUT_MS, X_SYNC_CRON, X_SYNC_RUN_TIMEOUT_MS } from "@/constants/xDms";
import { db as defaultDb } from "@/db/client";
import { abortableSleep } from "@/features/intercom/intercomHttp";
import { runXChatBackfill } from "./backfill";
import { type XDmSettings, xDmSettings } from "./settings";
import { runXSyncAll, type SyncDeps } from "./sync";
import { makeXClient } from "./xClient";

const backfillJobSchema = z.object({ accountId: z.string().min(1) });

export async function handleXSyncRun(
  deps: SyncDeps,
  signal: AbortSignal,
  run: typeof runXSyncAll = runXSyncAll,
): Promise<void> {
  try {
    await run(deps, signal);
  } catch (e) {
    if (!signal.aborted) throw e;
    console.warn("x sync: run hit its time limit and was cut short");
  }
}

export async function handleXChatBackfillRun(
  deps: SyncDeps,
  job: { data: unknown },
  signal: AbortSignal,
  run: typeof runXChatBackfill = runXChatBackfill,
): Promise<void> {
  const data = backfillJobSchema.safeParse(job.data);
  if (!data.success) return;
  const { accountId } = data.data;
  try {
    await run(deps, accountId, signal);
  } catch (e) {
    if (!signal.aborted) throw e;
    console.warn("x backfill: run hit its time limit", { accountId });
  }
}

export async function registerXSyncJob(
  boss: PgBoss,
  settings: XDmSettings | null = xDmSettings(),
): Promise<void> {
  if (settings === null) return;
  const client = makeXClient({ settings, fetch, sleep: abortableSleep, nowMs: () => Date.now() });
  const deps = (): SyncDeps => ({ db: defaultDb, client, nowMs: () => Date.now() });
  await boss.createQueue(PGBOSS_QUEUE_X_SYNC, { policy: "exclusive" });
  await boss.work(PGBOSS_QUEUE_X_SYNC, async () => {
    await handleXSyncRun(deps(), AbortSignal.timeout(X_SYNC_RUN_TIMEOUT_MS));
  });
  await boss.createQueue(PGBOSS_QUEUE_X_CHAT_BACKFILL, { policy: "exclusive" });
  await boss.work(PGBOSS_QUEUE_X_CHAT_BACKFILL, async ([job]: Job<unknown>[]) => {
    if (job === undefined) return;
    await handleXChatBackfillRun(deps(), job, AbortSignal.timeout(X_BACKFILL_RUN_TIMEOUT_MS));
  });
  await boss.schedule(PGBOSS_QUEUE_X_SYNC, X_SYNC_CRON);
  await boss.send(PGBOSS_QUEUE_X_SYNC, {});
}
