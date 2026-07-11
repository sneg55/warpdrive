import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { activityStats } from "./activityStats";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("aggregates a person's activities into counts-by-type and a last-activity date", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Nick" });
    const actor = makeActor(user.id);

    const [person] = await db
      .insert(persons)
      .values({ name: "Ada Lovelace", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    const [call] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    const [meeting] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
    if (call === undefined || meeting === undefined) throw new Error("activity types missing");

    await db.insert(activities).values([
      {
        typeId: call.id,
        subject: "Discovery call",
        ownerId: user.id,
        assigneeId: user.id,
        personId: person.id,
        done: true,
        dueAt: new Date("2026-07-02T10:00:00Z"),
      },
      {
        typeId: call.id,
        subject: "Follow-up call",
        ownerId: user.id,
        assigneeId: user.id,
        personId: person.id,
        done: true,
        dueAt: new Date("2026-07-01T10:00:00Z"),
      },
      {
        typeId: meeting.id,
        subject: "Intro meeting",
        ownerId: user.id,
        assigneeId: user.id,
        personId: person.id,
        done: false,
        dueAt: new Date("2026-07-05T10:00:00Z"),
      },
    ]);

    const stats = await activityStats(db, actor, "person", person.id, signal);
    expect(stats.total).toBe(3);
    expect(stats.done).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.byType).toEqual({ call: 2, meeting: 1 });
    // Last activity = most recent DONE activity (2026-07-02).
    expect(stats.lastActivityAt).toEqual(new Date("2026-07-02T10:00:00Z"));
    expect(typeof stats.inactiveDays).toBe("number");
  });
});

it("returns zeroed stats for a person with no activities", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Nick" });
    const actor = makeActor(user.id);
    const [person] = await db
      .insert(persons)
      .values({ name: "Empty", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    const stats = await activityStats(db, actor, "person", person.id, signal);
    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({});
    expect(stats.lastActivityAt).toBeNull();
    expect(stats.inactiveDays).toBeNull();
  });
});

it("returns zeroed stats for a contact the actor cannot see, even if the activity is visible via an org (codex P2)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const ownerA = await seedUser(db, { name: "Owner A" });
    const viewerB = await seedUser(db, { name: "Viewer B" });

    // Person is owner-only (hidden from viewerB); org is visible to everyone.
    const [person] = await db
      .insert(persons)
      .values({ name: "Hidden Ada", ownerId: ownerA.id, visibilityLevel: "owner" })
      .returning();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Visible Org", ownerId: ownerA.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined || org === undefined) throw new Error("seed failed");

    const [call] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (call === undefined) throw new Error("activity type missing");

    // Activity links BOTH the hidden person and a visible org. The entity-visibility gate (mirroring
    // contactTimeline) must return zeroed stats for the hidden person regardless of the org parent,
    // so aggregate counts + last-activity for a contact the actor cannot open are never disclosed.
    await db.insert(activities).values({
      typeId: call.id,
      subject: "Discovery call",
      ownerId: ownerA.id,
      assigneeId: ownerA.id,
      personId: person.id,
      orgId: org.id,
      done: true,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const stats = await activityStats(db, makeActor(viewerB.id), "person", person.id, signal);
    expect(stats.total).toBe(0);
    expect(stats.lastActivityAt).toBeNull();
  });
});
