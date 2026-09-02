import { describe, expect, it } from "vitest";
import { activities, persons } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listActivityRows } from "./activityRows";
import { actor, callTypeId, noFilter, sig } from "./activityRowsTestHelpers";

describe("listActivityRows secondary link gates", () => {
  it("nulls a lead the actor cannot see while keeping the activity visible through its person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Mia Costa", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [lead] = await db
        .insert(leads)
        .values({ title: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (person === undefined || lead === undefined) throw new Error("seed failed");
      await db.insert(activities).values({
        typeId: await callTypeId(db),
        subject: "Qualify",
        ownerId: owner.id,
        assigneeId: owner.id,
        leadId: lead.id,
        personId: person.id,
        dueAt: new Date("2026-07-02T10:00:00Z"),
      });

      const rows = await listActivityRows(db, actor(other.id), noFilter, sig());
      const row = rows.find((r) => r.subject === "Qualify");
      expect(row?.personId).toBe(person.id);
      expect(row?.leadId).toBeNull();
      expect(row?.leadTitle).toBeNull();

      const ownerRows = await listActivityRows(db, actor(owner.id), noFilter, sig());
      expect(ownerRows.find((r) => r.subject === "Qualify")?.leadId).toBe(lead.id);
    });
  });
});
