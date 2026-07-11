import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { completeActivity, createActivity } from "./repo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(user: { id: string; isAdmin: boolean }): PermSetUser {
  return {
    id: user.id,
    type: user.isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

it("completing the soonest activity advances next_activity_at to the next open one", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const [deal] = await ctx.db
    .insert(deals)
    .values({
      title: "D2",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");

  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  const first = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "A",
      dealId: deal.id,
      dueAt: "2026-07-02T10:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    new AbortController().signal,
  );
  await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "B",
      dealId: deal.id,
      dueAt: "2026-07-05T10:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    new AbortController().signal,
  );
  if (!first.ok) throw new Error("setup failed");

  const done = await completeActivity(
    ctx.db,
    actor,
    first.value.id,
    true,
    new AbortController().signal,
  );
  expect(done.ok).toBe(true);
  if (done.ok) expect(done.value.doneAt).not.toBeNull();

  const [d] = await ctx.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(d?.nextActivityAt?.toISOString()).toBe("2026-07-05T10:00:00.000Z");
});

it("completeActivity(done:false) reopens a completed activity", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const [deal] = await ctx.db
    .insert(deals)
    .values({
      title: "D-reopen",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");

  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  const created = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Reopen me",
      dealId: deal.id,
      dueAt: "2026-07-10T10:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    new AbortController().signal,
  );
  if (!created.ok) throw new Error("activity creation failed");

  const done = await completeActivity(
    ctx.db,
    actor,
    created.value.id,
    true,
    new AbortController().signal,
  );
  expect(done.ok).toBe(true);
  if (!done.ok) return;
  expect(done.value.done).toBe(true);
  expect(done.value.doneAt).not.toBeNull();

  const reopened = await completeActivity(
    ctx.db,
    actor,
    created.value.id,
    false,
    new AbortController().signal,
  );
  expect(reopened.ok).toBe(true);
  if (!reopened.ok) return;
  expect(reopened.value.done).toBe(false);
  expect(reopened.value.doneAt).toBeNull();
});

it("completeActivity returns 404-on-invisible when actor cannot see the deal", async () => {
  // Owner creates the deal with visibilityLevel "owner" (only owner can see it).
  const owner = await seedUser(ctx.db);
  const ownerActor = makeActor(owner);
  const outsider = await seedUser(ctx.db);
  const outsiderActor = makeActor(outsider);

  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const [deal] = await ctx.db
    .insert(deals)
    .values({
      title: "Hidden deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "owner",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");

  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  // Owner creates the activity on the hidden deal.
  const created = await createActivity(
    ctx.db,
    ownerActor,
    {
      typeId: type.id,
      subject: "Secret call",
      dealId: deal.id,
      dueAt: "2026-07-10T10:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    new AbortController().signal,
  );
  if (!created.ok) throw new Error("activity creation failed");

  // Outsider tries to complete it: should get 404-on-invisible, not 403.
  const result = await completeActivity(
    ctx.db,
    outsiderActor,
    created.value.id,
    true,
    new AbortController().signal,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_001");
});
