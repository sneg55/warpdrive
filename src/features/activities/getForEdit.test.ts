import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals, persons } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { getActivityForEdit } from "./getForEdit";
import { createActivity } from "./repo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("returns the full activity with its guest and participant sets for the edit composer", async () => {
  const db = ctx.db;
  const owner = await seedUser(db, { name: "Owner" });
  const teammate = await seedUser(db, { name: "Teammate" });
  const actor = makeActor(owner.id);

  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");

  const [guest] = await db
    .insert(persons)
    .values({
      name: "Guest",
      primaryEmail: "g@example.com",
      emails: [{ label: "work", value: "g@example.com", primary: true }],
      phones: [],
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!guest) throw new Error("person seed failed");

  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
  if (!type) throw new Error("no meeting type");

  const created = await createActivity(
    db,
    actor,
    {
      typeId: type.id,
      subject: "Kickoff",
      dealId: deal.id,
      dueAt: "2026-08-01T09:00:00.000Z",
      location: "HQ",
      videoCallUrl: "https://call.example.com/x",
      guestPersonIds: [guest.id],
      participantUserIds: [teammate.id],
    },
    AbortSignal.timeout(8000),
  );
  if (!created.ok) throw new Error(`create failed: ${created.error.id}`);

  const r = await getActivityForEdit(db, actor, created.value.id, AbortSignal.timeout(8000));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value).toMatchObject({
    typeId: type.id,
    subject: "Kickoff",
    dueAt: "2026-08-01T09:00:00.000Z",
    location: "HQ",
    videoCallUrl: "https://call.example.com/x",
    dealId: deal.id,
    guestPersonIds: [guest.id],
    participantUserIds: [teammate.id],
  });
});

it("returns ACTIVITY_NOT_FOUND for a missing activity", async () => {
  const owner = await seedUser(ctx.db, { name: "Owner2" });
  const r = await getActivityForEdit(
    ctx.db,
    makeActor(owner.id),
    "00000000-0000-0000-0000-000000000000",
    AbortSignal.timeout(8000),
  );
  expect(r.ok).toBe(false);
});

it("normalizes a legacy display-name priority ('Low') to the enum key ('low') so edit round-trips", async () => {
  const db = ctx.db;
  const owner = await seedUser(db, { name: "Owner3" });
  const actor = makeActor(owner.id);
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("no call type");

  // Insert directly with the legacy display-name value (bypassing createActivity's enum).
  const [row] = await db
    .insert(activities)
    .values({
      typeId: type.id,
      subject: "Legacy",
      priority: "Low",
      ownerId: owner.id,
      assigneeId: owner.id,
      dealId: deal.id,
    })
    .returning();
  if (!row) throw new Error("activity insert failed");

  const res = await getActivityForEdit(db, actor, row.id, AbortSignal.timeout(8000));
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.value.priority).toBe("low");
});
