// Integration tests for getWorkspace (deal detail page aggregation).
// Real Postgres via Testcontainers (no DB mocking, see CLAUDE.md).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { dealFollowers, deals, organizations, persons } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createPerson } from "@/features/contacts/personsRepo";
import { makeTestDb } from "@/test/db";
import { getWorkspace } from "./summaryRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

// One actor object that satisfies BOTH ContactActor (createPerson) and AuthUser
// (getWorkspace, which only needs canSee).
function makeActor(userId: string) {
  return {
    id: userId,
    type: "regular" as const,
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
    primaryVisibilityGroupId: null,
  };
}

const sig = () => new AbortController().signal;

it("aggregates the deal with its linked person and stage progress", async () => {
  const user = await seedUser(h.db);
  const actor = makeActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead", "Qualified", "Won"]);

  const person = await createPerson(
    h.db,
    actor,
    {
      name: "Jane",
      emails: [{ label: "work", value: "j@a.com", primary: true }],
      phones: [],
      orgId: null,
      customFields: {},
    },
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
      personId: person.value.id,
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  const r = await getWorkspace(h.db, actor, deal.id, sig());

  expect(r.ok).toBe(true);
  if (r.ok === true) {
    expect(r.value.deal.id).toBe(deal.id);
    expect(r.value.person?.name).toBe("Jane");
    expect(r.value.stageProgress.chips.length).toBeGreaterThan(0);
    expect(Array.isArray(r.value.customFieldDefs)).toBe(true);
  }
});

it("returns 404-shape (E_DEAL_001) for a deal the actor cannot see", async () => {
  const actorUser = await seedUser(h.db);
  const actor = makeActor(actorUser.id);

  // A deal owned by ANOTHER user with visibilityLevel "owner" (private to its owner).
  const otherUser = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);
  const [hidden] = await h.db
    .insert(deals)
    .values({
      title: "Hidden",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: otherUser.id,
      visibilityLevel: "owner",
    })
    .returning();
  if (hidden === undefined) throw new Error("setup: hidden deal insert failed");

  const r = await getWorkspace(h.db, actor, hidden.id, sig());

  expect(r.ok).toBe(false);
  if (r.ok === false) {
    expect(r.error.id).toBe("E_DEAL_001");
  }
});

// F7/F9: a deal in an ARCHIVED pipeline must not open via direct workspace read, matching
// list/board/search which hide archived pipelines.
it("returns DEAL_NOT_FOUND for a deal in an archived pipeline", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"], { isArchived: true });
  const stage = p.stages[0]!;
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "archived",
      status: "open",
      pipelineId: p.pipeline.id,
      stageId: stage.id,
      boardPosition: "1000",
      ownerId: u.id,
      visibilityLevel: "all",
    })
    .returning();
  const r = await getWorkspace(h.db, makeActor(u.id), d!.id, sig());
  expect(r.ok).toBe(false);
  if (r.ok === false) {
    expect(r.error.id).toBe("E_DEAL_001");
  }
});

it("exposes pipeline name, owner avatar, and resolved followers with self flag", async () => {
  const owner = await seedUser(h.db, { avatarUrl: "https://cdn/a.png" });
  const follower = await seedUser(h.db);
  const actor = makeActor(owner.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead", "Qualified"], {
    name: "Sales pipeline",
  });
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");
  await h.db.insert(dealFollowers).values([
    { dealId: deal.id, userId: owner.id },
    { dealId: deal.id, userId: follower.id },
  ]);

  const r = await getWorkspace(h.db, actor, deal.id, sig());
  expect(r.ok).toBe(true);
  if (r.ok === false) return;
  expect(r.value.pipelineName).toBe("Sales pipeline");
  expect(r.value.owner?.avatarUrl).toBe("https://cdn/a.png");
  expect(r.value.followers).toHaveLength(2);
  expect(r.value.isFollowedBySelf).toBe(true);

  // A viewer who is not a follower sees isFollowedBySelf === false.
  const other = await seedUser(h.db);
  const r2 = await getWorkspace(h.db, makeActor(other.id), deal.id, sig());
  expect(r2.ok).toBe(true);
  if (r2.ok === false) return;
  expect(r2.value.isFollowedBySelf).toBe(false);
});

it("returns a not-found err for a non-uuid dealId instead of throwing (bad [dealId] param -> 404)", async () => {
  const user = await seedUser(h.db);
  const r = await getWorkspace(h.db, makeActor(user.id), "not-a-uuid", sig());
  expect(r.ok).toBe(false);
  if (r.ok === false) {
    expect(r.error.id).toBe("E_DEAL_001");
  }
});

// A soft-deleted person/org is invisible everywhere else (getPerson/getOrg 404, listPeople
// excludes). The deal workspace must treat it as absent too, otherwise DealSidebar renders a
// live link to a contact whose detail page 404s (dangling link).
it("omits a soft-deleted linked person (no dangling link to a 404 contact)", async () => {
  const user = await seedUser(h.db);
  const actor = makeActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const person = await createPerson(
    h.db,
    actor,
    { name: "Emma", emails: [], phones: [], orgId: null, customFields: {} },
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
      personId: person.value.id,
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  // Soft-delete the person AFTER linking (deleting a contact who is still on a live deal).
  await h.db.update(persons).set({ deletedAt: new Date() }).where(eq(persons.id, person.value.id));

  const r = await getWorkspace(h.db, actor, deal.id, sig());
  expect(r.ok).toBe(true);
  if (r.ok === true) {
    expect(r.value.person).toBeNull();
  }
});

it("omits a soft-deleted linked organization", async () => {
  const user = await seedUser(h.db);
  const actor = makeActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead"]);

  const [org] = await h.db
    .insert(organizations)
    .values({ name: "Acme", ownerId: user.id, visibilityLevel: "all" })
    .returning();
  if (org === undefined) throw new Error("setup: org insert failed");

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
      orgId: org.id,
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  await h.db
    .update(organizations)
    .set({ deletedAt: new Date() })
    .where(eq(organizations.id, org.id));

  const r = await getWorkspace(h.db, actor, deal.id, sig());
  expect(r.ok).toBe(true);
  if (r.ok === true) {
    expect(r.value.org).toBeNull();
  }
});

// The deal page needs the pipeline's visibility group to build the VisibleDeal that gates the
// owner-reassign and delete controls. getWorkspace already loads it for its own canSee check, so
// it returns it rather than making the page re-query the same row.
it("returns the pipeline's visibility group so callers need not re-query it", async () => {
  const user = await seedUser(h.db);
  const actor = makeActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead", "Won"]);

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "VG",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  const r = await getWorkspace(h.db, actor, deal.id, sig());
  expect(r.ok).toBe(true);
  if (r.ok === true) {
    expect(r.value.pipelineVisibilityGroupId).toBe(pipe.pipeline.visibilityGroupId ?? null);
  }
});
