// Integration tests for deleteDeal (soft delete). Real Postgres, no DB mocking.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { REGULAR_DEFAULT_FLAGS } from "@/constants/permissionFlags";
import { wsChannel } from "@/constants/wsChannels";
import { changeLogs, channelVersions, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { deleteDeal } from "./deleteDeal";
import { getWorkspace } from "./summaryRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function adminActor(userId: string): PermSetUser {
  return { id: userId, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

// Regular actor who can SEE an "all"-visibility deal but has no edit capability.
function viewerActor(userId: string): AuthUser {
  return { id: userId, type: "regular", isActive: true, groupIds: new Set() };
}

// The flat set of TRUE flags a default "regular" permission set grants (edit_own yes,
// delete_* no). Built from the same registry the runtime uses so the test cannot drift.
function regularDefaultFlagSet(): Set<PermissionFlagKey> {
  return new Set(
    (Object.entries(REGULAR_DEFAULT_FLAGS) as [PermissionFlagKey, boolean][])
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
}

function regularActor(userId: string, flags: Iterable<PermissionFlagKey>): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
  };
}

async function seedDeal(pipelineId: string, stageId: string, ownerId: string) {
  const [deal] = await h.db
    .insert(deals)
    .values({ title: "Deal", pipelineId, stageId, ownerId, visibilityLevel: "all" })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");
  return deal;
}

it("stamps deletedAt, writes a changelog row, and hides the deal from getWorkspace", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const signal = new AbortController().signal;

  const r = await deleteDeal(
    h.db,
    adminActor(u.id),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;
  expect(r.value.deletedAt).not.toBeNull();

  const logs = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, deal.id), eq(changeLogs.field, "deletedAt")));
  expect(logs.length).toBe(1);

  const ws = await getWorkspace(h.db, adminActor(u.id), deal.id, signal);
  expect(ws.ok).toBe(false);
  if (ws.ok === true) return;
  expect(ws.error.id).toBe("E_DEAL_001");
});

it("returns a perm error and leaves the deal intact for a non-editor", async () => {
  const owner = await seedUser(h.db);
  const viewer = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, owner.id);

  // viewerActor has no edit flags; a PermSetUser is required by deleteDeal.
  const actor: PermSetUser = { ...viewerActor(viewer.id), flags: new Set() };
  const r = await deleteDeal(
    h.db,
    actor,
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const [row] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(row?.deletedAt).toBeNull();
});

// PERMISSIONS-05: delete is a distinct capability from edit. A default "regular" user has
// edit_own but NOT delete_own, so owning (hence being able to edit) a deal must NOT let them
// delete it. Without an explicit deal.delete gate this call would succeed (privilege escalation).
it("denies a default regular user deleting a deal they own (edit_own is not delete_own)", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);

  const r = await deleteDeal(
    h.db,
    regularActor(u.id, regularDefaultFlagSet()),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const [row] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(row?.deletedAt).toBeNull();
});

it("allows an owner who holds deal.delete_own to delete their own deal", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);

  const r = await deleteDeal(
    h.db,
    regularActor(u.id, ["deal.edit_own", "deal.delete_own"]),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;
  expect(r.value.deletedAt).not.toBeNull();
});

// A user who can edit ANY deal (deal.edit_any, e.g. a manager) but holds only delete_own must
// NOT be able to delete a deal they do not own: delete_any is required for that.
it("denies a non-owner with edit_any + delete_own (needs delete_any) and leaves the deal intact", async () => {
  const owner = await seedUser(h.db);
  const manager = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, owner.id);

  const r = await deleteDeal(
    h.db,
    regularActor(manager.id, ["deal.edit_any", "deal.delete_own"]),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const [row] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(row?.deletedAt).toBeNull();
});

it("publishes a board event on the pipeline channel so the board refetches", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const signal = new AbortController().signal;

  const r = await deleteDeal(
    h.db,
    adminActor(u.id),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    signal,
  );
  expect(r.ok).toBe(true);

  const channel = wsChannel.pipeline(p.pipeline.id);
  const rows = await h.db
    .select()
    .from(channelVersions)
    .where(eq(channelVersions.channel, channel));
  expect(rows[0]).toBeDefined();
  expect(Number(rows[0]?.version ?? 0)).toBeGreaterThanOrEqual(1);
});
