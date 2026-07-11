import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
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

// Anchor "now" so month-bucketing + the 3-month period window are deterministic. With now in
// July, monthsBack: 3 spans May, June, July.
const NOW = new Date("2026-07-15T00:00:00.000Z");

async function typeIdFor(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  key: string,
): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, key));
  if (t === undefined) throw new Error(`activity type '${key}' not seeded`);
  return t.id;
}

describe("engagementTimeline", () => {
  it("buckets each person's activities by month within the period", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const call = await typeIdFor(db, "call");
      const meeting = await typeIdFor(db, "meeting");
      const [alice] = await db
        .insert(persons)
        .values({ name: "Alice", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [bob] = await db
        .insert(persons)
        .values({ name: "Bob", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (alice === undefined || bob === undefined) throw new Error("seed failed");

      await db.insert(activities).values([
        {
          typeId: call,
          subject: "Call Alice",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-05-10T10:00:00.000Z"),
        },
        {
          typeId: meeting,
          subject: "Meet Alice",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-06-20T10:00:00.000Z"),
        },
        {
          typeId: call,
          subject: "Call Bob",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: bob.id,
          dueAt: new Date("2026-07-05T10:00:00.000Z"),
        },
        // Older than the 3-month window -> excluded.
        {
          typeId: call,
          subject: "Ancient call",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-01-01T10:00:00.000Z"),
        },
      ]);

      const result = await engagementTimeline(
        db,
        actor(owner.id),
        { entity: "person", monthsBack: 3, ownerId: null, typeKey: null, now: NOW },
        sig(),
      );

      expect(result.months).toEqual(["2026-05", "2026-06", "2026-07"]);
      const aliceLane = result.lanes.find((l) => l.contactName === "Alice");
      const bobLane = result.lanes.find((l) => l.contactName === "Bob");
      expect(aliceLane).toBeDefined();
      expect(bobLane).toBeDefined();
      expect(aliceLane?.byMonth["2026-05"]?.map((m) => m.subject)).toEqual(["Call Alice"]);
      expect(aliceLane?.byMonth["2026-06"]?.map((m) => m.subject)).toEqual(["Meet Alice"]);
      expect(aliceLane?.byMonth["2026-07"]).toBeUndefined();
      // Ancient call excluded from the period.
      expect(aliceLane?.total).toBe(2);
      expect(bobLane?.byMonth["2026-07"]?.map((m) => m.subject)).toEqual(["Call Bob"]);
    });
  });

  it("applies the type filter", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const call = await typeIdFor(db, "call");
      const meeting = await typeIdFor(db, "meeting");
      const [alice] = await db
        .insert(persons)
        .values({ name: "Alice", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (alice === undefined) throw new Error("seed failed");
      await db.insert(activities).values([
        {
          typeId: call,
          subject: "Call Alice",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-05-10T10:00:00.000Z"),
        },
        {
          typeId: meeting,
          subject: "Meet Alice",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: alice.id,
          dueAt: new Date("2026-06-20T10:00:00.000Z"),
        },
      ]);

      const result = await engagementTimeline(
        db,
        actor(owner.id),
        { entity: "person", monthsBack: 3, ownerId: null, typeKey: "call", now: NOW },
        sig(),
      );
      const aliceLane = result.lanes.find((l) => l.contactName === "Alice");
      expect(aliceLane?.total).toBe(1);
      expect(aliceLane?.byMonth["2026-05"]?.map((m) => m.subject)).toEqual(["Call Alice"]);
      expect(aliceLane?.byMonth["2026-06"]).toBeUndefined();
    });
  });

  it("hides a contact the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const call = await typeIdFor(db, "call");
      const [visible] = await db
        .insert(persons)
        .values({ name: "Visible Vic", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Hidden Hank", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (visible === undefined || hidden === undefined) throw new Error("seed failed");
      await db.insert(activities).values([
        {
          typeId: call,
          subject: "See this",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: visible.id,
          dueAt: new Date("2026-06-10T10:00:00.000Z"),
        },
        {
          typeId: call,
          subject: "Hidden call",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: hidden.id,
          dueAt: new Date("2026-06-11T10:00:00.000Z"),
        },
      ]);

      const result = await engagementTimeline(
        db,
        actor(other.id),
        { entity: "person", monthsBack: 3, ownerId: null, typeKey: null, now: NOW },
        sig(),
      );
      const names = result.lanes.map((l) => l.contactName);
      expect(names).toContain("Visible Vic");
      expect(names).not.toContain("Hidden Hank");
    });
  });

  it("scopes lanes to organizations when entity is organization", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const call = await typeIdFor(db, "call");
      const [person] = await db
        .insert(persons)
        .values({ name: "Solo Person", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme Inc", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined || org === undefined) throw new Error("seed failed");
      await db.insert(activities).values([
        {
          typeId: call,
          subject: "Person call",
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: person.id,
          dueAt: new Date("2026-06-10T10:00:00.000Z"),
        },
        {
          typeId: call,
          subject: "Org call",
          ownerId: owner.id,
          assigneeId: owner.id,
          orgId: org.id,
          dueAt: new Date("2026-06-12T10:00:00.000Z"),
        },
      ]);

      const orgResult = await engagementTimeline(
        db,
        actor(owner.id),
        { entity: "organization", monthsBack: 3, ownerId: null, typeKey: null, now: NOW },
        sig(),
      );
      expect(orgResult.lanes.map((l) => l.contactName)).toEqual(["Acme Inc"]);
      expect(orgResult.lanes[0]?.byMonth["2026-06"]?.map((m) => m.subject)).toEqual(["Org call"]);
    });
  });
});
