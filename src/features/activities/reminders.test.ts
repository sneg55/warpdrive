import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PGBOSS_QUEUE_ACTIVITY_REMINDER } from "@/constants/jobNames";
import { activities, activityTypes, deals, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { handleReminderJob, registerReminderWorker } from "./reminders";

// ---------------------------------------------------------------------------
// handleReminderJob
// ---------------------------------------------------------------------------

it("fires a notification for an open activity and skips a completed one", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "task"));
    if (type === undefined) throw new Error("activity type 'task' not found");

    const [open] = await db
      .insert(activities)
      .values({
        typeId: type.id,
        subject: "Open task",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-07-02T10:00:00Z"),
      })
      .returning();
    if (open === undefined) throw new Error("open activity insert failed");

    const [done] = await db
      .insert(activities)
      .values({
        typeId: type.id,
        subject: "Done task",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-07-02T10:00:00Z"),
        done: true,
        doneAt: new Date(),
      })
      .returning();
    if (done === undefined) throw new Error("done activity insert failed");

    await handleReminderJob(db, { data: { activityId: open.id } }, new AbortController().signal);
    await handleReminderJob(db, { data: { activityId: done.id } }, new AbortController().signal);

    const notes = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    const subjects = notes.map((n) => (n.payload as { subject?: string }).subject);
    expect(subjects).toContain("Open task");
    expect(subjects).not.toContain("Done task");
  });
});

it("inserts no notification for a done activity (done-skip guard)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "task"));
    if (type === undefined) throw new Error("activity type 'task' not found");

    const [done] = await db
      .insert(activities)
      .values({
        typeId: type.id,
        subject: "Already done",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-07-02T10:00:00Z"),
        done: true,
        doneAt: new Date(),
      })
      .returning();
    if (done === undefined) throw new Error("done activity insert failed");

    await handleReminderJob(db, { data: { activityId: done.id } }, new AbortController().signal);

    const notes = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(notes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Notification target: the reminder must point at something the UI can open.
// ---------------------------------------------------------------------------

it("targets the activity's parent deal, not the activity id", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualified"]);
    const stage = stages[0];
    if (stage === undefined) throw new Error("stage seed failed");

    const [deal] = await db
      .insert(deals)
      .values({
        title: "Acme",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal insert failed");

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "task"));
    if (type === undefined) throw new Error("activity type 'task' not found");

    const [activity] = await db
      .insert(activities)
      .values({
        typeId: type.id,
        subject: "Meeting",
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
        dueAt: new Date("2026-07-02T10:00:00Z"),
      })
      .returning();
    if (activity === undefined) throw new Error("activity insert failed");

    await handleReminderJob(
      db,
      { data: { activityId: activity.id } },
      new AbortController().signal,
    );

    const [note] = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    if (note === undefined) throw new Error("no notification produced");

    // Storing the activity id under entityType "activity" made the bell build /deals/<activityId>,
    // which always rendered Not found.
    expect(note.entityType).toBe("deal");
    expect(note.entityId).toBe(deal.id);
    expect((note.payload as { activityId?: string }).activityId).toBe(activity.id);
  });
});

it("leaves the target null for a parentless activity rather than pointing at the activity", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "task"));
    if (type === undefined) throw new Error("activity type 'task' not found");

    const [activity] = await db
      .insert(activities)
      .values({
        typeId: type.id,
        subject: "Standalone",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-07-02T10:00:00Z"),
      })
      .returning();
    if (activity === undefined) throw new Error("activity insert failed");

    await handleReminderJob(
      db,
      { data: { activityId: activity.id } },
      new AbortController().signal,
    );

    const [note] = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    if (note === undefined) throw new Error("no notification produced");

    expect(note.entityType).toBeNull();
    expect(note.entityId).toBeNull();
    expect((note.payload as { activityId?: string }).activityId).toBe(activity.id);
  });
});

// ---------------------------------------------------------------------------
// registerReminderWorker (DB-free: recording fake boss)
// ---------------------------------------------------------------------------

interface QueueRecord {
  name: string;
}
interface WorkRecord {
  name: string;
}

function makeFakeBoss() {
  const queues: QueueRecord[] = [];
  const workers: WorkRecord[] = [];

  return {
    queues,
    workers,
    createQueue(name: string): Promise<void> {
      queues.push({ name });
      return Promise.resolve();
    },
    work(name: string, handler: unknown): Promise<void> {
      void handler;
      workers.push({ name });
      return Promise.resolve();
    },
  };
}

describe("registerReminderWorker", () => {
  it("calls createQueue and work with the activity-reminder queue name", async () => {
    const fakeBoss = makeFakeBoss();

    await registerReminderWorker(
      fakeBoss as unknown as Parameters<typeof registerReminderWorker>[0],
    );

    const queueNames = fakeBoss.queues.map((q) => q.name);
    expect(queueNames).toContain(PGBOSS_QUEUE_ACTIVITY_REMINDER);

    const workerNames = fakeBoss.workers.map((w) => w.name);
    expect(workerNames).toContain(PGBOSS_QUEUE_ACTIVITY_REMINDER);
  });
});
