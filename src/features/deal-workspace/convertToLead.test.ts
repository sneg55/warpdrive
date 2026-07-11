// Integration tests for convertDealToLead (deal -> lead). Real Postgres, no DB mocking.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { changeLogs, deals, leads } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { convertDealToLead } from "./convertToLead";

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

async function seedDeal(pipelineId: string, stageId: string, ownerId: string) {
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Globex renewal",
      value: "4000.00",
      labels: ["warm"],
      sourceChannel: "inbound",
      pipelineId,
      stageId,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");
  return deal;
}

it("refuses to convert an already-archived deal and creates no second lead", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  // Simulate a deal already closed (e.g. by a prior convert): only archivedAt is stamped.
  await h.db.update(deals).set({ archivedAt: new Date() }).where(eq(deals.id, deal.id));
  const [archived] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  if (archived === undefined) throw new Error("archived reload undefined");

  const before = await h.db.select({ id: leads.id }).from(leads);
  const r = await convertDealToLead(
    h.db,
    regularActor(u.id, ["deal.create", "deal.edit_own"]),
    { dealId: deal.id, expectedUpdatedAt: archived.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  const after = await h.db.select({ id: leads.id }).from(leads);
  expect(after.length).toBe(before.length);
});

it("creates a lead carrying the deal's title/value/labels, archives the deal, logs both", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);

  const r = await convertDealToLead(
    h.db,
    regularActor(u.id, ["deal.create", "deal.edit_own"]),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;

  const [lead] = await h.db.select().from(leads).where(eq(leads.id, r.value.leadId));
  expect(lead).toBeDefined();
  if (lead === undefined) return;
  expect(lead.title).toBe("Globex renewal");
  expect(lead.value).toBe("4000.00");
  expect(lead.labels).toEqual(["warm"]);
  expect(lead.sourceChannel).toBe("inbound");
  expect(lead.ownerId).toBe(u.id);

  // Deal is closed (archived), so it is no longer active.
  const [closed] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(closed?.archivedAt).not.toBeNull();

  // Changelog on BOTH sides.
  const dealLog = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, deal.id), eq(changeLogs.field, "convertedToLeadId")));
  expect(dealLog.length).toBe(1);
  const leadLog = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, r.value.leadId), eq(changeLogs.field, "createdFromDealId")));
  expect(leadLog.length).toBe(1);
});

it("denies an editor without deal.create and creates no lead / leaves the deal active", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const before = await h.db.select({ id: leads.id }).from(leads);

  // Owner has edit_own (passes the edit gate) but NOT deal.create.
  const r = await convertDealToLead(
    h.db,
    regularActor(u.id, ["deal.edit_own"]),
    { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const after = await h.db.select({ id: leads.id }).from(leads);
  expect(after.length).toBe(before.length);
  const [still] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(still?.archivedAt).toBeNull();
});

it("returns E_DEAL_002 on a stale CAS and does not convert", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const before = await h.db.select({ id: leads.id }).from(leads);

  const r = await convertDealToLead(
    h.db,
    regularActor(u.id, ["deal.create", "deal.edit_own"]),
    { dealId: deal.id, expectedUpdatedAt: new Date(Date.now() - 60_000).toISOString() },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_DEAL_002");

  // The lead insert rolled back with the failed CAS (single transaction).
  const after = await h.db.select({ id: leads.id }).from(leads);
  expect(after.length).toBe(before.length);
  const [still] = await h.db.select().from(deals).where(eq(deals.id, deal.id));
  expect(still?.archivedAt).toBeNull();
});
