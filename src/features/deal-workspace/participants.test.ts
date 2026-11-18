import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { activities, activityTypes, deals, persons, pipelines } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { listChangeLog } from "@/features/collaboration/changeLog";
import { createOrg } from "@/features/contacts/orgsRepo";
import { createPerson } from "@/features/contacts/personsRepo";
import { makeTestDb } from "@/test/db";
import { addParticipant, dealsForOrg, dealsForPerson, removeParticipant } from "./participants";
import { listParticipants } from "./participantsList";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function makeAdminActor(userId: string) {
  return {
    id: userId,
    type: "admin" as const,
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set<PermissionFlagKey>(),
  };
}

const sig = () => new AbortController().signal;

it("links a person to a deal and finds it via dealsForPerson", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const person = await createPerson(
    h.db,
    actor,
    { name: "Jane", emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  if (person.ok === false) throw new Error("setup: createPerson failed");

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  const r = await addParticipant(h.db, actor, deal.id, person.value.id, "decision-maker", sig());
  expect(r.ok).toBe(true);

  const found = await dealsForPerson(h.db, actor, person.value.id, sig());
  expect(found.map((d) => d.id)).toContain(deal.id);
});

it("logs a participant add once, then a remove; idempotent repeats write nothing", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const person = await createPerson(
    h.db,
    actor,
    { name: "Zoe", emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  if (person.ok === false) throw new Error("setup: createPerson failed");

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  await addParticipant(h.db, actor, deal.id, person.value.id, null, sig());
  await addParticipant(h.db, actor, deal.id, person.value.id, null, sig());

  await removeParticipant(h.db, actor, deal.id, person.value.id, sig());
  await removeParticipant(h.db, actor, deal.id, person.value.id, sig());

  const rows = (await listChangeLog(h.db, "deal", deal.id, sig())).filter(
    (c) => c.field === "participant",
  );
  expect(rows.length).toBe(2);
  expect(rows[0]?.oldValue).toBe(person.value.id);
  expect(rows[0]?.newValue).toBeNull();
  expect(rows[1]?.oldValue).toBeNull();
  expect(rows[1]?.newValue).toBe(person.value.id);
  expect(rows[1]?.actorId).toBe(user.id);
});

it("dealsForOrg aggregates primary-org deals and participant-derived deals", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const org = await createOrg(
    h.db,
    actor,
    { name: "Acme", address: null, customFields: {} },
    sig(),
  );
  if (org.ok === false) throw new Error("setup: createOrg failed");

  const person = await createPerson(
    h.db,
    actor,
    { name: "Bob", emails: [], phones: [], orgId: org.value.id, customFields: {} },
    sig(),
  );
  if (person.ok === false) throw new Error("setup: createPerson failed");

  const [primaryDeal] = await h.db
    .insert(deals)
    .values({
      title: "Primary",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
      orgId: org.value.id,
    })
    .returning();
  if (primaryDeal === undefined) throw new Error("setup: primaryDeal insert failed");

  const [participantDeal] = await h.db
    .insert(deals)
    .values({
      title: "Participant",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (participantDeal === undefined) throw new Error("setup: participantDeal insert failed");

  const added = await addParticipant(h.db, actor, participantDeal.id, person.value.id, null, sig());
  expect(added.ok).toBe(true);

  const aggregated = await dealsForOrg(h.db, actor, org.value.id, sig());
  const ids = aggregated.map((d) => d.id);
  expect(ids).toContain(primaryDeal.id);
  expect(ids).toContain(participantDeal.id);
});

it("dealsForPerson excludes a linked deal the actor cannot see (canSee/toVisibleDeal filter runs)", async () => {
  const owner = await seedUser(h.db);
  const ownerActor = makeAdminActor(owner.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const person = await createPerson(
    h.db,
    ownerActor,
    { name: "Carol", emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  if (person.ok === false) throw new Error("setup: createPerson failed");

  const otherOwner = await seedUser(h.db);
  const [hiddenDeal] = await h.db
    .insert(deals)
    .values({
      title: "Hidden",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: otherOwner.id,
      visibilityLevel: "owner",
    })
    .returning();
  if (hiddenDeal === undefined) throw new Error("setup: hiddenDeal insert failed");

  const { dealParticipants } = await import("@/db/schema");
  await h.db.insert(dealParticipants).values({ dealId: hiddenDeal.id, personId: person.value.id });

  const viewer = await seedUser(h.db);
  const viewerActor = {
    id: viewer.id,
    type: "regular" as const,
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set<PermissionFlagKey>(),
  };

  const found = await dealsForPerson(h.db, viewerActor, person.value.id, sig());
  expect(found.map((d) => d.id)).not.toContain(hiddenDeal.id);
});

it("dealsForPerson excludes a deal in an archived pipeline (even for admin)", async () => {
  const owner = await seedUser(h.db);
  const actor = makeAdminActor(owner.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const person = await createPerson(
    h.db,
    actor,
    { name: "Dave", emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  if (person.ok === false) throw new Error("setup: createPerson failed");

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "ArchivedLinked",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "all",
      personId: person.value.id,
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  await h.db.update(pipelines).set({ isArchived: true }).where(eq(pipelines.id, pipe.pipeline.id));

  const found = await dealsForPerson(h.db, actor, person.value.id, sig());
  expect(found.map((d) => d.id)).not.toContain(deal.id);
});

it("returns enriched participant rows: org, email, phone, owner, deal counts, next activity", async () => {
  const user = await seedUser(h.db, { name: "Owner Olga" });
  const actor = makeAdminActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const org = await createOrg(
    h.db,
    actor,
    { name: "Acme Org", address: null, customFields: {} },
    sig(),
  );
  if (org.ok === false) throw new Error("setup: createOrg failed");
  const person = await createPerson(
    h.db,
    actor,
    { name: "Pia Part", emails: [], phones: [], orgId: org.value.id, customFields: {} },
    sig(),
  );
  if (person.ok === false) throw new Error("setup: createPerson failed");
  await h.db
    .update(persons)
    .set({
      primaryEmail: "pia@acme.com",
      phones: [{ label: "work", value: "555-1", primary: true }],
    })
    .where(eq(persons.id, person.value.id));

  const mkDeal = async (title: string, status: "open" | "won") => {
    const [d] = await h.db
      .insert(deals)
      .values({
        title,
        pipelineId: pipe.pipeline.id,
        stageId: pipe.stages[0]!.id,
        ownerId: user.id,
        visibilityLevel: "all",
        status,
        personId: person.value.id,
      })
      .returning();
    if (d === undefined) throw new Error("setup: deal insert failed");
    return d;
  };
  const main = await mkDeal("Main", "open");
  await mkDeal("Won one", "won");
  await addParticipant(h.db, actor, main.id, person.value.id, null, sig());

  const [type] = await h.db
    .insert(activityTypes)
    .values({ key: `call-${Date.now()}`, name: "Call" })
    .returning();
  const due = new Date("2030-01-15T10:00:00.000Z");
  await h.db.insert(activities).values({
    typeId: type!.id,
    subject: "Follow up",
    dueAt: due,
    ownerId: user.id,
    assigneeId: user.id,
    personId: person.value.id,
  });

  const rows = await listParticipants(h.db, actor, main.id, sig());
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row).toMatchObject({
    personId: person.value.id,
    name: "Pia Part",
    orgName: "Acme Org",
    primaryEmail: "pia@acme.com",
    phone: "555-1",
    ownerName: "Owner Olga",
    closedDeals: 1,
    openDeals: 1,
  });
  expect(row.nextActivityAt?.toISOString()).toBe(due.toISOString());
});

it("filters participants the actor cannot see (person-level visibility gate)", async () => {
  const owner = await seedUser(h.db, { name: "Hidden Owner" });
  const ownerActor = makeAdminActor(owner.id);
  const outsider = await seedUser(h.db, { name: "Outsider" });
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const visible = await createPerson(
    h.db,
    ownerActor,
    { name: "Visible Vera", emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  const hidden = await createPerson(
    h.db,
    ownerActor,
    { name: "Hidden Hana", emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  if (visible.ok === false || hidden.ok === false) throw new Error("setup: createPerson failed");
  await h.db
    .update(persons)
    .set({ visibilityLevel: "all" })
    .where(eq(persons.id, visible.value.id));
  await h.db
    .update(persons)
    .set({ visibilityLevel: "owner" })
    .where(eq(persons.id, hidden.value.id));

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Shared",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");
  await addParticipant(h.db, ownerActor, deal.id, visible.value.id, null, sig());
  await addParticipant(h.db, ownerActor, deal.id, hidden.value.id, null, sig());

  const outsiderActor = {
    id: outsider.id,
    type: "regular" as const,
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set<PermissionFlagKey>(),
  };
  const rows = await listParticipants(h.db, outsiderActor, deal.id, sig());
  expect(rows.map((r) => r.name)).toEqual(["Visible Vera"]);
});
