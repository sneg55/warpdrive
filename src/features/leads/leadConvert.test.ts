import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { customFieldDefs } from "@/db/schema/customFieldDefs";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { persons } from "@/db/schema/persons";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { convertLead } from "./leadConvert";
import { insertLead, seedSettings, session, sig } from "./leadConvert.test-helpers";

describe("convertLead", () => {
  it("requires Important deal fields and persists the validated conversion payload", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      await db.insert(customFieldDefs).values({
        targetEntity: "deal",
        type: "text",
        name: "Industry",
        key: "industry",
        isImportant: true,
      });
      const lead = await insertLead(db, owner.id);

      const missing = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.error.id).toBe("E_CF_003");
      expect(await db.select().from(deals)).toHaveLength(0);

      const converted = await convertLead(
        db,
        session(owner.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          customFields: { industry: "SaaS" },
        },
        sig(),
      );
      expect(converted.ok).toBe(true);
      if (!converted.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, converted.value.dealId));
      expect(deal?.customFields).toEqual({ industry: "SaaS" });
    });
  });

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

  // Deleting a contact leaves every lead that referenced it with a dangling person_id: nothing
  // unlinks them. The lead sidebar already treats such a contact as absent (leadRepo filters
  // deletedAt), so convert must not be the one place that treats it as a blocking reference, which
  // left the lead permanently unconvertible behind a generic error. A HIDDEN contact is a different
  // case entirely and still blocks, per the test above.
  it("converts a lead whose linked person was deleted, dropping the dead link", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const [gone] = await db
        .insert(persons)
        .values({
          name: "Deleted contact",
          ownerId: owner.id,
          visibilityLevel: "all",
          deletedAt: new Date(),
        })
        .returning();
      const lead = await insertLead(db, owner.id, { personId: gone?.id });

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.personId).toBeNull();
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

  it("carries lead custom fields onto the deal where key and type match; typed values win", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      await db.insert(customFieldDefs).values([
        { targetEntity: "lead", type: "text", name: "Grade", key: "grade" },
        { targetEntity: "deal", type: "text", name: "Grade", key: "grade" },
        { targetEntity: "lead", type: "text", name: "Language", key: "language" },
        { targetEntity: "deal", type: "numeric", name: "Language", key: "language" },
        { targetEntity: "lead", type: "text", name: "Only lead", key: "only_lead" },
      ]);
      const values = { grade: "A", language: "en", only_lead: "x" };
      const carried = await insertLead(db, owner.id, { customFields: values });
      const overridden = await insertLead(db, owner.id, { customFields: values });

      const carryOnly = await convertLead(
        db,
        session(owner.id),
        { leadId: carried.id, expectedUpdatedAt: carried.updatedAt.toISOString() },
        sig(),
      );
      expect(carryOnly.ok).toBe(true);
      if (!carryOnly.ok) return;
      const [carriedDeal] = await db
        .select()
        .from(deals)
        .where(eq(deals.id, carryOnly.value.dealId));
      expect(carriedDeal?.customFields).toEqual({ grade: "A" });

      const typed = await convertLead(
        db,
        session(owner.id),
        {
          leadId: overridden.id,
          expectedUpdatedAt: overridden.updatedAt.toISOString(),
          customFields: { grade: "B" },
        },
        sig(),
      );
      expect(typed.ok).toBe(true);
      if (!typed.ok) return;
      const [typedDeal] = await db.select().from(deals).where(eq(deals.id, typed.value.dealId));
      expect(typedDeal?.customFields).toEqual({ grade: "B" });
    });
  });

  it("drops a carried value the dialog explicitly cleared", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      await db.insert(customFieldDefs).values([
        { targetEntity: "lead", type: "text", name: "Grade", key: "grade" },
        { targetEntity: "deal", type: "text", name: "Grade", key: "grade" },
      ]);
      const lead = await insertLead(db, owner.id, { customFields: { grade: "A" } });

      const r = await convertLead(
        db,
        session(owner.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          customFields: { grade: null },
        },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const [deal] = await db.select().from(deals).where(eq(deals.id, r.value.dealId));
      expect(deal?.customFields).toEqual({});
    });
  });
});
