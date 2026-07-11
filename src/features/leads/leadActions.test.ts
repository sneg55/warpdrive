import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { persons } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { archiveLead, createLead, type LeadSession } from "./leadActions";
import { listLeads } from "./leadRepo";

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

async function seedSettings(db: Parameters<Parameters<typeof withTestDb>[0]>[0], level = "all") {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: level, person: "all", organization: "all" },
  });
}

const sig = () => new AbortController().signal;

describe("createLead", () => {
  it("creates a manually-created lead owned by the creator", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const r = await createLead(
        db,
        session(u.id),
        { title: "Acme lead", value: 1200, labels: ["warm"], sourceChannel: "web_form" },
        sig(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const [row] = await db.select().from(leads).where(eq(leads.id, r.value.id));
      expect(row?.ownerId).toBe(u.id);
      expect(row?.visibilityLevel).toBe("all");
      expect(row?.value).toBe("1200.00");
      expect(row?.labels).toEqual(["warm"]);
      expect(row?.sourceChannel).toBe("web_form");
      expect(row?.sourceOrigin).toBe("manually_created");
      expect(row?.archivedAt).toBeNull();
    });
  });

  it("rejects a creator without deal.create", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const r = await createLead(db, session(u.id, { flags: {} }), { title: "No perm" }, sig());
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("refuses to attach a person the creator cannot see (no existence leak)", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (hidden === undefined) throw new Error("seed failed");

      const r = await createLead(
        db,
        session(other.id),
        { title: "Sneaky", personId: hidden.id },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_CONTACT_001");
      // The lead must not have been created.
      const rows = await db.select().from(leads);
      expect(rows).toHaveLength(0);
    });
  });

  it("ignores a client ownerId without deal.changeOwner, honors it with", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const creator = await seedUser(db);
      const target = await seedUser(db);
      const ignored = await createLead(
        db,
        session(creator.id),
        { title: "A", ownerId: target.id },
        sig(),
      );
      expect(ignored.ok && ignored.value).toBeTruthy();
      const honored = await createLead(
        db,
        session(creator.id, { flags: { "deal.create": true, "deal.changeOwner": true } }),
        { title: "B", ownerId: target.id },
        sig(),
      );
      expect(honored.ok).toBe(true);
      if (!ignored.ok || !honored.ok) return;
      const [a] = await db.select().from(leads).where(eq(leads.id, ignored.value.id));
      const [b] = await db.select().from(leads).where(eq(leads.id, honored.value.id));
      expect(a?.ownerId).toBe(creator.id);
      expect(b?.ownerId).toBe(target.id);
    });
  });
});

describe("archiveLead + listLeads", () => {
  it("archiving moves a lead from inbox to archived", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const created = await createLead(db, session(u.id), { title: "To archive" }, sig());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const inboxBefore = await listLeads(
        db,
        visSession(u.id),
        { filter: "inbox", offset: 0, limit: 100 },
        sig(),
      );
      expect(inboxBefore.rows.some((r) => r.id === created.value.id)).toBe(true);

      const arch = await archiveLead(
        db,
        session(u.id),
        { leadId: created.value.id, archived: true },
        sig(),
      );
      expect(arch.ok).toBe(true);

      const inboxAfter = await listLeads(
        db,
        visSession(u.id),
        { filter: "inbox", offset: 0, limit: 100 },
        sig(),
      );
      const archived = await listLeads(
        db,
        visSession(u.id),
        { filter: "archived", offset: 0, limit: 100 },
        sig(),
      );
      expect(inboxAfter.rows.some((r) => r.id === created.value.id)).toBe(false);
      expect(archived.rows.some((r) => r.id === created.value.id)).toBe(true);
    });
  });

  it("hides an owner-visibility lead from a different regular user", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db, "owner");
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const created = await createLead(db, session(owner.id), { title: "Private lead" }, sig());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const ownerView = await listLeads(
        db,
        visSession(owner.id),
        { filter: "inbox", offset: 0, limit: 100 },
        sig(),
      );
      const otherView = await listLeads(
        db,
        visSession(other.id),
        { filter: "inbox", offset: 0, limit: 100 },
        sig(),
      );
      expect(ownerView.rows.some((r) => r.id === created.value.id)).toBe(true);
      expect(otherView.rows.some((r) => r.id === created.value.id)).toBe(false);
    });
  });

  it("refuses to archive a lead the actor cannot see", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db, "owner");
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const created = await createLead(db, session(owner.id), { title: "Hidden" }, sig());
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const r = await archiveLead(
        db,
        session(other.id),
        { leadId: created.value.id, archived: true },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_LEAD_001");
    });
  });
});
