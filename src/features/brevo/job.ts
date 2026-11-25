import type { PgBoss } from "pg-boss";
import { BREVO_SYNC_CRON, BREVO_SYNC_RUN_TIMEOUT_MS } from "@/constants/brevo";
import { PGBOSS_QUEUE_BREVO_SYNC } from "@/constants/jobNames";
import { db as defaultDb } from "@/db/client";
import { makeBrevoClient } from "./brevoClient";
import { abortableSleep } from "./brevoHttp";
import { type BrevoSettings, brevoSettings } from "./settings";
import { runBrevoSync } from "./sync";

export async function registerBrevoSyncJob(
  boss: PgBoss,
  settings: BrevoSettings | null = brevoSettings(),
): Promise<void> {
  if (settings === null) return;
  const client = makeBrevoClient({
    ...settings,
    fetch: (url, init) => fetch(url, { ...init, signal: init.signal }),
    sleep: abortableSleep,
    nowMs: () => Date.now(),
  });
  await boss.createQueue(PGBOSS_QUEUE_BREVO_SYNC, { policy: "exclusive" });
  await boss.work(PGBOSS_QUEUE_BREVO_SYNC, async () => {
    await runBrevoSync(
      { db: defaultDb, client, nowMs: () => Date.now() },
      AbortSignal.timeout(BREVO_SYNC_RUN_TIMEOUT_MS),
    );
  });
  await boss.schedule(PGBOSS_QUEUE_BREVO_SYNC, BREVO_SYNC_CRON);
  await boss.send(PGBOSS_QUEUE_BREVO_SYNC, {});
}
