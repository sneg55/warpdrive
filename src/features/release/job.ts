import type { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { PGBOSS_QUEUE_RELEASE_CHECK } from "@/constants/jobNames";
import { type Db, db as defaultDb } from "@/db/client";
import { RELEASE_CHECK_CRON, RELEASE_FETCH_TIMEOUT_MS } from "./constants";
import { fetchLatestRelease } from "./githubReleases";
import { upsertReleaseStatus } from "./releaseStatus";

// Fetch the latest release and cache it. A failed fetch is logged and the last-good row is left
// intact, so a transient GitHub outage never clears the banner.
export async function refreshReleaseCache(db: Db, signal: AbortSignal): Promise<void> {
  const r = await fetchLatestRelease(signal);
  if (!r.ok) {
    console.error(`release check: github fetch failed: ${r.error}`);
    return;
  }
  await upsertReleaseStatus(db, r.value);
}

// Register the update-check cron on the worker. No-op when disabled (a hosted deployment sets
// DISABLE_UPDATE_CHECK=true), so its worker never creates the queue or reaches out to GitHub.
// Otherwise: create the queue, register the handler, schedule the cron, and kick one immediate
// run so the banner is populated without waiting for the first tick.
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
