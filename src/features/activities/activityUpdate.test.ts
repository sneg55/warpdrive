import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { updateActivity } from "./activityUpdate";
import { createActivity } from "./repo";

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

async function seedCallActivity(
  db: typeof ctx.db,
  actor: PermSetUser,
  ownerId: string,
  overrides?: { priority?: string | null; note?: string | null },
) {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");

  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  const created = await createActivity(
    db,
    actor,
    {
      typeId: type.id,
      subject: "Original subject",
      dealId: deal.id,
      dueAt: "2026-07-10T10:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
      priority: overrides?.priority ?? null,
      note: overrides?.note ?? null,
    },
    new AbortController().signal,
  );
  if (!created.ok) throw new Error("activity creation failed");
  return { deal, type, activity: created.value };
}

it("updateActivity renames the subject and reads back the new value", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id);

  const result = await updateActivity(
    ctx.db,
    actor,
    { id: activity.id, subject: "Renamed" },
    new AbortController().signal,
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.subject).toBe("Renamed");

  const [reloaded] = await ctx.db.select().from(activities).where(eq(activities.id, activity.id));
  expect(reloaded?.subject).toBe("Renamed");
});

it("updateActivity returns 404-on-invisible for a stranger", async () => {
  const owner = await seedUser(ctx.db);
  const ownerActor = makeActor(owner);
  const stranger = await seedUser(ctx.db);
  const strangerActor = makeActor(stranger);

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

  const result = await updateActivity(
    ctx.db,
    strangerActor,
    { id: created.value.id, subject: "Hijacked" },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_001");
});

it("updateActivity rejects an empty patch (only id)", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id);

  const result = await updateActivity(
    ctx.db,
    actor,
    { id: activity.id },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_005");
});

it("updateActivity returns ACTIVITY_TYPE_INVALID when the patched typeId does not exist", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id);

  const result = await updateActivity(
    ctx.db,
    actor,
    { id: activity.id, typeId: "00000000-0000-0000-0000-000000000000" },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_006");
});

it("updateActivity returns ACTIVITY_TYPE_INVALID when the patched typeId is archived", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id);

  const [archivedType] = await ctx.db
    .insert(activityTypes)
    .values({
      key: `archived-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "Archived Type",
      archivedAt: new Date(),
    })
    .returning();
  if (!archivedType) throw new Error("archived type seed failed");

  const result = await updateActivity(
    ctx.db,
    actor,
    { id: activity.id, typeId: archivedType.id },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_006");
});

it("updateActivity returns USER_NOT_FOUND when the patched assigneeId is inactive", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id);
  const inactiveUser = await seedUser(ctx.db, { isActive: false });

  const result = await updateActivity(
    ctx.db,
    actor,
    { id: activity.id, assigneeId: inactiveUser.id },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_USER_001");
});

it("updateActivity returns ACTIVITY_FORBIDDEN for a visible actor without edit rights", async () => {
  const owner = await seedUser(ctx.db);
  const ownerActor = makeActor(owner);
  const { activity } = await seedCallActivity(ctx.db, ownerActor, owner.id);

  const stranger = await seedUser(ctx.db);
  const strangerActor = makeActor(stranger);

  const result = await updateActivity(
    ctx.db,
    strangerActor,
    { id: activity.id, subject: "Hijacked" },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_002");
});

it("updateActivity patching only subject leaves note/dueAt/priority unchanged", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id, {
    priority: "high",
    note: "<p>Keep me</p>",
  });

  const result = await updateActivity(
    ctx.db,
    actor,
    { id: activity.id, subject: "Renamed only" },
    new AbortController().signal,
  );

  expect(result.ok).toBe(true);

  const [reloaded] = await ctx.db.select().from(activities).where(eq(activities.id, activity.id));
  expect(reloaded?.subject).toBe("Renamed only");
  expect(reloaded?.priority).toBe("high");
  expect(reloaded?.dueAt?.toISOString()).toBe("2026-07-10T10:00:00.000Z");
  expect(reloaded?.note).toContain("Keep me");
});
