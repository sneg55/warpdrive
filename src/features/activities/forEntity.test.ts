import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, deals, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { listActivitiesForEntity } from "./forEntity";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("carries the owner display name for deal-scoped activities", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Nick Sawinyh" });
    const actor = makeActor(user.id);

    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Discovery call",
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.subject).toBe("Discovery call");
    expect(rows[0]?.ownerName).toBe("Nick Sawinyh");
  });
});

it("carries the linked person and organization display names for deal-scoped activities", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Owner" });
    const actor = makeActor(user.id);

    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [person] = await db
      .insert(persons)
      .values({ name: "Ada Lovelace", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");
    const [org] = await db
      .insert(organizations)
      .values({ name: "Analytical Ltd", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (org === undefined) throw new Error("org seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Discovery call",
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
      personId: person.id,
      orgId: org.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.personName).toBe("Ada Lovelace");
    expect(rows[0]?.orgName).toBe("Analytical Ltd");
  });
});

it("hides a linked contact's name and link when the actor cannot see that contact", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db, { name: "Owner" }); // owns the hidden contact + deal
    const viewer = await seedUser(db, { name: "Viewer" }); // sees the deal, not the contact
    const actor = makeActor(viewer.id);

    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    // owner-only contact owned by someone else: the viewer must not see its name.
    const [person] = await db
      .insert(persons)
      .values({ name: "Secret Contact", ownerId: owner.id, visibilityLevel: "owner" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");
    const [org] = await db
      .insert(organizations)
      .values({ name: "Secret Org", ownerId: owner.id, visibilityLevel: "owner" })
      .returning();
    if (org === undefined) throw new Error("org seed failed");
    // all-visible deal: the viewer CAN see the activity through the deal parent.
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Discovery call",
      ownerId: owner.id,
      assigneeId: owner.id,
      dealId: deal.id,
      personId: person.id,
      orgId: org.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
    });

    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    // The activity is visible via the all-visible deal parent...
    expect(rows[0]?.subject).toBe("Discovery call");
    // ...but the hidden contact's name and clickable link must not be disclosed.
    expect(rows[0]?.personName).toBeNull();
    expect(rows[0]?.personId).toBeNull();
    expect(rows[0]?.orgName).toBeNull();
    expect(rows[0]?.orgId).toBeNull();
  });
});

it("nulls personId/orgId when the linked contact is soft-deleted (no dangling link to a 404)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Owner" });
    const actor = makeActor(user.id);

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

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Call Emma",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date(),
      dealId: deal.id,
      personId: person.id,
    });

    // Soft-delete the person AFTER the activity links it.
    await db.update(persons).set({ deletedAt: new Date() }).where(eq(persons.id, person.id));

    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.subject).toBe("Call Emma");
    // The activity still shows on the deal, but its person link is gone (person is deleted).
    expect(rows[0]?.personId).toBeNull();
  });
});

it("carries note and location for deal-scoped activities", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = makeActor(user.id);
    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("type not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Call",
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
      dueAt: new Date("2026-07-04T10:00:00Z"),
      note: "<p>ring</p>",
      location: "HQ",
    });
    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.location).toBe("HQ");
    expect(rows[0]?.note).toContain("ring");
  });
});

it("re-sanitizes the note at the read boundary (strips script from raw-inserted HTML)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = makeActor(user.id);
    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("type not found");
    // Raw insert bypasses createActivity's sanitizeAuthorHtml, simulating a write path
    // that forgot to sanitize. The read boundary must still strip the script.
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Call",
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
      dueAt: new Date("2026-07-04T10:00:00Z"),
      note: "<p>hi</p><script>alert('xss')</script>",
    });
    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.note).toContain("hi");
    expect(rows[0]?.note).not.toContain("<script>");
    expect(rows[0]?.note).not.toContain("alert");
  });
});
