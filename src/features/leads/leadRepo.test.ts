import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getLeadById, listLeads, listLeadsForExport } from "./leadRepo";

function visSession(userId: string, isAdmin = false) {
  return {
    userId,
    isAdmin,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
  };
}

const sig = () => new AbortController().signal;

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

const listArgs = {
  filter: "inbox" as const,
  offset: 0,
  limit: 100,
  sort: { field: "createdAt" as const, dir: "desc" as const },
  filters: {},
};

describe("getLeadById", () => {
  it("returns the lead with resolved names for a visible actor", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { name: "Owner Ada" });
      const lead = await insertLead(db, owner.id, { title: "Acme", value: "500.00" });

      const detail = await getLeadById(db, visSession(owner.id), lead.id, sig());
      expect(detail).not.toBeNull();
      expect(detail?.id).toBe(lead.id);
      expect(detail?.title).toBe("Acme");
      expect(detail?.ownerName).toBe("Owner Ada");
      expect(detail?.value).toBe("500.00");
    });
  });

  it("returns null for a non-visible actor (404-on-invisible)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const lead = await insertLead(db, owner.id, { visibilityLevel: "owner" });

      const detail = await getLeadById(db, visSession(other.id), lead.id, sig());
      expect(detail).toBeNull();
    });
  });

  it("returns null for a non-uuid id instead of throwing (bad [leadId] param -> 404, not 500)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const detail = await getLeadById(db, visSession(owner.id), "not-a-uuid", sig());
      expect(detail).toBeNull();
    });
  });
});

describe("listLeads sort", () => {
  it("sorts by title asc and desc", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await insertLead(db, owner.id, { title: "Bravo" });
      await insertLead(db, owner.id, { title: "Alpha" });
      await insertLead(db, owner.id, { title: "Charlie" });

      const asc = await listLeads(
        db,
        visSession(owner.id),
        { ...listArgs, sort: { field: "title", dir: "asc" } },
        sig(),
      );
      expect(asc.rows.map((r) => r.title)).toEqual(["Alpha", "Bravo", "Charlie"]);

      const desc = await listLeads(
        db,
        visSession(owner.id),
        { ...listArgs, sort: { field: "title", dir: "desc" } },
        sig(),
      );
      expect(desc.rows.map((r) => r.title)).toEqual(["Charlie", "Bravo", "Alpha"]);
    });
  });
});

