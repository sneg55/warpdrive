import { and, eq, isNull } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { PGBOSS_QUEUE_ACTIVITY_REMINDER, REMINDER_LEAD_MINUTES } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { activities, notifications } from "@/db/schema";
import { enqueueEmailNotification } from "@/features/notifications/emailDispatch";
import { requireBoss } from "@/jobs/requireBoss";

interface ReminderJob {
  data: { activityId: string };
}

// Enqueue an activity-reminder job to fire REMINDER_LEAD_MINUTES before dueAt.
// No-ops when dueAt is null (undated) or no pg-boss is set (tests, scripts); in production
// requireBoss throws rather than dropping the reminder. singletonKey dedups re-schedules.
export async function scheduleReminder(
  activityId: string,
  dueAt: Date | null,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (dueAt === null) return;
  const boss = requireBoss();
  if (boss === null) return;
  const fireAt = new Date(dueAt.getTime() - REMINDER_LEAD_MINUTES * 60_000);
  await boss.send(
    PGBOSS_QUEUE_ACTIVITY_REMINDER,
    { activityId },
    { startAfter: fireAt, singletonKey: activityId },
  );
}

// Re-read the activity at fire time and insert a notification for its assignee,
// then enqueue an email notification if the assignee has email delivery enabled.
// Skips if the activity was completed, deleted, or rescheduled away (done/missing),
// so a stale job never produces a reminder for an activity that no longer needs one.
export async function handleReminderJob(
  db: Db,
  job: ReminderJob,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const [a] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, job.data.activityId), isNull(activities.deletedAt)));
  if (a === undefined || a.done === true) return;
  const [inserted] = await db
    .insert(notifications)
    .values({
      userId: a.assigneeId,
      type: "activity_reminder",
      entityType: "activity",
      entityId: a.id,
      actorId: null,
      payload: { subject: a.subject, dueAt: a.dueAt?.toISOString() ?? null },
    })
    .returning({ id: notifications.id });
  if (inserted === undefined) return;
  await enqueueEmailNotification(db, inserted.id, a.assigneeId, "activity_reminder", signal);
}

// Register the pg-boss worker that processes activity-reminder jobs.
// Follows the exact pattern in src/features/email/workerJobs.ts (job ARRAY
// destructure). If handleReminderJob throws (DB error), the error propagates
// so pg-boss applies its retry/backoff.
export async function registerReminderWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(PGBOSS_QUEUE_ACTIVITY_REMINDER);
  await boss.work(PGBOSS_QUEUE_ACTIVITY_REMINDER, async ([job]: Job<{ activityId: string }>[]) => {
    if (job === undefined) return;
    await handleReminderJob(prodDb, job, AbortSignal.timeout(30_000));
  });
}
