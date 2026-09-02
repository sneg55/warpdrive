import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { activities, activityTypes, deals, organizations, persons } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createOrg } from "@/features/contacts/orgsRepo";
import { createPerson } from "@/features/contacts/personsRepo";
import { makeTestDb } from "@/test/db";
import { addParticipant } from "./participants";
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

async function seedPerson(userId: string, name: string): Promise<string> {
  const r = await createPerson(
    h.db,
    makeAdminActor(userId),
    { name, emails: [], phones: [], orgId: null, customFields: {} },
    sig(),
  );
  if (r.ok === false) throw new Error("setup: createPerson failed");
  await h.db.update(persons).set({ visibilityLevel: "all" }).where(eq(persons.id, r.value.id));
  return r.value.id;
}

async function seedDeal(userId: string, personId: string | null): Promise<string> {
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: userId,
      visibilityLevel: "all",
      personId,
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");
  return deal.id;
}

async function seedActivity(
  userId: string,
  personId: string,
  dealId: string | null,
  dueAt: Date,
): Promise<void> {
  const [type] = await h.db
    .insert(activityTypes)
    .values({ key: `call-${crypto.randomUUID()}`, name: "Call" })
    .returning();
  await h.db.insert(activities).values({
    typeId: type!.id,
    subject: "Follow up",
    dueAt,
    ownerId: userId,
    assigneeId: userId,
    personId,
    dealId,
  });
}

it("hides the organization name of a participant's restricted organization", async () => {
  const owner = await seedUser(h.db, { name: "Owner" });
  const outsider = await seedUser(h.db, { name: "Outsider" });
  const ownerActor = makeAdminActor(owner.id);
  const outsiderActor = { ...makeAdminActor(outsider.id), type: "regular" as const };

  const org = await createOrg(
    h.db,
    ownerActor,
    { name: "Secret Holdings", address: null, customFields: {} },
    sig(),
  );
  if (org.ok === false) throw new Error("setup: createOrg failed");
  await h.db
    .update(organizations)
    .set({ visibilityLevel: "owner" })
    .where(eq(organizations.id, org.value.id));

  const peter = await seedPerson(owner.id, "Peter Kuusisto");
  await h.db.update(persons).set({ orgId: org.value.id }).where(eq(persons.id, peter));
  const dealId = await seedDeal(owner.id, peter);

  const [ownerRow] = await listParticipants(h.db, ownerActor, dealId, sig());
  expect(ownerRow?.orgName).toBe("Secret Holdings");

  const [outsiderRow] = await listParticipants(h.db, outsiderActor, dealId, sig());
  expect(outsiderRow?.name).toBe("Peter Kuusisto");
  expect(outsiderRow?.orgName).toBeNull();
});

it("drops the organization name once the organization is soft-deleted", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const org = await createOrg(
    h.db,
    actor,
    { name: "Gone Holdings", address: null, customFields: {} },
    sig(),
  );
  if (org.ok === false) throw new Error("setup: createOrg failed");
  const peter = await seedPerson(user.id, "Peter Kuusisto");
  await h.db.update(persons).set({ orgId: org.value.id }).where(eq(persons.id, peter));
  const dealId = await seedDeal(user.id, peter);

  await h.db
    .update(organizations)
    .set({ deletedAt: new Date() })
    .where(eq(organizations.id, org.value.id));

  const [row] = await listParticipants(h.db, actor, dealId, sig());
  expect(row?.orgName).toBeNull();
});

it("hides a next activity parented by a deal the actor cannot see", async () => {
  const owner = await seedUser(h.db, { name: "Owner" });
  const outsider = await seedUser(h.db, { name: "Outsider" });
  const ownerActor = makeAdminActor(owner.id);
  const outsiderActor = { ...makeAdminActor(outsider.id), type: "regular" as const };
  const peter = await seedPerson(owner.id, "Peter Kuusisto");
  const openDeal = await seedDeal(owner.id, peter);
  const secretDeal = await seedDeal(owner.id, null);
  await h.db.update(deals).set({ visibilityLevel: "owner" }).where(eq(deals.id, secretDeal));
  await seedActivity(owner.id, peter, secretDeal, new Date("2030-02-01T10:00:00.000Z"));

  const [ownerRow] = await listParticipants(h.db, ownerActor, openDeal, sig());
  expect(ownerRow?.nextActivityAt?.toISOString()).toBe("2030-02-01T10:00:00.000Z");

  const [outsiderRow] = await listParticipants(h.db, outsiderActor, openDeal, sig());
  expect(outsiderRow?.nextActivityAt).toBeNull();
});

it("counts the deal's linked person as a participant, listed first and flagged primary", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const peter = await seedPerson(user.id, "Peter Kuusisto");
  const paul = await seedPerson(user.id, "Paul Burns");
  const dealId = await seedDeal(user.id, peter);
  await addParticipant(h.db, actor, dealId, paul, null, sig());

  const rows = await listParticipants(h.db, actor, dealId, sig());

  expect(rows.map((r) => [r.personId, r.isPrimary])).toEqual([
    [peter, true],
    [paul, false],
  ]);
});

it("does not duplicate the linked person when they are also an explicit participant", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const peter = await seedPerson(user.id, "Peter Kuusisto");
  const dealId = await seedDeal(user.id, peter);
  await addParticipant(h.db, actor, dealId, peter, null, sig());

  const rows = await listParticipants(h.db, actor, dealId, sig());

  expect(rows.map((r) => [r.personId, r.isPrimary, r.isExplicit])).toEqual([[peter, true, true]]);
});

it("marks a contact who is only the deal's person as not explicitly linked", async () => {
  const user = await seedUser(h.db);
  const actor = makeAdminActor(user.id);
  const peter = await seedPerson(user.id, "Peter Kuusisto");
  const dealId = await seedDeal(user.id, peter);

  const rows = await listParticipants(h.db, actor, dealId, sig());

  expect(rows.map((r) => [r.isPrimary, r.isExplicit])).toEqual([[true, false]]);
});

it("omits the linked person when the actor cannot see them", async () => {
  const owner = await seedUser(h.db, { name: "Owner" });
  const outsider = await seedUser(h.db, { name: "Outsider" });
  const ownerActor = makeAdminActor(owner.id);
  const hidden = await seedPerson(owner.id, "Hidden Hana");
  await h.db.update(persons).set({ visibilityLevel: "owner" }).where(eq(persons.id, hidden));
  const visible = await seedPerson(owner.id, "Visible Vera");
  const dealId = await seedDeal(owner.id, hidden);
  await addParticipant(h.db, ownerActor, dealId, visible, null, sig());

  const rows = await listParticipants(
    h.db,
    { ...makeAdminActor(outsider.id), type: "regular" as const },
    dealId,
    sig(),
  );

  expect(rows.map((r) => r.personId)).toEqual([visible]);
});
