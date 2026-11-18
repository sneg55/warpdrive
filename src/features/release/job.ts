import type { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { PGBOSS_QUEUE_RELEASE_CHECK } from "@/constants/jobNames";
import { type Db, db as defaultDb } from "@/db/client";
import { RELEASE_CHECK_CRON, RELEASE_FETCH_TIMEOUT_MS } from "./constants";
import { fetchLatestRelease } from "./githubReleases";
import { upsertReleaseStatus } from "./releaseStatus";

export async function refreshReleaseCache(db: Db, signal: AbortSignal): Promise<void> {
  const r = await fetchLatestRelease(signal);
  if (!r.ok) {
    console.error(`release check: github fetch failed: ${r.error}`);
    return;
  }
  await upsertReleaseStatus(db, r.value);
}

export async function registerReleaseCheckJob(
  boss: PgBoss,
  disabled: boolean = env.DISABLE_UPDATE_CHECK,
): Promise<void> {
  if (disabled) return;
  await boss.createQueue(PGBOSS_QUEUE_RELEASE_CHECK);
  await boss.work(PGBOSS_QUEUE_RELEASE_CHECK, async () => {
    await refreshReleaseCache(defaultDb, AbortSignal.timeout(RELEASE_FETCH_TIMEOUT_MS));
  });
  await boss.schedule(PGBOSS_QUEUE_RELEASE_CHECK, RELEASE_CHECK_CRON);
  await boss.send(PGBOSS_QUEUE_RELEASE_CHECK, {});
}
