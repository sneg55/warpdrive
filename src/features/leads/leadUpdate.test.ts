import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { permissionSets } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
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

describe("updateLead: field updates", () => {
  it("updates a trimmed title and reads it back", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id);

      const r = await updateLead(
        db,
        session(owner.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          title: "  Enterprise renewal  ",
        },
        sig(),
      );
      expect(r.ok).toBe(true);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.title).toBe("Enterprise renewal");
    });
  });

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

  it("updates labels and reads them back", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id, { labels: ["Cold"] });

      const r = await updateLead(
        db,
        session(owner.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          labels: ["Hot", "Warm"],
        },
        sig(),
      );
      expect(r.ok).toBe(true);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.labels).toEqual(["Hot", "Warm"]);
    });
  });

  it("clears labels when passed an empty array", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id, { labels: ["Hot"] });

      const r = await updateLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), labels: [] },
        sig(),
      );
      expect(r.ok).toBe(true);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.labels).toEqual([]);
    });
  });

  it("leaves labels untouched when the field is omitted", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id, { labels: ["Hot"] });

      const r = await updateLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), value: 42 },
        sig(),
      );
      expect(r.ok).toBe(true);

      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(after?.labels).toEqual(["Hot"]);
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

  it("reassigns ownerId when the actor holds deal.changeOwner_any", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db);
      const b = await seedUser(db);
      const lead = await insertLead(db, a.id);

      const r = await updateLead(
        db,
        await hydratedSession(db, { "deal.changeOwner_any": true }),
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
        session(a.id),
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

describe("updateLead: scoped changeOwner flags", () => {
  async function attempt(flags: Record<string, boolean>, leadOwnedByActor: boolean) {
    let outcome = { ok: false, reassigned: false };
    await withTestDb(async (db) => {
      const actor = await hydratedSession(db, flags);
      const other = await seedUser(db);
      const target = await seedUser(db);
      const lead = await insertLead(db, leadOwnedByActor ? actor.userId : other.id);
      const r = await updateLead(
        db,
        actor,
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), ownerId: target.id },
        sig(),
      );
      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
      outcome = { ok: r.ok, reassigned: after?.ownerId === target.id };
    });
    return outcome;
  }

  it("lets deal.changeOwner_any reassign a lead owned by someone else", async () => {
    expect(await attempt({ "deal.changeOwner_any": true }, false)).toEqual({
      ok: true,
      reassigned: true,
    });
  });

  it("lets deal.changeOwner_own reassign a lead the actor owns", async () => {
    expect(await attempt({ "deal.changeOwner_own": true }, true)).toEqual({
      ok: true,
      reassigned: true,
    });
  });

  it("refuses deal.changeOwner_own on a lead owned by someone else", async () => {
    expect(await attempt({ "deal.changeOwner_own": true }, false)).toEqual({
      ok: false,
      reassigned: false,
    });
  });

  it("refuses a set with neither changeOwner flag", async () => {
    expect(await attempt({ "deal.create": true }, true)).toEqual({ ok: false, reassigned: false });
  });
});
