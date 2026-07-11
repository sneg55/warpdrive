import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  activities,
  activityTypes,
  deals,
  organizations,
  persons,
  visibilityGroups,
} from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { contactsFeed } from "./contactsFeed";

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

async function callTypeId(db: Parameters<Parameters<typeof withTestDb>[0]>[0]): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (t === undefined) throw new Error("activity type 'call' not seeded");
  return t.id;
}

describe("contactsFeed", () => {
  it("returns contact-linked activities across all contacts, newest first", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const typeId = await callTypeId(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Jane Roe", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme Inc", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined || org === undefined) throw new Error("seed failed");

      await db.insert(activities).values({
        typeId,
        subject: "Call Jane",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: person.id,
        dueAt: new Date("2026-07-01T10:00:00.000Z"),
      });
      await db.insert(activities).values({
        typeId,
        subject: "Renewal check-in",
        ownerId: owner.id,
        assigneeId: owner.id,
        orgId: org.id,
        dueAt: new Date("2026-07-03T10:00:00.000Z"),
      });

      const rows = await contactsFeed(db, actor(owner.id), { limit: 50 }, sig());
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows[0]?.subject).toBe("Renewal check-in");
      expect(rows[0]?.orgName).toBe("Acme Inc");
      expect(rows[1]?.subject).toBe("Call Jane");
      expect(rows[1]?.personName).toBe("Jane Roe");
      expect(rows[0]!.dueAtIso! >= rows[1]!.dueAtIso!).toBe(true);
    });
  });

  it("excludes an activity on a contact the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const typeId = await callTypeId(db);
      const [visible] = await db
        .insert(persons)
        .values({ name: "Visible Vic", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Hidden Hank", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (visible === undefined || hidden === undefined) throw new Error("seed failed");

      await db.insert(activities).values({
        typeId,
        subject: "See this",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: visible.id,
        dueAt: new Date("2026-07-01T10:00:00.000Z"),
      });
      await db.insert(activities).values({
        typeId,
        subject: "Do not see this",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: hidden.id,
        dueAt: new Date("2026-07-02T10:00:00.000Z"),
      });

      const rows = await contactsFeed(db, actor(other.id), { limit: 50 }, sig());
      const subjects = rows.map((r) => r.subject);
      expect(subjects).toContain("See this");
      expect(subjects).not.toContain("Do not see this");
    });
  });

  it("pages through with the before cursor without duplicating or skipping rows", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const typeId = await callTypeId(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Paged Person", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("seed failed");

      const subjects = ["First (oldest)", "Second", "Third (newest)"];
      const dueAts = [
        "2026-07-01T10:00:00.000Z",
        "2026-07-02T10:00:00.000Z",
        "2026-07-03T10:00:00.000Z",
      ];
      for (let i = 0; i < subjects.length; i++) {
        await db.insert(activities).values({
          typeId,
          subject: subjects[i]!,
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: person.id,
          dueAt: new Date(dueAts[i]!),
        });
      }

      const page1 = await contactsFeed(db, actor(owner.id), { limit: 1 }, sig());
      expect(page1.map((r) => r.subject)).toEqual(["Third (newest)"]);

      const page2 = await contactsFeed(
        db,
        actor(owner.id),
        { limit: 1, before: page1[0]!.dueAtIso, beforeId: page1[0]!.id },
        sig(),
      );
      expect(page2.map((r) => r.subject)).toEqual(["Second"]);

      const page3 = await contactsFeed(
        db,
        actor(owner.id),
        { limit: 1, before: page2[0]!.dueAtIso, beforeId: page2[0]!.id },
        sig(),
      );
      expect(page3.map((r) => r.subject)).toEqual(["First (oldest)"]);
    });
  });

  it("hides a deal-linked activity via pipeline restriction even though its tagged person is visible", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const outsider = await seedUser(db);
      const typeId = await callTypeId(db);

      const [pipeGroup] = await db
        .insert(visibilityGroups)
        .values({ name: "restricted-pipeline-group" })
        .returning();
      if (pipeGroup === undefined) throw new Error("group seed failed");

      const pipe = await seedPipelineWithStages(db, ["Lead"], {
        visibilityGroupId: pipeGroup.id,
      });
      const [person] = await db
        .insert(persons)
        .values({ name: "Broadly Visible", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("person seed failed");

      const [deal] = await db
        .insert(deals)
        .values({
          title: "Restricted deal",
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: owner.id,
          visibilityLevel: "all",
        })
        .returning();
      if (deal === undefined) throw new Error("deal seed failed");

      await db.insert(activities).values({
        typeId,
        subject: "Deal-scoped call, also tags a visible person",
        ownerId: owner.id,
        assigneeId: owner.id,
        dealId: deal.id,
        personId: person.id,
        dueAt: new Date("2026-07-01T10:00:00.000Z"),
      });

      // outsider is not a member of the pipeline's restricted group, so the deal-dominant
      // gate must hide this activity even though the tagged person is visible to everyone.
      const outsiderRows = await contactsFeed(db, actor(outsider.id), { limit: 50 }, sig());
      expect(outsiderRows.map((r) => r.subject)).not.toContain(
        "Deal-scoped call, also tags a visible person",
      );

      // A member of the pipeline group (here, the owner, who created the deal in that group's
      // pipeline) still sees it.
      const ownerRows = await contactsFeed(
        db,
        actor(owner.id, [pipeGroup.id]),
        { limit: 50 },
        sig(),
      );
      expect(ownerRows.map((r) => r.subject)).toContain(
        "Deal-scoped call, also tags a visible person",
      );
    });
  });
});
