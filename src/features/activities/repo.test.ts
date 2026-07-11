import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activityTypes, deals, leads } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
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

it("creating a dated activity sets the deal next_activity_at to the soonest open due", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
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

  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Later call",
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

  const r = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Sooner call",
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
  expect(r.ok).toBe(true);

  const [d] = await ctx.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(d?.nextActivityAt?.toISOString()).toBe("2026-07-02T10:00:00.000Z");
});

it("createActivity rejects a leadId the actor cannot see (404-on-invisible)", async () => {
  // Owner creates a private ("owner"-visibility) lead. An outsider must not be able to
  // attach an activity to it just by knowing its id.
  const owner = await seedUser(ctx.db);
  const outsider = await seedUser(ctx.db);
  const outsiderActor = makeActor(outsider);

  const [lead] = await ctx.db
    .insert(leads)
    .values({ title: "Hidden lead", ownerId: owner.id, visibilityLevel: "owner" })
    .returning();
  if (!lead) throw new Error("lead seed failed");

  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  const result = await createActivity(
    ctx.db,
    outsiderActor,
    {
      typeId: type.id,
      subject: "Sneaky activity",
      leadId: lead.id,
      dealId: null,
      personId: null,
      orgId: null,
      dueAt: "2026-07-10T10:00:00.000Z",
      durationMinutes: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    new AbortController().signal,
  );

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.id).toBe("E_LEAD_001");
});
