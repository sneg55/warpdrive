import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getDayLoad } from "./dayLoad";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function callType(db: TestDb) {
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("activity type 'call' not found");
  return type;
}

const FROM = new Date("2026-09-01T00:00:00.000Z");
const TO = new Date("2026-09-07T23:59:59.999Z");

describe("getDayLoad", () => {
  it("counts two activities on the same UTC day as 2", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values([
        {
          typeId: type.id,
          subject: "Morning call",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-02T08:00:00.000Z"),
        },
        {
          typeId: type.id,
          subject: "Evening call",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-02T21:30:00.000Z"),
        },
      ]);

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts["2026-09-02"]).toBe(2);
    });
  });

  it("leaves a day with no activities out of the map entirely", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Only one",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-09-02T08:00:00.000Z"),
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(Object.keys(counts)).toEqual(["2026-09-02"]);
      expect(counts["2026-09-03"]).toBeUndefined();
    });
  });

  it("does not count an activity assigned to another user", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const other = await seedUser(db, { name: "Other" });
      const type = await callType(db);
      await db.insert(activities).values([
        {
          typeId: type.id,
          subject: "Mine",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-02T08:00:00.000Z"),
        },
        {
          typeId: type.id,
          subject: "Theirs",
          ownerId: other.id,
          assigneeId: other.id,
          dueAt: new Date("2026-09-02T09:00:00.000Z"),
        },
      ]);

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts["2026-09-02"]).toBe(1);
    });
  });

  it("does not count a soft-deleted activity", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values([
        {
          typeId: type.id,
          subject: "Live",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-02T08:00:00.000Z"),
        },
        {
          typeId: type.id,
          subject: "Deleted",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-02T09:00:00.000Z"),
          deletedAt: new Date("2026-08-30T00:00:00.000Z"),
        },
      ]);

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts["2026-09-02"]).toBe(1);
    });
  });

  it("does not count an activity due outside the requested range", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values([
        {
          typeId: type.id,
          subject: "Before",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-08-25T08:00:00.000Z"),
        },
        {
          typeId: type.id,
          subject: "After",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-20T08:00:00.000Z"),
        },
        {
          typeId: type.id,
          subject: "Inside",
          ownerId: user.id,
          assigneeId: user.id,
          dueAt: new Date("2026-09-04T08:00:00.000Z"),
        },
      ]);

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts).toEqual({ "2026-09-04": 1 });
    });
  });

  it("counts a done activity: a full day stays full once the work is logged", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Done call",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-09-03T08:00:00.000Z"),
        done: true,
        doneAt: new Date("2026-09-03T09:00:00.000Z"),
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts["2026-09-03"]).toBe(1);
    });
  });

  it("ignores an activity with no due_at", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Undated",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: null,
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts).toEqual({});
    });
  });

  it("counts a multi-day activity on its start day only", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Conference",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-09-02T08:00:00.000Z"),
        endAt: new Date("2026-09-05T17:00:00.000Z"),
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "UTC" },
        signal,
      );
      expect(counts).toEqual({ "2026-09-02": 1 });
    });
  });

  it("buckets by the caller's timezone, so a late-evening activity lands on its local day", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Late call",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-09-02T22:30:00.000Z"),
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "Europe/Berlin" },
        signal,
      );
      expect(counts["2026-09-03"]).toBe(1);
      expect(counts["2026-09-02"]).toBeUndefined();
    });
  });

  it("buckets an early-morning UTC activity on the previous day for a west-of-UTC caller", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Evening call",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-09-03T02:00:00.000Z"),
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "America/New_York" },
        signal,
      );
      expect(counts["2026-09-02"]).toBe(1);
    });
  });

  it("falls back to UTC when the timezone is not a real IANA zone", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Call",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date("2026-09-02T22:30:00.000Z"),
      });

      const counts = await getDayLoad(
        db,
        { userId: user.id, from: FROM, to: TO, timeZone: "Not/AZone" },
        signal,
      );
      expect(counts["2026-09-02"]).toBe(1);
    });
  });
});
