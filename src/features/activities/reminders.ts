import { and, eq, isNull } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { PGBOSS_QUEUE_ACTIVITY_REMINDER, REMINDER_LEAD_MINUTES } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { activities } from "@/db/schema";
import { notifyActivityReminder } from "@/features/notifications/wire";
import { requireBoss } from "@/jobs/requireBoss";
import { activityParentRef } from "./notifyHelpers";

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

// Re-read the activity at fire time and notify its assignee.
// Skips if the activity was completed, deleted, or rescheduled away (done/missing),
// so a stale job never produces a reminder for an activity that no longer needs one.
//
// Delivery goes through notifyActivityReminder rather than a direct insert. Inserting here stored
// entityType "activity" plus the ACTIVITY id, which the feed turned into /deals/<activityId>
// (always Not found), and it also bypassed the shared producer's visibility gate and its realtime
// publish. The row now targets the activity's DOMINANT PARENT, a record the user can actually
// open; the activity id stays in the payload.
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
  const parent = activityParentRef(a);
  await notifyActivityReminder(db, {
    activityId: a.id,
    assigneeId: a.assigneeId,
    entityType: parent.entityType,
    entityId: parent.entityId,
    subject: a.subject,
    dueAt: a.dueAt?.toISOString() ?? null,
    signal,
  });
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
