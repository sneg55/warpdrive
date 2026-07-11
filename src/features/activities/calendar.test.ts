import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, deals, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { calendarRange } from "./calendar";
import { selectWindow } from "./calendarView";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("returns only in-range activities the actor can see, with the joined typeKey", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const other = await seedUser(db);
    const actor = makeActor(user.id);

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
    if (type === undefined) throw new Error("activity type 'meeting' not found");

    // Parentless, assigned to the actor: visible via assignee.
    await db.insert(activities).values({
      typeId: type.id,
      subject: "In range",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });
    // Parentless, assigned to the actor, OUT of range: excluded by the date filter.
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Out of range",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date("2026-08-20T10:00:00Z"),
    });
    // Parentless, assigned to ANOTHER user, in range: excluded by the visibility filter.
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Other user",
      ownerId: other.id,
      assigneeId: other.id,
      dueAt: new Date("2026-07-03T10:00:00Z"),
    });

    const rows = await calendarRange(
      db,
      actor,
      { from: new Date("2026-06-29T00:00:00Z"), to: new Date("2026-07-06T00:00:00Z") },
      new AbortController().signal,
    );

    expect(rows.map((r) => r.subject)).toEqual(["In range"]);
    expect(rows[0]?.typeKey).toBe("meeting");
    // AC1: assignee is exposed so the calendar can offer an owner (assignee) filter.
    expect(rows[0]?.assigneeId).toBe(user.id);
  });
});

it("includes a multi-day activity whose span overlaps the range even when it starts before it", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const actor = makeActor(user.id);
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
    if (type === undefined) throw new Error("activity type 'meeting' not found");

    // Starts Jun 30 (before the range), ends Jul 2 (inside): its span overlaps, so it must appear
    // and carry its endAt for multi-day rendering.
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Conference",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date("2026-06-30T09:00:00Z"),
      endAt: new Date("2026-07-02T17:00:00Z"),
    });

    const rows = await calendarRange(
      db,
      actor,
      { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-07-06T00:00:00Z") },
      new AbortController().signal,
    );
    expect(rows.map((r) => r.subject)).toEqual(["Conference"]);
    expect(rows[0]?.endAt?.toISOString()).toBe("2026-07-02T17:00:00.000Z");
  });
});

it("resolves the activity owner display name for the created-by footer", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { name: "Nick Sawinyh" });
    const actor = makeActor(user.id);

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
    if (type === undefined) throw new Error("activity type 'meeting' not found");

    await db.insert(activities).values({
      typeId: type.id,
      subject: "Owned",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const rows = await calendarRange(
      db,
      actor,
      { from: new Date("2026-06-29T00:00:00Z"), to: new Date("2026-07-06T00:00:00Z") },
      new AbortController().signal,
    );

    expect(rows[0]?.ownerName).toBe("Nick Sawinyh");
  });
});

it("serves a full month-grid window across the month boundary (visibility-filtered)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const actor = makeActor(user.id);
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
    if (type === undefined) throw new Error("activity type 'meeting' not found");

    // June 2026 grid runs Jun 1 .. Jul 12. Seed one leading-month, one in-month
    // late-Sunday, and one trailing-month activity, all assigned to the actor.
    for (const [subject, dueIso] of [
      ["leading", "2026-06-01T09:00:00Z"],
      ["late sunday", "2026-06-14T22:30:00Z"],
      ["trailing", "2026-07-12T08:00:00Z"],
      ["outside", "2026-07-13T08:00:00Z"],
    ] as const) {
      await db.insert(activities).values({
        typeId: type.id,
        subject,
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: new Date(dueIso),
      });
    }

    const { range } = selectWindow("month", "2026-06-15");
    const out = await calendarRange(db, actor, range, AbortSignal.timeout(10_000));
    const subjects = out.map((a) => a.subject).sort();
    expect(subjects).toContain("leading");
    expect(subjects).toContain("late sunday");
    expect(subjects).toContain("trailing");
    expect(subjects).not.toContain("outside");
  });
});

it("nulls the secondary personId when the linked contact is soft-deleted (deal-dominant activity)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const actor = makeActor(user.id);

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
    if (type === undefined) throw new Error("activity type 'meeting' not found");

    // Deal is the dominant parent (alive -> activity stays visible); the person is a secondary link.
    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [person] = await db
      .insert(persons)
      .values({ name: "Emma", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        personId: person.id,
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");

    await db.insert(activities).values({
      typeId: type.id,
      subject: "Call Emma",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
      dealId: deal.id,
      personId: person.id,
    });

    await db.update(persons).set({ deletedAt: new Date() }).where(eq(persons.id, person.id));

    const range = { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-07-31T00:00:00Z") };
    const out = await calendarRange(db, actor, range, new AbortController().signal);
    const row = out.find((a) => a.subject === "Call Emma");
    // Still visible via the deal, but the deleted person's link is gone.
    expect(row).toBeDefined();
    expect(row?.personId).toBeNull();
    expect(row?.dealId).toBe(deal.id);
  });
});
