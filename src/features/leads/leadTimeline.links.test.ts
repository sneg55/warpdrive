import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, organizations, persons } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { leadTimeline } from "./leadTimeline";

function visSession(userId: string, isAdmin = false) {
  return {
    userId,
    isAdmin,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
  };
}

const sig = () => new AbortController().signal;

describe("leadTimeline linked contacts", () => {
  it("carries the visible person and organization links and names", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [person] = await db
        .insert(persons)
        .values({ name: "Mia Costa", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [org] = await db
        .insert(organizations)
        .values({ name: "Silver Labs", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined || person === undefined || org === undefined) {
        throw new Error("seed failed");
      }
      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      await db.insert(activities).values({
        typeId: type!.id,
        subject: "Qualify",
        dueAt: new Date(),
        ownerId: owner.id,
        assigneeId: owner.id,
        leadId: lead.id,
        personId: person.id,
        orgId: org.id,
      });

      const feed = await leadTimeline(db, visSession(owner.id), lead.id, sig());
      const item = feed.items.find((i) => i.kind === "activity");
      if (item?.kind !== "activity") throw new Error("no activity item");
      expect(item.activity.personId).toBe(person.id);
      expect(item.activity.personName).toBe("Mia Costa");
      expect(item.activity.orgId).toBe(org.id);
      expect(item.activity.orgName).toBe("Silver Labs");
    });
  });

  it("hides a linked contact the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [person] = await db
        .insert(persons)
        .values({ name: "Private Person", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (lead === undefined || person === undefined) throw new Error("seed failed");
      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      await db.insert(activities).values({
        typeId: type!.id,
        subject: "Qualify",
        dueAt: new Date(),
        ownerId: owner.id,
        assigneeId: owner.id,
        leadId: lead.id,
        personId: person.id,
      });

      const feed = await leadTimeline(db, visSession(other.id), lead.id, sig());
      const item = feed.items.find((i) => i.kind === "activity");
      if (item?.kind !== "activity") throw new Error("no activity item");
      expect(item.activity.personId).toBeNull();
      expect(item.activity.personName).toBeNull();
    });
  });
});
