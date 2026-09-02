import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { recomputeDealActivityDates, recomputeDealsActivityDates } from "./nextActivity";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("does not bump the deal's updatedAt CAS token when recomputing next_activity_at", async () => {
  const db = ctx.db;
  const user = await seedUser(db, { isAdmin: true });
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "CAS token deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]?.id ?? "",
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");

  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("call activity type missing");
  await db.insert(activities).values({
    typeId: type.id,
    subject: "Follow up",
    dealId: deal.id,
    ownerId: user.id,
    assigneeId: user.id,
    dueAt: new Date("2030-01-01T10:00:00.000Z"),
  });

  await recomputeDealActivityDates(db, deal.id, AbortSignal.timeout(10_000));

  const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
  if (after === undefined) throw new Error("deal disappeared");
  // next_activity_at is a derived cache of the deal's activities, not an edit to the deal. Bumping
  // updatedAt here invalidates the open editor's compare-and-swap token, so a stage change made
  // right after adding an activity fails its CAS with "This deal changed elsewhere" (E_DEAL_002).
  expect(after.nextActivityAt?.toISOString()).toBe("2030-01-01T10:00:00.000Z");
  expect(after.updatedAt.getTime()).toBe(deal.updatedAt.getTime());
});

it("sets last_activity_at to the latest done activity and clears it when none is done", async () => {
  const db = ctx.db;
  const user = await seedUser(db, { isAdmin: true });
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "last activity deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]?.id ?? "",
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("call activity type missing");
  const base = { typeId: type.id, dealId: deal.id, ownerId: user.id, assigneeId: user.id };
  await db.insert(activities).values([
    { ...base, subject: "older done", done: true, dueAt: new Date("2026-08-01T10:00:00.000Z") },
    { ...base, subject: "latest done", done: true, dueAt: new Date("2026-08-20T10:00:00.000Z") },
    { ...base, subject: "still open", done: false, dueAt: new Date("2026-08-25T10:00:00.000Z") },
    { ...base, subject: "done with no date at all", done: true },
    {
      ...base,
      subject: "deleted done",
      done: true,
      dueAt: new Date("2026-08-30T10:00:00.000Z"),
      deletedAt: new Date(),
    },
  ]);

  await recomputeDealActivityDates(db, deal.id, AbortSignal.timeout(10_000));
  const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
  expect(after?.lastActivityAt?.toISOString()).toBe("2026-08-20T10:00:00.000Z");
  expect(after?.nextActivityAt?.toISOString()).toBe("2026-08-25T10:00:00.000Z");

  await db.update(activities).set({ done: false }).where(eq(activities.dealId, deal.id));
  await recomputeDealActivityDates(db, deal.id, AbortSignal.timeout(10_000));
  const [cleared] = await db.select().from(deals).where(eq(deals.id, deal.id));
  expect(cleared?.lastActivityAt).toBeNull();
});

it("serializes two concurrent activity inserts on one deal without deadlocking", async () => {
  const db = ctx.db;
  const user = await seedUser(db, { isAdmin: true });
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "contended deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]?.id ?? "",
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("call activity type missing");

  let inserted = 0;
  let release: () => void = () => {};
  const bothInserted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = (subject: string, dueAt: Date) =>
    db.transaction(async (tx) => {
      await tx.insert(activities).values({
        typeId: type.id,
        subject,
        dealId: deal.id,
        ownerId: user.id,
        assigneeId: user.id,
        done: true,
        dueAt,
      });
      inserted += 1;
      if (inserted === 2) release();
      await bothInserted;
      await recomputeDealActivityDates(tx, deal.id, AbortSignal.timeout(10_000));
    });

  await Promise.all([
    writer("first", new Date("2026-08-10T10:00:00.000Z")),
    writer("second", new Date("2026-08-12T10:00:00.000Z")),
  ]);

  const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
  expect(after?.lastActivityAt?.toISOString()).toBe("2026-08-12T10:00:00.000Z");
});

it("recomputes a set of deals in one lock order so cross re-links cannot deadlock", async () => {
  const db = ctx.db;
  const user = await seedUser(db, { isAdmin: true });
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const seedDeal = async (title: string) => {
    const [deal] = await db
      .insert(deals)
      .values({
        title,
        pipelineId: pipe.pipeline.id,
        stageId: pipe.stages[0]?.id ?? "",
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");
    return deal.id;
  };
  const a = await seedDeal("A");
  const b = await seedDeal("B");

  let ready = 0;
  let release: () => void = () => {};
  const bothReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  const worker = (order: string[]) =>
    db.transaction(async (tx) => {
      ready += 1;
      if (ready === 2) release();
      await bothReady;
      await recomputeDealsActivityDates(tx, order, AbortSignal.timeout(10_000));
    });

  await expect(Promise.all([worker([a, b]), worker([b, a])])).resolves.toBeDefined();
});

it("dates an undated done activity by when it was marked done", async () => {
  const db = ctx.db;
  const user = await seedUser(db, { isAdmin: true });
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "undated done deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]?.id ?? "",
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "email"));
  if (type === undefined) throw new Error("email activity type missing");
  await db.insert(activities).values({
    typeId: type.id,
    dealId: deal.id,
    ownerId: user.id,
    assigneeId: user.id,
    subject: "logged email",
    done: true,
    doneAt: new Date("2026-08-15T09:00:00.000Z"),
  });

  await recomputeDealActivityDates(db, deal.id, AbortSignal.timeout(10_000));
  const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
  expect(after?.lastActivityAt?.toISOString()).toBe("2026-08-15T09:00:00.000Z");
});
