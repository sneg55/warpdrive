import type { PgBoss } from "pg-boss";
import { PGBOSS_QUEUE_X_SYNC } from "@/constants/jobNames";
import { X_SYNC_CRON, X_SYNC_RUN_TIMEOUT_MS } from "@/constants/xDms";
import { db as defaultDb } from "@/db/client";
import { abortableSleep } from "@/features/intercom/intercomHttp";
import { type XDmSettings, xDmSettings } from "./settings";
import { runXSyncAll, type SyncDeps } from "./sync";
import { makeXClient } from "./xClient";

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

export async function registerXSyncJob(
  boss: PgBoss,
  settings: XDmSettings | null = xDmSettings(),
): Promise<void> {
  if (settings === null) return;
  const client = makeXClient({ settings, fetch, sleep: abortableSleep, nowMs: () => Date.now() });
  await boss.createQueue(PGBOSS_QUEUE_X_SYNC, { policy: "exclusive" });
  await boss.work(PGBOSS_QUEUE_X_SYNC, async () => {
    await handleXSyncRun(
      { db: defaultDb, client, nowMs: () => Date.now() },
      AbortSignal.timeout(X_SYNC_RUN_TIMEOUT_MS),
    );
  });
  await boss.schedule(PGBOSS_QUEUE_X_SYNC, X_SYNC_CRON);
  await boss.send(PGBOSS_QUEUE_X_SYNC, {});
}
