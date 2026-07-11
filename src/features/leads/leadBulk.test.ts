import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { LeadSession } from "./leadActions";
import { bulkUpdateLeads } from "./leadBulk";

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
    .values({ title: "L", ownerId, visibilityLevel: "all", ...overrides })
    .returning();
  if (row === undefined) throw new Error("insertLead failed");
  return row;
}

const sig = () => new AbortController().signal;

describe("bulkUpdateLeads", () => {
  it("changes owner across many leads", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const l1 = await insertLead(db, a.id);
      const l2 = await insertLead(db, a.id);

      const r = await bulkUpdateLeads(
        db,
        session(a.id, { flags: { "deal.changeOwner": true } }),
        { ids: [l1.id, l2.id], change: { ownerId: b.id } },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ updated: 2, skipped: 0 });
      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [l1.id, l2.id]));
      expect(rows.every((row) => row.ownerId === b.id)).toBe(true);
    });
  });

  it("rejects a bulk owner change without deal.changeOwner and leaves owners unchanged", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const l1 = await insertLead(db, a.id);

      const r = await bulkUpdateLeads(
        db,
        session(a.id), // only deal.create, not deal.changeOwner
        { ids: [l1.id], change: { ownerId: b.id } },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_PERM_001");
      const [row] = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [l1.id]));
      expect(row?.ownerId).toBe(a.id);
    });
  });

  it("sets labels across many leads", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const l1 = await insertLead(db, a.id);
      const l2 = await insertLead(db, a.id, { labels: ["cold"] });

      const r = await bulkUpdateLeads(
        db,
        session(a.id),
        { ids: [l1.id, l2.id], change: { labels: ["warm", "hot"] } },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.updated).toBe(2);
      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [l1.id, l2.id]));
      expect(rows.every((row) => row.labels.includes("warm") && row.labels.includes("hot"))).toBe(
        true,
      );
    });
  });

  it("archives many leads", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const l1 = await insertLead(db, a.id);
      const l2 = await insertLead(db, a.id);

      const r = await bulkUpdateLeads(
        db,
        session(a.id),
        { ids: [l1.id, l2.id], change: { archived: true } },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.updated).toBe(2);
      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [l1.id, l2.id]));
      expect(rows.every((row) => row.archivedAt !== null)).toBe(true);
    });
  });

  it("skips (and counts) ids the actor cannot see, without applying them", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const visible = await insertLead(db, other.id);
      const hidden = await insertLead(db, owner.id, { visibilityLevel: "owner" });

      const r = await bulkUpdateLeads(
        db,
        session(other.id),
        { ids: [visible.id, hidden.id], change: { archived: true } },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ updated: 1, skipped: 1 });

      const [hiddenAfter] = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [hidden.id]));
      // The invisible lead was NOT archived.
      expect(hiddenAfter?.archivedAt).toBeNull();
    });
  });
});
