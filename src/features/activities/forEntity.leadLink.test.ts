import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, persons } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { listActivitiesForEntity } from "./forEntity";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("carries the lead link of a lead-scoped activity listed from a contact page", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = makeActor(user.id);
    const [person] = await db
      .insert(persons)
      .values({ name: "Mia Costa", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");
    const [lead] = await db
      .insert(leads)
      .values({ title: "L", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (lead === undefined) throw new Error("lead seed failed");
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Qualify",
      ownerId: user.id,
      assigneeId: user.id,
      leadId: lead.id,
      personId: person.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const rows = await listActivitiesForEntity(db, actor, "person", person.id, signal);
    expect(rows[0]?.subject).toBe("Qualify");
    expect(rows[0]?.leadId).toBe(lead.id);
  });
});

it("hides the lead link when the actor cannot see that lead", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const actor = makeActor(other.id);
    const [person] = await db
      .insert(persons)
      .values({ name: "Mia Costa", ownerId: owner.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");
    const [lead] = await db
      .insert(leads)
      .values({ title: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
      .returning();
    if (lead === undefined) throw new Error("lead seed failed");
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Qualify",
      ownerId: owner.id,
      assigneeId: owner.id,
      leadId: lead.id,
      personId: person.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const rows = await listActivitiesForEntity(db, actor, "person", person.id, signal);
    expect(rows[0]?.subject).toBe("Qualify");
    expect(rows[0]?.leadId).toBeNull();
  });
});
