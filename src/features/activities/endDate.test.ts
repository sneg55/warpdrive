import { and, eq, isNull } from "drizzle-orm";
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

async function seedDeal(user: { id: string }) {
  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const [deal] = await ctx.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");
  return deal;
}

async function callType(): Promise<{ id: string }> {
  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");
  return type;
}

const SIG = () => new AbortController().signal;

it("round-trips a multi-day endAt on create", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const deal = await seedDeal(user);
  const type = await callType();

  const r = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Conference",
      dealId: deal.id,
      dueAt: "2026-07-10T09:00:00.000Z",
      endAt: "2026-07-12T17:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    SIG(),
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const [row] = await ctx.db
    .select()
    .from(activities)
    .where(and(eq(activities.id, r.value.id), isNull(activities.deletedAt)));
  expect(row?.endAt?.toISOString()).toBe("2026-07-12T17:00:00.000Z");
});

it("rejects an endAt earlier than the start on create", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const deal = await seedDeal(user);
  const type = await callType();

  const r = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Backwards",
      dealId: deal.id,
      dueAt: "2026-07-10T09:00:00.000Z",
      endAt: "2026-07-09T09:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    SIG(),
  );
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error.id).toBe("E_ACTIVITY_007");
});

it("round-trips a video call link on create", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const deal = await seedDeal(user);
  const type = await callType();

  const r = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Sync",
      dealId: deal.id,
      dueAt: "2026-07-10T09:00:00.000Z",
      videoCallUrl: "https://meet.warpdrive.app/room-42",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    SIG(),
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const [row] = await ctx.db.select().from(activities).where(eq(activities.id, r.value.id));
  expect(row?.videoCallUrl).toBe("https://meet.warpdrive.app/room-42");
});

it("round-trips endAt on update and rejects a backwards endAt", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const deal = await seedDeal(user);
  const type = await callType();

  const created = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Trip",
      dealId: deal.id,
      dueAt: "2026-07-10T09:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    SIG(),
  );
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const okUpdate = await updateActivity(
    ctx.db,
    actor,
    { id: created.value.id, endAt: "2026-07-12T17:00:00.000Z" },
    SIG(),
  );
  expect(okUpdate.ok).toBe(true);

  const [row] = await ctx.db.select().from(activities).where(eq(activities.id, created.value.id));
  expect(row?.endAt?.toISOString()).toBe("2026-07-12T17:00:00.000Z");

  const badUpdate = await updateActivity(
    ctx.db,
    actor,
    { id: created.value.id, endAt: "2026-07-01T09:00:00.000Z" },
    SIG(),
  );
  expect(badUpdate.ok).toBe(false);
  if (badUpdate.ok) return;
  expect(badUpdate.error.id).toBe("E_ACTIVITY_007");
});
