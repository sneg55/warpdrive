import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { leads } from "@/db/schema/leads";
import { persons } from "@/db/schema/persons";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { LeadSession } from "./leadActions";
import { bulkConvertLeads } from "./leadBulkConvert";
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
    .values({ title: "L", ownerId, visibilityLevel: "all", ...overrides })
    .returning();
  if (row === undefined) throw new Error("insertLead failed");
  return row;
}

const sig = () => new AbortController().signal;

describe("bulkConvertLeads", () => {
  it("converts open leads, skips an already-converted one, batch semantics", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });

      const openA = await insertLead(db, owner.id, { title: "Open A" });
      const openB = await insertLead(db, owner.id, { title: "Open B" });
      const converted = await insertLead(db, owner.id, { title: "Pre-converted" });
      const first = await convertLead(
        db,
        session(owner.id),
        { leadId: converted.id, expectedUpdatedAt: converted.updatedAt.toISOString() },
        sig(),
      );
      expect(first.ok).toBe(true);

      const r = await bulkConvertLeads(
        db,
        session(owner.id),
        { ids: [openA.id, openB.id, converted.id] },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ converted: 2, skipped: 1 });

      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [openA.id, openB.id]));
      expect(rows.every((row) => row.convertedDealId !== null)).toBe(true);
    });
  });

  it("skips ids the actor cannot see, without abandoning the rest of the batch", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const visible = await insertLead(db, other.id);
      const hidden = await insertLead(db, owner.id, { visibilityLevel: "owner" });

      const r = await bulkConvertLeads(
        db,
        session(other.id),
        { ids: [visible.id, hidden.id] },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ converted: 1, skipped: 1 });

      const [hiddenAfter] = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [hidden.id]));
      // The invisible lead was never converted.
      expect(hiddenAfter?.convertedDealId).toBeNull();
    });
  });

  it("skips a lead with a hidden contact reference (per-item), keeps converting the rest", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });

      // Hidden is owner-only visible to `owner`, but the lead referencing it belongs to
      // `other`: converting it hits assertConvertReferences -> CONTACT_NOT_FOUND, a
      // per-item outcome (this lead's reference, not a batch-wide condition).
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();

      const openA = await insertLead(db, other.id, { title: "Open A" });
      const badContact = await insertLead(db, other.id, {
        title: "Bad Contact",
        personId: hidden!.id,
      });
      const openB = await insertLead(db, other.id, { title: "Open B" });

      const r = await bulkConvertLeads(
        db,
        session(other.id),
        { ids: [openA.id, badContact.id, openB.id] },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ converted: 2, skipped: 1 });

      const [badAfter] = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [badContact.id]));
      expect(badAfter?.convertedDealId).toBeNull();

      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [openA.id, openB.id]));
      expect(rows.every((row) => row.convertedDealId !== null)).toBe(true);
    });
  });

  it("aborts the whole batch on a systemic error (PERM_DENIED) instead of folding it into skipped", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });

      const a = await insertLead(db, owner.id, { title: "A" });
      const b = await insertLead(db, owner.id, { title: "B" });

      // Actor lacks deal.create: convertLead returns PERM_DENIED for every id identically, which
      // must abort the batch rather than read as "0 converted, N skipped" (a silent no-op).
      const r = await bulkConvertLeads(
        db,
        session(owner.id, { flags: {} }),
        { ids: [a.id, b.id] },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe(ERROR_IDS.PERM_DENIED);

      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [a.id, b.id]));
      expect(rows.every((row) => row.convertedDealId === null)).toBe(true);
    });
  });

  it("aborts the batch when no pipeline is resolvable (systemic, not per-item)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      // No pipeline seeded and no defaultPipelineId configured: every id would hit
      // LEAD_CONVERT_NO_PIPELINE identically.
      await seedSettings(db);

      const a = await insertLead(db, owner.id, { title: "A" });

      const r = await bulkConvertLeads(db, session(owner.id), { ids: [a.id] }, sig());
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE);

      const [row] = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [a.id]));
      expect(row?.convertedDealId).toBeNull();
    });
  });

  it("returns an input-invalid error instead of throwing on a malformed batch", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      // ids: [] fails bulkConvertLeadsInput's .min(1): safeParse must turn this into a Result
      // error, not a thrown ZodError, per the validate-at-the-boundary rule.
      const r = await bulkConvertLeads(db, session(owner.id), { ids: [] }, sig());
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe(ERROR_IDS.LEAD_BULK_CONVERT_INPUT_INVALID);
    });
  });
});
