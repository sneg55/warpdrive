import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { archiveLead, type LeadSession } from "./leadActions";
import { bulkUpdateLeads } from "./leadBulk";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

function session(userId: string): LeadSession {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
    managedUserIds: [],
    primaryVisibilityGroupId: null,
    flags: { "deal.create": true },
  };
}

const sig = (): AbortSignal => new AbortController().signal;

async function seedLead(db: TestDb, ownerId: string, archivedAt: Date | null) {
  const [row] = await db
    .insert(leads)
    .values({ title: "Repeat", ownerId, visibilityLevel: "all", archivedAt })
    .returning();
  if (row === undefined) throw new Error("lead seed failed");
  return row;
}

async function readLead(db: TestDb, id: string) {
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}

const EARLIER = new Date("2026-01-02T03:04:05.000Z");

describe("archiveLead repeats are no-ops", () => {
  it("archiving an already-archived lead keeps archived_at and updated_at", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const lead = await seedLead(db, u.id, EARLIER);
      const r = await archiveLead(db, session(u.id), { leadId: lead.id, archived: true }, sig());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.archivedAt?.getTime()).toBe(EARLIER.getTime());
      const after = await readLead(db, lead.id);
      expect(after?.archivedAt?.getTime()).toBe(EARLIER.getTime());
      expect(after?.updatedAt.getTime()).toBe(lead.updatedAt.getTime());
    });
  });

  it("restoring a lead that is not archived leaves it untouched", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const lead = await seedLead(db, u.id, null);
      const r = await archiveLead(db, session(u.id), { leadId: lead.id, archived: false }, sig());
      expect(r.ok).toBe(true);
      const after = await readLead(db, lead.id);
      expect(after?.archivedAt).toBeNull();
      expect(after?.updatedAt.getTime()).toBe(lead.updatedAt.getTime());
    });
  });
});

describe("bulkUpdateLeads archive repeats", () => {
  it("keeps the original archived_at on a lead that was already archived", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const old = await seedLead(db, u.id, EARLIER);
      const fresh = await seedLead(db, u.id, null);
      const r = await bulkUpdateLeads(
        db,
        session(u.id),
        { ids: [old.id, fresh.id], change: { archived: true } },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect((await readLead(db, old.id))?.archivedAt?.getTime()).toBe(EARLIER.getTime());
      expect((await readLead(db, fresh.id))?.archivedAt).not.toBeNull();
    });
  });
});
