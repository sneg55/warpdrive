import type { PgBoss as PgBossType } from "pg-boss";
import { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { registerReminderWorker } from "@/features/activities/reminders";
import { registerEmailJobs } from "@/features/email/workerJobs";
import { registerReaperJob } from "@/features/files/reaper";
import { registerImportWorkers } from "@/features/import/registerImportWorkers";
import { registerDealSearchJobs } from "@/features/intercom/dealSearch/job";
import { registerIntercomSyncJob } from "@/features/intercom/job";
import { registerEmailNotificationWorker } from "@/features/notifications/email/job";
import { registerReleaseCheckJob } from "@/features/release/job";
import { registerXSyncJob } from "@/features/x-dms/job";
import { setBoss } from "@/jobs/boss";

export async function registerAllJobs(boss: PgBossType): Promise<void> {
  await registerEmailJobs(boss);
  await registerReaperJob(boss);
  await registerImportWorkers(boss);
  await registerEmailNotificationWorker(boss);
  await registerReminderWorker(boss);
  await registerReleaseCheckJob(boss);
  await registerIntercomSyncJob(boss);
  await registerDealSearchJobs(boss);
  await registerXSyncJob(boss);
}

export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss(env.DATABASE_URL);
  await boss.start();
  setBoss(boss);
  await registerAllJobs(boss);
  console.warn("worker (pg-boss) started");
  return boss;
}
