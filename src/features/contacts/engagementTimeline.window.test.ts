import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, deals, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { engagementTimeline } from "./engagementTimeline";

function actor(id: string, groupIds: string[] = [], isAdmin = false): PermSetUser {
  return {
    id,
    type: isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(groupIds),
    flags: new Set(),
  };
}

const sig = () => new AbortController().signal;
const NOW = new Date("2026-07-15T00:00:00.000Z");

async function callTypeId(db: Parameters<Parameters<typeof withTestDb>[0]>[0]): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (t === undefined) throw new Error("activity type 'call' not seeded");
  return t.id;
}

describe("engagementTimeline visibility + period window", () => {
  it("does not leak an owner-only contact as a lane when the activity is visible via its deal", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const call = await callTypeId(db);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const [deal] = await db
        .insert(deals)
        .values({
          title: "Open deal",
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: owner.id,
          visibilityLevel: "all",
        })
        .returning();
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Owner-only Olga", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (deal === undefined || hidden === undefined) throw new Error("seed failed");

      await db.insert(activities).values({
        typeId: call,
        subject: "Deal call, tags a hidden person",
        ownerId: owner.id,
        assigneeId: owner.id,
        dealId: deal.id,
        personId: hidden.id,
        dueAt: new Date("2026-07-05T10:00:00.000Z"),
      });

      const leaked = await engagementTimeline(
        db,
        actor(other.id),
        { entity: "person", monthsBack: 3, ownerId: null, typeKey: null, now: NOW },
        sig(),
      );
      expect(leaked.lanes.map((l) => l.contactName)).not.toContain("Owner-only Olga");

      const forOwner = await engagementTimeline(
        db,
        actor(owner.id),
        { entity: "person", monthsBack: 3, ownerId: null, typeKey: null, now: NOW },
        sig(),
      );
      expect(forOwner.lanes.map((l) => l.contactName)).toContain("Owner-only Olga");
    });
  });

  it("does not let after-period rows starve the row cap and drop in-period activity", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const call = await callTypeId(db);
      const [alice] = await db
        .insert(persons)
        .values({ name: "Alice", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (alice === undefined) throw new Error("seed failed");

      await db.insert(activities).values([
        {
          typeId: call,
          subject: "Future 1",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-08-10T10:00:00.000Z"),
        },
        {
          typeId: call,
          subject: "Future 2",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-08-11T10:00:00.000Z"),
        },
        {
          typeId: call,
          subject: "Future 3",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-08-12T10:00:00.000Z"),
        },
        {
          typeId: call,
          subject: "In period",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-07-05T10:00:00.000Z"),
        },
      ]);

      const result = await engagementTimeline(
        db,
        actor(owner.id),
        { entity: "person", monthsBack: 1, ownerId: null, typeKey: null, now: NOW, maxRows: 2 },
        sig(),
      );
      const aliceLane = result.lanes.find((l) => l.contactName === "Alice");
      expect(aliceLane?.byMonth["2026-07"]?.map((m) => m.subject)).toEqual(["In period"]);
    });
  });

  it("does not let invisible-contact rows starve the cap and drop a visible contact's lane", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const call = await callTypeId(db);

      const hiddenDues = [
        "2026-07-10T10:00:00.000Z",
        "2026-07-11T10:00:00.000Z",
        "2026-07-12T10:00:00.000Z",
      ];
      for (let i = 0; i < hiddenDues.length; i++) {
        const [hidden] = await db
          .insert(persons)
          .values({ name: `Hidden ${i}`, ownerId: owner.id, visibilityLevel: "owner" })
          .returning();
        if (hidden === undefined) throw new Error("seed failed");
        await db.insert(activities).values({
          typeId: call,
          subject: `Hidden call ${i}`,
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: hidden.id,
          dueAt: new Date(hiddenDues[i]!),
        });
      }

      const [visible] = await db
        .insert(persons)
        .values({ name: "Visible Vera", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (visible === undefined) throw new Error("seed failed");
      await db.insert(activities).values({
        typeId: call,
        subject: "Visible call",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: visible.id,
        dueAt: new Date("2026-07-05T10:00:00.000Z"),
      });

      const result = await engagementTimeline(
        db,
        actor(other.id),
        { entity: "person", monthsBack: 1, ownerId: null, typeKey: null, now: NOW, maxRows: 2 },
        sig(),
      );
      expect(result.lanes.map((l) => l.contactName)).toContain("Visible Vera");
    });
  });
});
