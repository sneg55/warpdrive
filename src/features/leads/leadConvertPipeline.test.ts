import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { convertLead } from "./leadConvert";
import { insertLead, seedSettings, session, sig } from "./leadConvert.test-helpers";

describe("convertLead pipeline resolution", () => {
  it("errors when no target pipeline is resolvable", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedSettings(db);
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

  it("falls back to the first pipeline when no default is configured", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify", "Won"], { order: 0 });
      await seedSettings(db);
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.pipelineId).toBe(pipe.pipeline.id);
      expect(deal?.stageId).toBe(pipe.stages[0]?.id);
    });
  });

  it("falls back when the configured default pipeline no longer exists", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const live = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: "00000000-0000-0000-0000-000000000000" });
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.pipelineId).toBe(live.pipeline.id);
    });
  });

  it("falls back when the configured default pipeline is archived", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stale = await seedPipelineWithStages(db, ["Old"], { order: 0, isArchived: true });
      const live = await seedPipelineWithStages(db, ["Qualify"], { order: 1 });
      await seedSettings(db, { defaultPipelineId: stale.pipeline.id });
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.pipelineId).toBe(live.pipeline.id);
    });
  });

  it("errors when the explicitly requested pipeline is archived", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const archived = await seedPipelineWithStages(db, ["Old"], { isArchived: true });
      await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db);
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        {
          leadId: lead.id,
          pipelineId: archived.pipeline.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
        },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_LEAD_004");
      expect(await db.select().from(deals)).toHaveLength(0);
    });
  });

  it("skips archived pipelines when falling back", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedPipelineWithStages(db, ["Old"], { order: 0, isArchived: true });
      const live = await seedPipelineWithStages(db, ["Qualify"], { order: 1 });
      await seedSettings(db);
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.pipelineId).toBe(live.pipeline.id);
    });
  });
});
