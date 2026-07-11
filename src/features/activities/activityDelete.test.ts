import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { deleteActivity } from "./activityDelete";
import { listActivityRows } from "./activityRows";
import { noFilter } from "./activityRowsTestHelpers";
import { createActivity } from "./repo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(user: { id: string; isAdmin: boolean }, flags: string[] = []): PermSetUser {
  return {
    id: user.id,
    type: user.isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags) as PermSetUser["flags"],
  };
}

async function seedCallActivity(
  db: typeof ctx.db,
  actor: PermSetUser,
  ownerId: string,
  dueAt: string,
  visibilityLevel: "all" | "owner" | "group" = "all",
) {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId,
      visibilityLevel,
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
      subject: "Call to delete",
      dealId: deal.id,
      dueAt,
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
  return { deal, type, activity: created.value };
}

it("deleteActivity soft-deletes the row, hides it from listActivityRows, and recomputes next activity", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user, ["activity.delete_own"]);

  const { deal, activity } = await seedCallActivity(
    ctx.db,
    actor,
    user.id,
    "2026-07-02T10:00:00.000Z",
  );
  // A second, later activity on the same deal so we can observe next_activity_at advance.
  await createActivity(
    ctx.db,
    actor,
    {
      typeId: activity.typeId,
      subject: "Later call",
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

  const result = await deleteActivity(ctx.db, actor, activity.id, new AbortController().signal);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.id).toBe(activity.id);

  const [reloaded] = await ctx.db.select().from(activities).where(eq(activities.id, activity.id));
  expect(reloaded?.deletedAt).not.toBeNull();

  const rows = await listActivityRows(ctx.db, actor, noFilter, new AbortController().signal);
  expect(rows.some((r) => r.id === activity.id)).toBe(false);

  const [d] = await ctx.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(d?.nextActivityAt?.toISOString()).toBe("2026-07-05T10:00:00.000Z");
});

it("deleteActivity returns 404-on-invisible for a stranger", async () => {
  const owner = await seedUser(ctx.db);
  const ownerActor = makeActor(owner, ["activity.delete_own"]);
  const stranger = await seedUser(ctx.db);
  const strangerActor = makeActor(stranger, ["activity.delete_own"]);

  const { activity } = await seedCallActivity(
    ctx.db,
    ownerActor,
    owner.id,
    "2026-07-10T10:00:00.000Z",
    "owner",
  );

  const result = await deleteActivity(
    ctx.db,
    strangerActor,
    activity.id,
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_001");
});

it("deleteActivity returns ACTIVITY_FORBIDDEN for a visible actor without delete rights", async () => {
  const owner = await seedUser(ctx.db);
  const ownerActor = makeActor(owner, ["activity.delete_own"]);
  const { activity } = await seedCallActivity(
    ctx.db,
    ownerActor,
    owner.id,
    "2026-07-10T10:00:00.000Z",
    "all",
  );

  const otherUser = await seedUser(ctx.db);
  const otherActor = makeActor(otherUser); // no delete flags: visible (level "all") but not permitted

  const result = await deleteActivity(
    ctx.db,
    otherActor,
    activity.id,
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_ACTIVITY_002");
});

it("deleteActivity returns ACTIVITY_NOT_FOUND when the row is already deleted", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user, ["activity.delete_own"]);
  const { activity } = await seedCallActivity(ctx.db, actor, user.id, "2026-07-10T10:00:00.000Z");

  const first = await deleteActivity(ctx.db, actor, activity.id, new AbortController().signal);
  expect(first.ok).toBe(true);

  const second = await deleteActivity(ctx.db, actor, activity.id, new AbortController().signal);
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.error.id).toBe("E_ACTIVITY_001");
});
