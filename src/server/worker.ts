import type { PgBoss as PgBossType } from "pg-boss";
import { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { registerReminderWorker } from "@/features/activities/reminders";
import { registerEmailJobs } from "@/features/email/workerJobs";
import { registerReaperJob } from "@/features/files/reaper";
import { registerImportWorkers } from "@/features/import/registerImportWorkers";
import { registerEmailNotificationWorker } from "@/features/notifications/email/job";
import { setBoss } from "@/jobs/boss";

// Register all job handlers and schedules. Called after boss.start() and
// setBoss() so producers see the live boss before handlers are registered.
// Order: email jobs first (sync + send handlers + initial enqueues), then
// the file reaper (hourly cron schedule), then the activity reminder worker.
export async function registerAllJobs(boss: PgBossType): Promise<void> {
  await registerEmailJobs(boss);
  await registerReaperJob(boss);
  await registerImportWorkers(boss);
  await registerEmailNotificationWorker(boss);
  await registerReminderWorker(boss);
}

// Compose `worker` service. Boots pg-boss, publishes the singleton so producers
// can enqueue, then registers all job handlers and cron schedules.
export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss(env.DATABASE_URL);
  await boss.start();
  // Publish the live boss before registering handlers so producers that run
  // during registration (e.g. initial sync enqueues) already see a live boss.
  setBoss(boss);
  await registerAllJobs(boss);
  console.warn("worker (pg-boss) started");
  return boss;
}
