import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityTypes, deals, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { listActivityRows } from "./activityRows";
import { noFilter } from "./activityRowsTestHelpers";
import { createActivity } from "./repo";

function actor(id: string, isAdmin = false): PermSetUser {
  return {
    id,
    type: isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

const sig = () => new AbortController().signal;

async function callTypeId(db: Parameters<Parameters<typeof withTestDb>[0]>[0]): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (t === undefined) throw new Error("activity type 'call' not seeded");
  return t.id;
}

describe("listActivityRows", () => {
  it("returns enriched rows (priority, deal title, contact name/email/phone)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const [deal] = await db
        .insert(deals)
        .values({
          title: "Acme deal",
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: u.id,
          visibilityLevel: "all",
        })
        .returning();
      const [person] = await db
        .insert(persons)
        .values({
          name: "Jane Roe",
          primaryEmail: "jane@acme.com",
          emails: [{ label: "work", value: "jane@acme.com", primary: true }],
          phones: [{ label: "mobile", value: "+14155550100", primary: true }],
          ownerId: u.id,
          visibilityLevel: "all",
        })
        .returning();

      const created = await createActivity(
        db,
        actor(u.id),
        {
          typeId: await callTypeId(db),
          subject: "Follow up",
          priority: "high",
          dueAt: "2026-07-10T10:00:00.000Z",
          durationMinutes: null,
          dealId: deal!.id,
          personId: person!.id,
          orgId: null,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
        },
        sig(),
      );
      expect(created.ok).toBe(true);

      const rows = await listActivityRows(db, actor(u.id), noFilter, sig());
      const row = rows.find((r) => r.subject === "Follow up");
      expect(row).toBeDefined();
      expect(row?.priority).toBe("high");
      expect(row?.dealTitle).toBe("Acme deal");
      expect(row?.personName).toBe("Jane Roe");
      expect(row?.personEmail).toBe("jane@acme.com");
      expect(row?.personPhone).toBe("+14155550100");
    });
  });

  it("hides an activity on an owner-visibility deal from a different user", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const [deal] = await db
        .insert(deals)
        .values({
          title: "Private",
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: owner.id,
          visibilityLevel: "owner",
        })
        .returning();
      await createActivity(
        db,
        actor(owner.id),
        {
          typeId: await callTypeId(db),
          subject: "Secret call",
          dueAt: "2026-07-10T10:00:00.000Z",
          durationMinutes: null,
          dealId: deal!.id,
          personId: null,
          orgId: null,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
        },
        sig(),
      );

      const ownerRows = await listActivityRows(db, actor(owner.id), noFilter, sig());
      const otherRows = await listActivityRows(db, actor(other.id), noFilter, sig());
      expect(ownerRows.some((r) => r.subject === "Secret call")).toBe(true);
      expect(otherRows.some((r) => r.subject === "Secret call")).toBe(false);
    });
  });

  it("nulls the secondary personId when the linked contact is soft-deleted (deal-dominant)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const [person] = await db
        .insert(persons)
        .values({ name: "Emma", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      const [deal] = await db
        .insert(deals)
        .values({
          title: "Acme deal",
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: u.id,
          visibilityLevel: "all",
          personId: person!.id,
        })
        .returning();
      await createActivity(
        db,
        actor(u.id),
        {
          typeId: await callTypeId(db),
          subject: "Call Emma",
          dueAt: "2026-07-10T10:00:00.000Z",
          durationMinutes: null,
          dealId: deal!.id,
          personId: person!.id,
          orgId: null,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
        },
        sig(),
      );

      await db.update(persons).set({ deletedAt: new Date() }).where(eq(persons.id, person!.id));

      const rows = await listActivityRows(db, actor(u.id), noFilter, sig());
      const row = rows.find((r) => r.subject === "Call Emma");
      // Still listed via the deal, but the deleted person's link id is gone.
      expect(row).toBeDefined();
      expect(row?.personId).toBeNull();
      expect(row?.dealTitle).toBe("Acme deal");
    });
  });

  it("returns duration + assignee/owner name and applies the done filter", async () => {
    await withTestDb(async (db) => {
      const ann = await seedUser(db, { name: "Ann" });
      const typeId = await callTypeId(db);

      const createdA = await createActivity(
        db,
        actor(ann.id),
        {
          typeId,
          subject: "A",
          priority: null,
          dueAt: "2026-07-10T10:00:00.000Z",
          durationMinutes: 30,
          dealId: null,
          personId: null,
          orgId: null,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
          done: false,
        },
        sig(),
      );
      expect(createdA.ok).toBe(true);

      const createdB = await createActivity(
        db,
        actor(ann.id),
        {
          typeId,
          subject: "B",
          priority: null,
          dueAt: "2026-07-10T10:00:00.000Z",
          durationMinutes: null,
          dealId: null,
          personId: null,
          orgId: null,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
          done: true,
        },
        sig(),
      );
      expect(createdB.ok).toBe(true);

      const openRows = await listActivityRows(
        db,
        actor(ann.id),
        { ownerId: null, done: "open", from: null, to: null, typeKey: null },
        sig(),
      );
      const a = openRows.find((r) => r.subject === "A");
      expect(a?.durationMinutes).toBe(30);
      expect(a?.assigneeId).toBe(ann.id);
      expect(a?.assigneeName).toBe("Ann");
      expect(a?.ownerName).toBe("Ann");
      // done filter excludes B.
      expect(openRows.map((r) => r.subject)).not.toContain("B");

      const doneRows = await listActivityRows(
        db,
        actor(ann.id),
        { ownerId: null, done: "done", from: null, to: null, typeKey: null },
        sig(),
      );
      expect(doneRows.map((r) => r.subject)).toContain("B");
      expect(doneRows.map((r) => r.subject)).not.toContain("A");
    });
  });
});
