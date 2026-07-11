import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { persons } from "@/db/schema/persons";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { LeadSession } from "./leadActions";
import { convertLead } from "./leadConvert";

function session(userId: string, extra: Partial<LeadSession> = {}): LeadSession {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null,
    flags: { "deal.create": true },
    ...extra,
  };
}

async function seedSettings(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  overrides: Partial<typeof settings.$inferInsert> = {},
) {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
    ...overrides,
  });
}

async function insertLead(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
  overrides: Partial<typeof leads.$inferInsert> = {},
) {
  const [row] = await db
    .insert(leads)
    .values({ title: "Acme lead", ownerId, visibilityLevel: "all", ...overrides })
    .returning();
  if (row === undefined) throw new Error("insertLead failed");
  return row;
}

const sig = () => new AbortController().signal;

describe("convertLead", () => {
  it("creates a deal in the pipeline's first stage and archives the lead", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify", "Contact", "Won"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, owner.id, { title: "Big deal", value: "9000.00" });

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.title).toBe("Big deal");
      expect(deal?.value).toBe("9000.00");
      expect(deal?.pipelineId).toBe(pipe.pipeline.id);
      // First stage = lowest order.
      expect(deal?.stageId).toBe(pipe.stages[0]!.id);
      expect(deal?.ownerId).toBe(owner.id);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.convertedDealId).toBe(r.value.dealId);
      expect(after?.archivedAt).not.toBeNull();
    });
  });

  it("derives the created deal's visibility server-side from settings", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.visibilityLevel).toBe("all");
    });
  });

  it("rejects converting a lead with a hidden person reference", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      // Lead is visible to `other` (all), but its person is owner-only.
      const lead = await insertLead(db, other.id, { personId: hidden!.id });

      const r = await convertLead(
        db,
        session(other.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_CONTACT_001");
      // No deal created.
      expect(await db.select().from(deals)).toHaveLength(0);
    });
  });

  it("errors when the lead is already converted", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, owner.id);
      const first = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(first.ok).toBe(true);

      const [reloaded] = await db.select().from(leads).where(eq(leads.id, lead.id));
      const again = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: reloaded!.updatedAt.toISOString() },
        sig(),
      );
      expect(again.ok).toBe(false);
      if (again.ok) return;
      expect(again.error.id).toBe("E_LEAD_003");
    });
  });

  it("errors when no target pipeline is resolvable", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedSettings(db); // no defaultPipelineId
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_LEAD_004");
    });
  });
});
