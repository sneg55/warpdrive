import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  activities,
  activityGuests,
  activityParticipants,
  activityTypes,
  deals,
  persons,
} from "@/db/schema";
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

function makeActor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function seedDeal(db: typeof ctx.db, ownerId: string, title: string): Promise<string> {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title,
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");
  return deal.id;
}

it("edits participants, guests, video call, and the deal link in one update", async () => {
  const db = ctx.db;
  const owner = await seedUser(db, { name: "Owner" });
  const teammate = await seedUser(db, { name: "Teammate" });
  const actor = makeActor(owner.id);

  const dealA = await seedDeal(db, owner.id, "Deal A");
  const dealB = await seedDeal(db, owner.id, "Deal B");

  const [guest] = await db
    .insert(persons)
    .values({
      name: "Guest Person",
      primaryEmail: "guest@example.com",
      emails: [{ label: "work", value: "guest@example.com", primary: true }],
      phones: [],
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!guest) throw new Error("person seed failed");

  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("no call type");

  const created = await createActivity(
    db,
    actor,
    {
      typeId: type.id,
      subject: "Sync",
      dealId: dealA,
      dueAt: "2026-07-10T10:00:00.000Z",
    },
    AbortSignal.timeout(8000),
  );
  if (!created.ok) throw new Error(`create failed: ${created.error.id}`);
  const activityId = created.value.id;

  const r = await updateActivity(
    db,
    actor,
    {
      id: activityId,
      videoCallUrl: "https://call.example.com/abc",
      participantUserIds: [teammate.id],
      guestPersonIds: [guest.id],
      dealId: dealB,
    },
    AbortSignal.timeout(8000),
  );
  expect(r.ok).toBe(true);

  const [row] = await db.select().from(activities).where(eq(activities.id, activityId));
  expect(row?.videoCallUrl).toBe("https://call.example.com/abc");
  expect(row?.dealId).toBe(dealB);

  const parts = await db
    .select()
    .from(activityParticipants)
    .where(eq(activityParticipants.activityId, activityId));
  expect(parts.map((p) => p.userId)).toEqual([teammate.id]);

  const guests = await db
    .select()
    .from(activityGuests)
    .where(eq(activityGuests.activityId, activityId));
  expect(guests.map((g) => g.personId)).toEqual([guest.id]);

  // Relinking moves the activity: deal A no longer has a next activity, deal B now does.
  const [a] = await db
    .select({ next: deals.nextActivityAt })
    .from(deals)
    .where(eq(deals.id, dealA));
  const [b] = await db
    .select({ next: deals.nextActivityAt })
    .from(deals)
    .where(eq(deals.id, dealB));
  expect(a?.next).toBeNull();
  expect(b?.next).not.toBeNull();
});

it("replaces the participant set (removed participants are dropped)", async () => {
  const db = ctx.db;
  const owner = await seedUser(db, { name: "Owner2" });
  const u1 = await seedUser(db, { name: "P1" });
  const u2 = await seedUser(db, { name: "P2" });
  const actor = makeActor(owner.id);
  const dealId = await seedDeal(db, owner.id, "Deal C");
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("no call type");

  const created = await createActivity(
    db,
    actor,
    { typeId: type.id, subject: "S", dealId, participantUserIds: [u1.id] },
    AbortSignal.timeout(8000),
  );
  if (!created.ok) throw new Error("create failed");

  await updateActivity(
    db,
    actor,
    { id: created.value.id, participantUserIds: [u2.id] },
    AbortSignal.timeout(8000),
  );

  const parts = await db
    .select()
    .from(activityParticipants)
    .where(and(eq(activityParticipants.activityId, created.value.id)));
  expect(parts.map((p) => p.userId).sort()).toEqual([u2.id]);
});
