import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, deals, persons } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { calendarRange } from "./calendar";

const RANGE = { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-07-31T00:00:00Z") };
const DUE = new Date("2026-07-02T10:00:00Z");

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function meetingTypeId(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
  if (type === undefined) throw new Error("activity type 'meeting' not found");
  return type.id;
}

it("hides an owner-only lead's title from the assignee of an activity hanging off it", async () => {
  await withTestDb(async (db) => {
    // A lead-parented activity has no lead branch in the dominant-parent rule, so it resolves as
    // parentless and its assignee can see it. That must not carry the private lead's name with it.
    const owner = await seedUser(db);
    const assignee = await seedUser(db);
    const typeId = await meetingTypeId(db);

    const [lead] = await db
      .insert(leads)
      .values({ title: "Secret pipeline", ownerId: owner.id, visibilityLevel: "owner" })
      .returning();
    if (lead === undefined) throw new Error("lead seed failed");

    await db.insert(activities).values({
      typeId,
      subject: "On private lead",
      ownerId: assignee.id,
      assigneeId: assignee.id,
      dueAt: DUE,
      leadId: lead.id,
    });

    const out = await calendarRange(
      db,
      makeActor(assignee.id),
      RANGE,
      new AbortController().signal,
    );
    const row = out.find((a) => a.subject === "On private lead");
    expect(row).toBeDefined();
    expect(row?.leadTitle).toBeNull();
    expect(row?.leadId).toBeNull();
  });
});

it("hides an owner-only contact's name on an activity the actor sees through its deal", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const actor = await seedUser(db);
    const typeId = await meetingTypeId(db);
    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");

    const [person] = await db
      .insert(persons)
      .values({ name: "Private Contact", ownerId: owner.id, visibilityLevel: "owner" })
      .returning();
    const [deal] = await db
      .insert(deals)
      .values({
        title: "Shared deal",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: actor.id,
        visibilityLevel: "all",
      })
      .returning();
    if (person === undefined || deal === undefined) throw new Error("seed failed");

    await db.insert(activities).values({
      typeId,
      subject: "Deal call",
      ownerId: actor.id,
      assigneeId: actor.id,
      dueAt: DUE,
      dealId: deal.id,
      personId: person.id,
    });

    const out = await calendarRange(db, makeActor(actor.id), RANGE, new AbortController().signal);
    const row = out.find((a) => a.subject === "Deal call");
    expect(row?.dealTitle).toBe("Shared deal");
    expect(row?.personName).toBeNull();
    expect(row?.personId).toBeNull();
  });
});
