import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, deals, organizations, persons } from "@/db/schema";
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

it("names the parent record so a calendar chip can say which deal it belongs to", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const typeId = await meetingTypeId(db);
    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");

    const [org] = await db
      .insert(organizations)
      .values({ name: "Initech", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    const [person] = await db
      .insert(persons)
      .values({ name: "Emma Stone", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    const [deal] = await db
      .insert(deals)
      .values({
        title: "Initech renewal",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({ title: "Inbound from Initech", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (org === undefined || person === undefined || deal === undefined || lead === undefined) {
      throw new Error("seed failed");
    }

    await db.insert(activities).values([
      {
        typeId,
        subject: "On deal",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: DUE,
        dealId: deal.id,
      },
      {
        typeId,
        subject: "On lead",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: DUE,
        leadId: lead.id,
      },
      {
        typeId,
        subject: "On contacts",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: DUE,
        personId: person.id,
        orgId: org.id,
      },
    ]);

    const out = await calendarRange(db, makeActor(user.id), RANGE, new AbortController().signal);
    const by = (s: string) => out.find((a) => a.subject === s);

    expect(by("On deal")?.dealTitle).toBe("Initech renewal");
    expect(by("On lead")?.leadId).toBe(lead.id);
    expect(by("On lead")?.leadTitle).toBe("Inbound from Initech");
    expect(by("On contacts")?.personName).toBe("Emma Stone");
    expect(by("On contacts")?.orgName).toBe("Initech");
  });
});
