import type { PgBoss } from "pg-boss";
import { INTERCOM_SYNC_CRON, INTERCOM_SYNC_RUN_TIMEOUT_MS } from "@/constants/intercom";
import { PGBOSS_QUEUE_INTERCOM_SYNC } from "@/constants/jobNames";
import { db as defaultDb } from "@/db/client";
import { makeIntercomClient } from "./intercomClient";
import { abortableSleep } from "./intercomHttp";
import { type IntercomSettings, intercomSettings } from "./settings";
import { runIntercomSync } from "./sync";

export async function registerIntercomSyncJob(
  boss: PgBoss,
  settings: IntercomSettings | null = intercomSettings(),
): Promise<void> {
  if (settings === null) return;
  const client = makeIntercomClient({
    ...settings,
    fetch: (url, init) => fetch(url, { ...init, signal: init.signal }),
    sleep: abortableSleep,
    nowMs: () => Date.now(),
  });
  await boss.createQueue(PGBOSS_QUEUE_INTERCOM_SYNC, { policy: "exclusive" });
  await boss.work(PGBOSS_QUEUE_INTERCOM_SYNC, async () => {
    await runIntercomSync(
      { db: defaultDb, client, nowMs: () => Date.now() },
      AbortSignal.timeout(INTERCOM_SYNC_RUN_TIMEOUT_MS),
    );
  });
  await boss.schedule(PGBOSS_QUEUE_INTERCOM_SYNC, INTERCOM_SYNC_CRON);
  await boss.send(PGBOSS_QUEUE_INTERCOM_SYNC, {});
}
