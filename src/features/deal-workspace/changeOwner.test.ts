// Integration tests for changeOwner. Real Postgres via Testcontainers, no DB mocking.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { changeLogs, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { changeOwner } from "./changeOwner";

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

// Regular actor with edit_any (passes loadEditableDeal) but NO deal.changeOwner.
function editOnlyActor(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set<PermissionFlagKey>(["deal.edit_any"]),
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

it("reassigns the owner and writes an ownerId changelog row for an admin actor", async () => {
  const owner = await seedUser(h.db);
  const newOwner = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, owner.id);

  const r = await changeOwner(
    h.db,
    adminActor(owner.id),
    { dealId: deal.id, ownerId: newOwner.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;
  expect(r.value.ownerId).toBe(newOwner.id);

  const logs = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, deal.id), eq(changeLogs.field, "ownerId")));
  expect(logs.length).toBe(1);
  expect(logs[0]?.oldValue).toBe(owner.id);
  expect(logs[0]?.newValue).toBe(newOwner.id);
});

it("returns E_PERM_001 and leaves the owner unchanged without deal.changeOwner", async () => {
  const owner = await seedUser(h.db);
  const actor = await seedUser(h.db);
  const newOwner = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, owner.id);

  const r = await changeOwner(
    h.db,
    editOnlyActor(actor.id),
    { dealId: deal.id, ownerId: newOwner.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const [row] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(row?.ownerId).toBe(owner.id);
});

it("returns E_DEAL_002 on a stale CAS precondition", async () => {
  const owner = await seedUser(h.db);
  const newOwner = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, owner.id);

  const r = await changeOwner(
    h.db,
    adminActor(owner.id),
    { dealId: deal.id, ownerId: newOwner.id, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_DEAL_002");
});
