import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { permissionSets } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
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

async function hydratedSession(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  flags: Record<string, boolean>,
) {
  const [set] = await db
    .insert(permissionSets)
    .values({ name: `ps-${Math.random().toString(36).slice(2)}`, flags })
    .returning();
  const user = await seedUser(db, { permissionSetId: set?.id });
  const actor = await hydrateActor(db, user.id, new AbortController().signal);
  if (actor === null) throw new Error("hydrate failed");
  const flagMap: Record<string, boolean> = {};
  for (const f of actor.flags) flagMap[f] = true;
  return session(user.id, { flags: flagMap });
}

describe("bulkUpdateLeads", () => {
  it("changes owner across many leads", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const l1 = await insertLead(db, a.id);
      const l2 = await insertLead(db, a.id);

      const r = await bulkUpdateLeads(
        db,
        await hydratedSession(db, { "deal.changeOwner_any": true }),
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
        session(a.id),
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
      expect(hiddenAfter?.archivedAt).toBeNull();
    });
  });
});

describe("bulkUpdateLeads: scoped changeOwner flags", () => {
  it("reassigns every visible lead for deal.changeOwner_any", async () => {
    await withTestDb(async (db) => {
      const actor = await hydratedSession(db, { "deal.changeOwner_any": true });
      const other = await seedUser(db);
      const target = await seedUser(db);
      const l1 = await insertLead(db, other.id);
      const l2 = await insertLead(db, actor.userId);
      const r = await bulkUpdateLeads(
        db,
        actor,
        { ids: [l1.id, l2.id], change: { ownerId: target.id } },
        sig(),
      );
      expect(r.ok && r.value).toEqual({ updated: 2, skipped: 0 });
    });
  });

  it("reassigns only the actor's own leads for deal.changeOwner_own", async () => {
    await withTestDb(async (db) => {
      const actor = await hydratedSession(db, { "deal.changeOwner_own": true });
      const other = await seedUser(db);
      const target = await seedUser(db);
      const mine = await insertLead(db, actor.userId);
      const theirs = await insertLead(db, other.id);
      const r = await bulkUpdateLeads(
        db,
        actor,
        { ids: [mine.id, theirs.id], change: { ownerId: target.id } },
        sig(),
      );
      expect(r.ok && r.value).toEqual({ updated: 1, skipped: 1 });
      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [mine.id, theirs.id]));
      expect(rows.find((x) => x.id === mine.id)?.ownerId).toBe(target.id);
      expect(rows.find((x) => x.id === theirs.id)?.ownerId).toBe(other.id);
    });
  });

  it("does not overwrite a lead reassigned concurrently when the actor may only move their own", async () => {
    await withTestDb(async (db) => {
      const actor = await hydratedSession(db, { "deal.changeOwner_own": true });
      const other = await seedUser(db);
      const target = await seedUser(db);
      const lead = await insertLead(db, actor.userId);

      let signalLocked!: () => void;
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reassigner = db.transaction(async (tx) => {
        await tx.update(leads).set({ ownerId: other.id }).where(eq(leads.id, lead.id));
        signalLocked();
        await held;
      });
      await locked;
      const bulk = bulkUpdateLeads(
        db,
        actor,
        { ids: [lead.id], change: { ownerId: target.id } },
        sig(),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await reassigner;
      const r = await bulk;

      expect(r.ok && r.value).toEqual({ updated: 0, skipped: 1 });
      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.ownerId).toBe(other.id);
    });
  });

  it("refuses a set with neither changeOwner flag", async () => {
    await withTestDb(async (db) => {
      const actor = await hydratedSession(db, { "deal.create": true });
      const target = await seedUser(db);
      const mine = await insertLead(db, actor.userId);
      const r = await bulkUpdateLeads(
        db,
        actor,
        { ids: [mine.id], change: { ownerId: target.id } },
        sig(),
      );
      expect(r.ok).toBe(false);
      const rows = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, [mine.id]));
      expect(rows[0]?.ownerId).toBe(actor.userId);
    });
  });
});
