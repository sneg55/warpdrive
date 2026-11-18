import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermSetUser } from "@/features/permissions/effective";
import type { TestDb } from "@/test/db";

const testDbHolder: { db: TestDb | null } = { db: null };

vi.mock("@/db/client", () => ({
  get db() {
    if (testDbHolder.db === null) throw new Error("testDbHolder.db not initialized");
    return testDbHolder.db.db;
  },
}));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: vi.fn(() => Promise.resolve({ ok: true })),
}));

const ctxActor: { current: PermSetUser | null } = { current: null };
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor: ctxActor.current })),
}));

import { sql } from "drizzle-orm";
import { ERROR_IDS } from "@/constants/errorIds";
import { leads } from "@/db/schema/leads";
import { settings } from "@/db/schema/system";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { bulkConvertLeadsAction, convertLeadAction } from "./leadServerActions";

const REJECTED_TITLE = "Rejected by constraint";

async function seedLead(title: string): Promise<{ id: string; updatedAt: Date }> {
  const [row] = await testDbHolder
    .db!.db.insert(leads)
    .values({ title, ownerId: ctxActor.current!.id, visibilityLevel: "all" })
    .returning();
  return { id: row!.id, updatedAt: row!.updatedAt };
}

async function rejectDealTitle(): Promise<void> {
  await testDbHolder.db!.db.execute(
    sql.raw(`ALTER TABLE deals ADD CONSTRAINT probe_reject CHECK (title <> '${REJECTED_TITLE}')`),
  );
}

async function convertedCount(): Promise<number> {
  const rows = await testDbHolder.db!.db.select().from(leads);
  return rows.filter((l) => l.convertedDealId !== null).length;
}

describe("lead convert actions return a Result when the write throws", () => {
  beforeEach(async () => {
    testDbHolder.db = await makeTestDb();
    const admin = await seedUser(testDbHolder.db.db, { isAdmin: true });
    ctxActor.current = {
      id: admin.id,
      type: "admin",
      isActive: true,
      groupIds: new Set(),
      managedUserIds: new Set(),
      flags: new Set(),
    };
    const pipe = await seedPipelineWithStages(testDbHolder.db.db, ["Qualify"]);
    await testDbHolder.db.db.insert(settings).values({
      id: true,
      baseCurrency: "USD",
      defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      defaultPipelineId: pipe.pipeline.id,
    });
  });
  afterEach(async () => {
    await testDbHolder.db?.close();
    testDbHolder.db = null;
    ctxActor.current = null;
  });

  it("convertLeadAction returns DB_WRITE_FAILED when the deal insert is rejected", async () => {
    const lead = await seedLead(REJECTED_TITLE);
    await rejectDealTitle();
    const r = await convertLeadAction(
      { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), customFields: {} },
      "csrf",
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
    expect(await convertedCount()).toBe(0);
  });

  it("bulkConvertLeadsAction converts the rest and reports a thrown item as failed", async () => {
    const good = await seedLead("Good lead");
    const bad = await seedLead(REJECTED_TITLE);
    const alsoGood = await seedLead("Another good lead");
    await rejectDealTitle();
    const r = await bulkConvertLeadsAction({ ids: [good.id, bad.id, alsoGood.id] }, "csrf");
    expect(r).toEqual({
      ok: true,
      value: { converted: 2, skipped: 0, failed: 1, failureId: ERROR_IDS.DB_WRITE_FAILED },
    });
    expect(await convertedCount()).toBe(2);
  });

  it("bulkConvertLeadsAction returns the failure when every item throws", async () => {
    const bad = await seedLead(REJECTED_TITLE);
    await rejectDealTitle();
    const r = await bulkConvertLeadsAction({ ids: [bad.id] }, "csrf");
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
  });
});
