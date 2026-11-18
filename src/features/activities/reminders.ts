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

export async function registerReminderWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(PGBOSS_QUEUE_ACTIVITY_REMINDER);
  await boss.work(PGBOSS_QUEUE_ACTIVITY_REMINDER, async ([job]: Job<{ activityId: string }>[]) => {
    if (job === undefined) return;
    await handleReminderJob(prodDb, job, AbortSignal.timeout(30_000));
  });
}
