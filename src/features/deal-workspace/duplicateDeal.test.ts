// Integration tests for duplicateDeal (clone a deal). Real Postgres, no DB mocking.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { changeLogs, deals, settings, visibilityGroups } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { duplicateDeal } from "./duplicateDeal";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function regularActor(userId: string, flags: Iterable<PermissionFlagKey>): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
  };
}

async function seedSource(pipelineId: string, stageId: string, ownerId: string) {
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Acme expansion",
      status: "won",
      value: "2500.00",
      labels: ["hot"],
      sourceChannel: "outbound",
      pipelineId,
      stageId,
      ownerId,
      visibilityLevel: "all",
      customFields: { region: "EU" },
      wonTime: new Date(),
      archivedAt: new Date(),
    })
    .returning();
  if (deal === undefined) throw new Error("source insert returned undefined");
  return deal;
}

it("clones fields into a new open deal owned by the actor, dropping won/archived state", async () => {
  const owner = await seedUser(h.db);
  const actor = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A", "B"]);
  const source = await seedSource(p.pipeline.id, p.stages[0]!.id, owner.id);

  const r = await duplicateDeal(
    h.db,
    regularActor(actor.id, ["deal.create"]),
    { dealId: source.id },
    new AbortController().signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;
  expect(r.value.id).not.toBe(source.id);

  const [clone] = await h.db.select().from(deals).where(eq(deals.id, r.value.id));
  expect(clone).toBeDefined();
  if (clone === undefined) return;
  // Copied core fields.
  expect(clone.title).toBe("Acme expansion (copy)");
  expect(clone.value).toBe("2500.00");
  expect(clone.pipelineId).toBe(source.pipelineId);
  expect(clone.stageId).toBe(source.stageId);
  expect(clone.labels).toEqual(["hot"]);
  expect(clone.sourceChannel).toBe("outbound");
  expect(clone.customFields).toEqual({ region: "EU" });
  // Owner is the actor, not the source owner.
  expect(clone.ownerId).toBe(actor.id);
  // NOT copied: won/lost/archived state.
  expect(clone.status).toBe("open");
  expect(clone.wonTime).toBeNull();
  expect(clone.archivedAt).toBeNull();
  expect(clone.deletedAt).toBeNull();
  // Fresh timestamps (distinct row, own createdAt).
  expect(clone.createdAt).not.toBeNull();

  // A changelog "created" trail exists on the new deal referencing the source.
  const logs = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, r.value.id), eq(changeLogs.field, "duplicatedFromDealId")));
  expect(logs.length).toBe(1);
});

it("clones under the group visibility default using the actor's primary visibility group", async () => {
  // Production seeds a settings row whose deal default is "group"; the actor's primary group must
  // be honored (regression: a hardcoded null group made this fail with E_PERM_003).
  const [group] = await h.db
    .insert(visibilityGroups)
    .values({ name: `G-${Date.now()}-${Math.random().toString(36).slice(2)}` })
    .returning();
  if (group === undefined) throw new Error("group insert undefined");
  await h.db
    .insert(settings)
    .values({
      id: true,
      defaultVisibilityLevels: { deal: "group", person: "all", organization: "all" },
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: { defaultVisibilityLevels: { deal: "group", person: "all", organization: "all" } },
    });
  const owner = await seedUser(h.db);
  const actor = await seedUser(h.db, { primaryVisibilityGroupId: group.id });
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const source = await seedSource(p.pipeline.id, p.stages[0]!.id, owner.id);

  const actorPerm: PermSetUser = {
    id: actor.id,
    type: "regular",
    isActive: true,
    groupIds: new Set([group.id]),
    flags: new Set<PermissionFlagKey>(["deal.create"]),
  };
  const r = await duplicateDeal(
    h.db,
    actorPerm,
    { dealId: source.id },
    new AbortController().signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;
  const [clone] = await h.db.select().from(deals).where(eq(deals.id, r.value.id));
  expect(clone?.visibilityLevel).toBe("group");
  expect(clone?.visibilityGroupId).toBe(group.id);

  // Clean up the singleton settings row so sibling tests see the no-settings (owner) default.
  await h.db.delete(settings);
});

it("denies an actor without deal.create and inserts nothing", async () => {
  const owner = await seedUser(h.db);
  const actor = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const source = await seedSource(p.pipeline.id, p.stages[0]!.id, owner.id);

  const before = await h.db.select({ id: deals.id }).from(deals);

  const r = await duplicateDeal(
    h.db,
    regularActor(actor.id, []),
    { dealId: source.id },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const after = await h.db.select({ id: deals.id }).from(deals);
  expect(after.length).toBe(before.length);
});

it("404s (E_DEAL_001) when the source is not visible to the actor", async () => {
  const owner = await seedUser(h.db);
  const actor = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  // owner-only visibility deal the actor cannot see.
  const [source] = await h.db
    .insert(deals)
    .values({
      title: "Hidden",
      pipelineId: p.pipeline.id,
      stageId: p.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "owner",
    })
    .returning();
  if (source === undefined) throw new Error("insert undefined");

  const r = await duplicateDeal(
    h.db,
    regularActor(actor.id, ["deal.create"]),
    { dealId: source.id },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_DEAL_001");
});
