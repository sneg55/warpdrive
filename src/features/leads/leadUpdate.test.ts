// leadUpdate.test.ts: CAS precondition, permissions, and field updates for updateLead
// (the LeadSummaryEditPanel's Value/Owner/Expected-close inline-edit save path).
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { LeadSession } from "./leadActions";
import { updateLead } from "./leadUpdate";

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

describe("updateLead: field updates", () => {
  it("updates value and reads back the new value", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id, { value: "100.00" });

      const r = await updateLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), value: 250 },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.id).toBe(lead.id);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.value).toBe("250.00");
    });
  });

  it("updates expectedCloseDate", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id);

      const r = await updateLead(
        db,
        session(owner.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          expectedCloseDate: "2026-08-15",
        },
        sig(),
      );
      expect(r.ok).toBe(true);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.expectedCloseDate).toBe("2026-08-15");
    });
  });

  it("reassigns ownerId when the actor holds deal.changeOwner", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const lead = await insertLead(db, a.id);

      const r = await updateLead(
        db,
        session(a.id, { flags: { "deal.changeOwner": true } }),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), ownerId: b.id },
        sig(),
      );
      expect(r.ok).toBe(true);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.ownerId).toBe(b.id);
    });
  });

  it("rejects an ownerId change without deal.changeOwner and leaves the owner unchanged", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const lead = await insertLead(db, a.id);

      const r = await updateLead(
        db,
        session(a.id), // only deal.create, not deal.changeOwner
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), ownerId: b.id },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_PERM_001");

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.ownerId).toBe(a.id);
    });
  });
});

describe("updateLead: CAS precondition", () => {
  it("returns E_LEAD_007 on stale expectedUpdatedAt and leaves the row unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id, { value: "100.00" });

      const r = await updateLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: "2000-01-01T00:00:00.000Z", value: 999 },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_LEAD_007");

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.value).toBe("100.00");
    });
  });
});

describe("updateLead: visibility", () => {
  it("returns E_LEAD_001 when the lead is not visible to the actor", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const lead = await insertLead(db, owner.id, { visibilityLevel: "owner" });

      const r = await updateLead(
        db,
        session(other.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), value: 500 },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_LEAD_001");
    });
  });
});

describe("updateLead: input validation", () => {
  it("returns E_LEAD_006 for a negative value", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id);

      const r = await updateLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), value: -5 },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_LEAD_006");
    });
  });
});