describe("listLeads filters", () => {
  it("filters by ownerIds", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const la = await insertLead(db, a.id, { title: "A-lead" });
      await insertLead(db, b.id, { title: "B-lead" });

      const res = await listLeads(
        db,
        visSession(a.id, true),
        { ...listArgs, filters: { ownerIds: [a.id] } },
        sig(),
      );
      expect(res.rows.map((r) => r.id)).toEqual([la.id]);
    });
  });

  it("filters by next-activity bucket", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 3600_000);
      const inTwoDays = new Date(now.getTime() + 2 * 24 * 3600_000);

      const overdue = await insertLead(db, owner.id, { title: "past", nextActivityAt: yesterday });
      const today = await insertLead(db, owner.id, { title: "today", nextActivityAt: now });
      const future = await insertLead(db, owner.id, { title: "future", nextActivityAt: inTwoDays });
      const none = await insertLead(db, owner.id, { title: "none", nextActivityAt: null });

      const s = visSession(owner.id);
      const overdueRes = await listLeads(
        db,
        s,
        { ...listArgs, filters: { nextActivity: "overdue" } },
        sig(),
      );
      expect(overdueRes.rows.map((r) => r.id)).toEqual([overdue.id]);

      const todayRes = await listLeads(
        db,
        s,
        { ...listArgs, filters: { nextActivity: "today" } },
        sig(),
      );
      expect(todayRes.rows.map((r) => r.id)).toEqual([today.id]);

      const weekRes = await listLeads(
        db,
        s,
        { ...listArgs, filters: { nextActivity: "week" } },
        sig(),
      );
      expect(new Set(weekRes.rows.map((r) => r.id))).toEqual(new Set([today.id, future.id]));

      const noneRes = await listLeads(
        db,
        s,
        { ...listArgs, filters: { nextActivity: "none" } },
        sig(),
      );
      expect(noneRes.rows.map((r) => r.id)).toEqual([none.id]);
    });
  });

  it("filters by label overlap", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const warm = await insertLead(db, owner.id, { title: "warm", labels: ["warm"] });
      await insertLead(db, owner.id, { title: "cold", labels: ["cold"] });

      const res = await listLeads(
        db,
        visSession(owner.id),
        { ...listArgs, filters: { labelKeys: ["warm"] } },
        sig(),
      );
      expect(res.rows.map((r) => r.id)).toEqual([warm.id]);
    });
  });

  it("filters by an inline title-contains condition (case-insensitive substring)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const acme = await insertLead(db, owner.id, { title: "Acme Corp" });
      await insertLead(db, owner.id, { title: "Globex" });

      const res = await listLeads(
        db,
        visSession(owner.id),
        {
          ...listArgs,
          filters: {
            condition: {
              combinator: "and",
              conditions: [{ field: "title", op: "contains", value: "acme" }],
            },
          },
        },
        sig(),
      );
      expect(res.rows.map((r) => r.id)).toEqual([acme.id]);
      expect(res.total).toBe(1);
    });
  });

  it("filters by an inline numeric value condition", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const big = await insertLead(db, owner.id, { title: "big", value: "5000.00" });
      await insertLead(db, owner.id, { title: "small", value: "100.00" });

      const res = await listLeads(
        db,
        visSession(owner.id),
        {
          ...listArgs,
          filters: {
            condition: {
              combinator: "and",
              conditions: [{ field: "value", op: "gt", value: "1000" }],
            },
          },
        },
        sig(),
      );
      expect(res.rows.map((r) => r.id)).toEqual([big.id]);
    });
  });

  it("applies the inline condition to the CSV export result set (listLeadsForExport)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const acme = await insertLead(db, owner.id, { title: "Acme Corp" });
      await insertLead(db, owner.id, { title: "Globex" });

      const rows = await listLeadsForExport(
        db,
        visSession(owner.id),
        {
          ...listArgs,
          filters: {
            condition: {
              combinator: "and",
              conditions: [{ field: "title", op: "contains", value: "acme" }],
            },
          },
        },
        sig(),
      );
      expect(rows.map((r) => r.id)).toEqual([acme.id]);
    });
  });
});

describe("listLeads row shape (convert support)", () => {
  it("returns updatedAt (Date) and convertedDealId (null for an unconverted lead)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await insertLead(db, owner.id, { title: "Fresh" });

      const res = await listLeads(db, visSession(owner.id), listArgs, sig());
      const row = res.rows[0];
      expect(row).toBeDefined();
      expect(row?.updatedAt).toBeInstanceOf(Date);
      expect(row?.convertedDealId).toBeNull();
    });
  });
});

describe("listLeadsForExport", () => {
  it("returns every visible matching row with no limit, honoring filters", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      // Three visible to owner (owner-visibility), one owned by other and owner-private.
      await insertLead(db, owner.id, { title: "A", labels: ["warm"] });
      await insertLead(db, owner.id, { title: "B", labels: ["warm"] });
      await insertLead(db, owner.id, { title: "C", labels: ["cold"] });
      await insertLead(db, other.id, { title: "D", visibilityLevel: "owner", labels: ["warm"] });

      const rows = await listLeadsForExport(
        db,
        visSession(owner.id),
        { ...listArgs, limit: 1, filters: { labelKeys: ["warm"] } },
        sig(),
      );
      // limit:1 is ignored by export; label filter keeps A + B; D is not visible to owner.
      expect(rows.map((r) => r.title).sort()).toEqual(["A", "B"]);
    });
  });
});
