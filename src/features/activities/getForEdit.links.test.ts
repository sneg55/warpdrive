import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals, organizations, persons } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { getActivityForEdit } from "./getForEdit";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function seedLinkedActivity(ownerId: string, personVisibility: "all" | "owner") {
  const db = ctx.db;
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [org] = await db
    .insert(organizations)
    .values({ name: "Transit Authority", ownerId, visibilityLevel: "all" })
    .returning();
  const [dealPerson] = await db
    .insert(persons)
    .values({ name: "Paul Burns", emails: [], phones: [], ownerId, visibilityLevel: "all" })
    .returning();
  const [linkedPerson] = await db
    .insert(persons)
    .values({
      name: "Peter Kuusisto",
      emails: [],
      phones: [],
      ownerId,
      visibilityLevel: personVisibility,
    })
    .returning();
  const [deal] = await db
    .insert(deals)
    .values({
      title: "Feed gap",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId,
      visibilityLevel: "all",
      personId: dealPerson!.id,
      orgId: org!.id,
    })
    .returning();
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  const [row] = await db
    .insert(activities)
    .values({
      typeId: type!.id,
      subject: "Ping",
      ownerId,
      assigneeId: ownerId,
      dealId: deal!.id,
      personId: linkedPerson!.id,
      orgId: org!.id,
    })
    .returning();
  return { row: row!, linkedPerson: linkedPerson!, org: org!, deal: deal! };
}

it("returns the names of the activity's own links, not the deal's contact", async () => {
  const owner = await seedUser(ctx.db, { name: "Owner" });
  const { row, linkedPerson, org, deal } = await seedLinkedActivity(owner.id, "all");

  const r = await getActivityForEdit(
    ctx.db,
    makeActor(owner.id),
    row.id,
    AbortSignal.timeout(8000),
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value).toMatchObject({
    dealId: deal.id,
    dealTitle: "Feed gap",
    personId: linkedPerson.id,
    personName: "Peter Kuusisto",
    orgId: org.id,
    orgName: "Transit Authority",
  });
});

it("withholds a linked person's name the actor cannot see but keeps the id so a save does not unlink", async () => {
  const owner = await seedUser(ctx.db, { name: "Owner" });
  const other = await seedUser(ctx.db, { name: "Other" });
  const { row, linkedPerson } = await seedLinkedActivity(owner.id, "owner");

  const r = await getActivityForEdit(
    ctx.db,
    makeActor(other.id),
    row.id,
    AbortSignal.timeout(8000),
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value.personId).toBe(linkedPerson.id);
  expect(r.value.personName).toBeNull();
  expect(r.value.orgName).toBe("Transit Authority");
});
